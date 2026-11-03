"""Builds questions.json from local ClickHouse (read-only, gateway_reader).

    uv run --no-project scripts/agent-search/build-questions.py [out.json]

Recall, survey, investigative and ambiguous keys are hand-curated below; person-centric
and time-bounded keys are recomputed from SQL on every run. Fails if a key id is missing.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

CH = 'http://127.0.0.1:8123/?' + urllib.parse.urlencode(
    {'database': 'community_archive', 'user': 'gateway_reader', 'password': 'local-gateway-reader'}
)
CAP = 200
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questions.json')


def ids(sql):
    req = urllib.request.Request(CH, data=(sql + ' FORMAT TSV').encode())
    with urllib.request.urlopen(req) as res:
        return [line for line in res.read().decode().splitlines() if line]


def any_of(terms):
    return '(' + ' OR '.join(f"positionCaseInsensitive(full_text, '{t}') > 0" for t in terms) + ')'


def exhaustive(where):
    # Fetch CAP + 1 to know whether the cap was hit.
    return (
        'SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND '
        + where
        + f' ORDER BY created_at, tweet_id LIMIT {CAP + 1}'
    )


questions = []


def exact_sql(qid, cls, question, where, notes):
    sql = exhaustive(where)
    found = ids(sql)
    capped = len(found) > CAP
    found = found[:CAP]
    note = notes + f' Key = every non-retweet matching the SQL ({len(found)} ids'
    note += f', capped at {CAP}; more exist).' if capped else ').'
    questions.append({
        'id': qid, 'class': cls, 'question': question, 'keyType': 'exact',
        'tweetIds': found, 'sql': sql.replace(f'LIMIT {CAP + 1}', f'LIMIT {CAP}'),
        'capped': capped, 'notes': note,
    })


def add(qid, cls, question, key_type, tweet_ids, notes, **extra):
    questions.append({'id': qid, 'class': cls, 'question': question, 'keyType': key_type,
                      'tweetIds': tweet_ids, **extra, 'notes': notes})


# recall-a-tweet: >= 20 likes, >= 12 words, not replies, no quote, no link; paraphrased.
RECALL_SQL = (
    "SELECT tweet_id FROM tweets_serving WHERE tweet_id = '{id}' AND is_retweet = 0 "
    'AND reply_to_tweet_id IS NULL AND favorite_count >= 20 '
    'AND length(splitByWhitespace(full_text)) >= 12'
)
recall = [
    ('recall-psychedelics-lottery', '1621283724871741440',
     'Someone compared taking psychedelics to a lottery that works backwards: it will probably help you, but there is a small chance it ruins your life. Find that tweet.',
     'Exact phrase in the tweet is rare (1 match locally); the paraphrase avoids it.'),
    ('recall-future-historians', '1551053933480648710',
     'Who tweeted that they were jealous of historians in the far future because those historians will have more eras of history to study?',
     'Author is a heavy poster; the phrase "future historians" has ~75 local matches, so the agent must pick the right one.'),
    ('recall-greece-shadow-library', '1533460025456435200',
     'I remember a tweet saying that internet providers in Greece are legally required to block a well-known shadow library for books. Can you find it?',
     'Only match for libgen + greek locally; the question names neither word.'),
    ('recall-french-coffee', '1666521591445061632',
     'Find the post where someone joked that they let down the people of France whenever they skip one more coffee course at the end of an already very long dinner.',
     '11 local tweets mention coffee and France; the tweet text uses the words in a different form.'),
    ('recall-south-korea-culture', '1595451979760820226',
     'Someone was amazed at how much culture South Korea produces per person and guessed it comes from a sweet spot between repression and individual expression. Which tweet was that?',
     '23 local tweets mention South Korea and culture.'),
]
for qid, tid, q, note in recall:
    assert ids(RECALL_SQL.format(id=tid)) == [tid], qid
    add(qid, 'recall-a-tweet', q, 'exact', [tid],
        note + ' Metric: the id is cited (best) or at least appears in a tool result.',
        sql=RECALL_SQL.format(id=tid))

# survey: partial keys hand-picked from small candidate pools.
add('survey-opt-in-campaign', 'survey',
    'How did people react to the campaign where liking or replying to a tweet opted you in to the Community Archive?',
    'partial',
    ['2085447310574793145', '2085605395024802268', '2085548109099352550', '2085484500025581820',
     '2085594131393282122', '2085448436711866829', '2085641102703448568', '2085620812438999114',
     '2085707350162243888', '2092387869948260608', '2098558581729870299'],
    'Pool: replies and quotes of the campaign tweet 2085447310574793145 and the opt-out follow-up 2092387869948260608 '
    "via edges_serving (40 rows by likes), plus non-retweets since 2026-07-15 matching opt[ -]?(in|out) and 'archive'. "
    'Kept: the campaign tweet and posts that react to it (endorse, joke, question, object, ask for an opt-out). '
    'Dropped: bare "me!"/"yes" replies and generic opt-in plugs.',
    poolSql="SELECT t.tweet_id FROM edges_serving e JOIN tweets_serving t ON t.tweet_id = e.tweet_id "
            "WHERE e.related_tweet_id IN ('2085447310574793145', '2092387869948260608') ORDER BY t.favorite_count DESC LIMIT 40")
add('survey-substack-notes', 'survey',
    'What do people think of Substack Notes as an alternative to Twitter?',
    'partial',
    ['2059324289254593003', '2014839008552173701', '1727838300478820756', '2020242911083073605',
     '1892182934854963214', '2053576509995331615', '2013394451234709920', '1646037322876551168',
     '2059748086088655167'],
    "Pool: top 14 non-reply, non-retweet tweets by likes containing 'substack notes'. Kept the ones that state an "
    'opinion of Notes as a feed or Twitter alternative (for and against). Dropped image-only and pure link posts.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL "
            "AND positionCaseInsensitive(full_text, 'substack notes') > 0 ORDER BY favorite_count DESC LIMIT 14")
add('survey-jhanas', 'survey',
    'What have people here said about practicing the jhanas? Is it worth it?',
    'partial',
    ['1751870069502603453', '1921595942102335735', '1858655752434377042', '1795589996612911124',
     '1587553704734912512', '1585719401214459904', '1940105679936651699'],
    "Pool: top 14 non-reply tweets by likes containing 'jhana'. Kept first-person reports and opinions on the practice "
    '(including one negative view). Dropped an image-only post and a joke about Claude and shrimp.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL "
            "AND positionCaseInsensitive(full_text, 'jhana') > 0 ORDER BY favorite_count DESC LIMIT 14")
add('survey-ketamine', 'survey',
    'What do people say about ketamine, both as therapy and as a recreational drug?',
    'partial',
    ['1892255057711624578', '1567163042701447169', '1964769667073102290', '1975577370510999991',
     '1824900470235942963'],
    "Pool: top 14 non-reply tweets by likes containing 'ketamine'. Kept posts whose point is ketamine itself "
    '(therapy experiences, harm warnings). Dropped jokes and posts that only list it among other drugs.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL "
            "AND positionCaseInsensitive(full_text, 'ketamine') > 0 ORDER BY favorite_count DESC LIMIT 14")
add('survey-roam-research', 'survey',
    'What have people said about Roam Research?',
    'partial',
    ['1841037081444860391', '1454789217280790530', '1600701544873480192', '1335993287098781698',
     '1272585096772517888'],
    "Pool: top 14 non-reply tweets by likes containing 'roam research'. Kept opinions and experiences of the tool "
    '(abandonware worry, move to Logseq, backlinks praise, self-therapy use, a joke about it). Dropped passing mentions.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL "
            "AND positionCaseInsensitive(full_text, 'roam research') > 0 ORDER BY favorite_count DESC LIMIT 14")

# investigative
add('investigative-ca-critics', 'investigative',
    'Who has complained or criticized the community archive?',
    'partial',
    ['1901827785213219316', '1901827609958453265', '1901828853758373994', '1901829291622506985',
     '1856571329274654929', '1856573525865234629', '2085594131393282122', '2085448436711866829',
     '2056460202073903331', '2056830229834805522', '1843004382696321150', '1864386843887980625',
     '1874612569832649036', '2094479237348765986', '2009710345917747395', '2093014348771758485',
     '1955189631097426147'],
    'Benchmark. Member-authored genuine complaints from research/pilot/findings.md. Omitted the three non-member ids '
    '(a_musingcat 2065928794012365162, inflammateomnia 2088330398522548390, tautologer 2093541457420537857) and '
    'trangquest 2090784720879570958, which is absent from the local export. Weaker signals in findings.md are not in the key.')
add('investigative-opt-in-pushback', 'investigative',
    'Who pushed back on the like-to-opt-in campaign for the Community Archive, and how did the organizer respond?',
    'partial',
    ['2085594131393282122', '2085448436711866829', '2085595849967722749', '2098520359725338806',
     '2092387869948260608'],
    'Objections (goblinodds: feels pressuring; br___ian: wants a like-to-opt-out) and the replies from exgenesis to '
    'each, plus the opt-out tweet he posted. Found by walking replies to the campaign tweet and to the two objections '
    'in edges_serving.')
add('investigative-ca-defenders', 'investigative',
    'When people criticized the Community Archive, who defended it or corrected them?',
    'partial',
    ['2071685253576437909', '2064432692096348362', '1902007844452646951', '1902031658834165786',
     '1901899897751622086', '2085595849967722749', '1856644976211300353', '1843007017855951080'],
    'Pool: replies and quotes to the benchmark critic tweets (edges_serving), plus the two rebuttals named in '
    'findings.md (kidcorvid to a_musingcat, workflowsauce to ianlilleyt). Kept replies that rebut, correct or answer '
    'the criticism. Several parents are non-member tweets the agent cannot see.',
    poolSql="SELECT t.tweet_id FROM edges_serving e JOIN tweets_serving t ON t.tweet_id = e.tweet_id "
            "WHERE e.related_tweet_id IN ('1901827785213219316', '1901829291622506985', '1856573525865234629', "
            "'2085594131393282122', '1843004382696321150') LIMIT 60")
add('investigative-ai-moral-status', 'investigative',
    'Who has argued about whether AI models are sentient or deserve moral consideration, and what positions did they take?',
    'partial',
    ['1627474041396142082', '2105737449850941717', '2046375656108478557', '1794447232441159985',
     '2060193062215692344', '1906333248545767636', '2106482107220664493', '1535872998686838784'],
    "Pool: top 20 non-reply tweets by likes containing 'model welfare', 'moral patient', or 'sentien' with an AI word; "
    'plus 2106482107220664493 from a random sample. Kept posts that take a position on AI sentience or moral status. '
    'Dropped fiction, metaphors and posts where sentience is incidental.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL AND "
            "(positionCaseInsensitive(full_text, 'model welfare') > 0 OR positionCaseInsensitive(full_text, 'moral patient') > 0 "
            "OR (positionCaseInsensitive(full_text, 'sentien') > 0 AND (positionCaseInsensitive(full_text, 'AI ') > 0 "
            "OR positionCaseInsensitive(full_text, 'LLM') > 0 OR positionCaseInsensitive(full_text, 'claude') > 0))) "
            'ORDER BY favorite_count DESC LIMIT 20')
add('investigative-moved-to-bluesky', 'investigative',
    'Which members said they were moving to Bluesky or asked people to follow them there?',
    'partial',
    ['1645128733798309888', '1644829870294437888', '1683487377853915136', '2060244178467188901',
     '1645665532522401794', '1829706094525940042', '1973117016925151436', '1645504013172084738',
     '1651783991450632194'],
    "Pool: top 20 non-reply tweets by likes containing 'bluesky' and a move phrase (leaving, moving to, moved to, "
    "switching, i'm on bluesky, find me on, follow me on, see you on). Kept first-person announcements and follow-me "
    'posts. Dropped commentary about other people moving.',
    poolSql="SELECT tweet_id FROM tweets_serving WHERE is_retweet = 0 AND reply_to_tweet_id IS NULL AND "
            "positionCaseInsensitive(full_text, 'bluesky') > 0 AND match(lower(full_text), "
            "'(leaving|moving to|moved to|switching|i.m on bluesky|find me on|follow me on|see you on)') "
            'ORDER BY favorite_count DESC LIMIT 20')

# person-centric: exhaustive lexical keys by username.
person = [
    ('person-patio11-stablecoins', 'What has @patio11 said about stablecoins?', 'patio11', ['stablecoin']),
    ('person-ultimape-ca', 'What has @ultimape said about the Community Archive?', 'ultimape',
     ['community archive', 'comm_archive', 'communityarchive']),
    ('person-thezvi-prediction-markets', 'What has @TheZvi said about prediction markets?', 'TheZvi',
     ['prediction market', 'polymarket', 'kalshi']),
    ('person-qiaochu-circling', 'What has @QiaochuYuan said about circling, the relational practice?', 'QiaochuYuan',
     ['circling']),
    ('person-nathanpmyoung-glp1', 'What has @NathanpmYoung said about GLP-1 drugs like Ozempic?', 'NathanpmYoung',
     ['ozempic', 'semaglutide', 'glp-1', 'glp1', 'tirzepatide', 'mounjaro', 'wegovy', 'zepbound']),
]
for qid, q, user, terms in person:
    exact_sql(qid, 'person-centric', q, f"username = '{user}' AND " + any_of(terms),
              f'Substring match on {terms}, replies included. Lexical truth: some matches may be off-topic, and on-topic '
              'posts that use none of the words are missing, so a cited id outside the key is not necessarily wrong.')

# time-bounded: exhaustive lexical keys by month (UTC).
months = [
    ('time-ca-march-2025', 'What did people say about the Community Archive in March 2025?', '2025-03-01', '2025-04-01',
     ['community archive', 'comm_archive', 'communityarchive']),
    ('time-crowdstrike-july-2024', 'What were people saying about the CrowdStrike outage in July 2024?', '2024-07-01',
     '2024-08-01', ['crowdstrike']),
    ('time-lk99-august-2023', 'What did people say about the LK-99 superconductor claims in August 2023?', '2023-08-01',
     '2023-09-01', ['lk-99', 'lk99']),
    ('time-altman-november-2023', 'What did people say about Sam Altman being fired and rehired at OpenAI in November 2023?',
     '2023-11-01', '2023-12-01', ['altman', 'openai board']),
    ('time-bluesky-november-2024', 'What were people saying about Bluesky in November 2024?', '2024-11-01', '2024-12-01',
     ['bluesky']),
]
for qid, q, since, until, terms in months:
    exact_sql(qid, 'time-bounded', q,
              f"created_at >= '{since}' AND created_at < '{until}' AND " + any_of(terms),
              f'Substring match on {terms} within [{since}, {until}) UTC, replies included. Lexical truth (see person-centric note).')

# ambiguous-term: judged expectations.
add('ambiguous-ca', 'ambiguous-term', 'What do people mean by CA?', 'judged',
    ['1993223787412599122', '1961022814682558797', '2085548911549387201'],
    "Resolve: in this archive 'CA' is mostly California but also the Community Archive's own shorthand. A good answer "
    'names both senses with examples (ids are Community Archive usages) and does not ask first.',
    expect='resolve')
add('ambiguous-circles', 'ambiguous-term', 'What have people said about circles?', 'judged',
    ['1901827785213219316'],
    'Clarify: Twitter Circles (the private-audience feature, central to the archive privacy incident), circling (the '
    'relational practice), and social circles are all common (6k+ matches). Pass if it asks which, or states the senses '
    'and which one it answered.',
    expect='clarify')
add('ambiguous-the-archive', 'ambiguous-term', 'What do people think about the archive?', 'judged', [],
    'Resolve: in this product "the archive" means the Community Archive; the agent should say it assumed that '
    '(other senses: the Internet Archive, personal Twitter archive downloads) and answer.',
    expect='resolve')
add('ambiguous-the-merger', 'ambiguous-term', 'What happened with the merger?', 'judged', [],
    "Clarify: no referent; 'merger' has 400+ local matches across unrelated companies. Pass if it asks which merger, "
    'or lists the main candidates and asks.',
    expect='clarify')
add('ambiguous-tpot', 'ambiguous-term', 'What is TPOT?', 'judged',
    ['1738390210264654294', '1847706090529493347', '1836110221946536397', '1854425141612020192'],
    "Resolve: TPOT means 'this part of Twitter', the community most members belong to. A good answer defines it from "
    'members\' own descriptions with citations (ids are examples, including a joke expansion).',
    expect='resolve')

counts = {}
for q in questions:
    counts[q['class']] = counts.get(q['class'], 0) + 1
assert len(questions) == 30 and all(v == 5 for v in counts.values()), counts
assert len({q['id'] for q in questions}) == 30

# Every key id must exist locally.
all_ids = sorted({i for q in questions for i in q['tweetIds']})
found = set()
for start in range(0, len(all_ids), 500):
    chunk = all_ids[start:start + 500]
    found |= set(ids('SELECT tweet_id FROM tweets_serving WHERE tweet_id IN (' + ','.join(f"'{i}'" for i in chunk) + ')'))
missing = [i for i in all_ids if i not in found]
assert not missing, missing

doc = {
    'version': 1,
    'builtAt': '2026-10-08',
    'source': 'local ClickHouse community_archive.tweets_serving (public export 2026-10-08T07-04-12Z, members only)',
    'questions': questions,
}
with open(OUT, 'w') as f:
    json.dump(doc, f, indent=2)
    f.write('\n')
for q in questions:
    print(q['id'], q['keyType'], len(q['tweetIds']), 'CAPPED' if q.get('capped') else '')
print(counts)
