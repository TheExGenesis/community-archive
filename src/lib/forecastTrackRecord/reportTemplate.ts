/**
 * The forecast track record report page, copied from the control-panel
 * prototype (scripts/reference/track_record/render_html.py, PAGE). The data
 * goes in place of __DATA__ as JSON. The page's own CSP allows no network
 * requests: avatars are data URIs and every link opens elsewhere.
 *
 * Keep this in step with render_html.py when the prototype's page changes.
 */
export const REPORT_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>Forecast track record</title>
<style>
:root{--bg:#fbfaf7;--panel:#fff;--ink:#1d1d1b;--muted:#6b6a65;--line:#e5e2da;--accent:#2f5d8a;--hover:#f2efe8;
 --yes-bg:#e3f1e6;--yes:#1f6b35;--no-bg:#f8e2df;--no:#9b2c1f;--un-bg:#eeedea;--un:#5c5b57;--amb-bg:#f6edd7;--amb:#80600f;}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#151514;--panel:#1e1e1c;--ink:#ecebe6;--muted:#a09e97;--line:#33322f;--accent:#8db8e3;--hover:#262624;
 --yes-bg:#1d3324;--yes:#8fd3a2;--no-bg:#3a1f1b;--no:#f0a397;--un-bg:#2a2a28;--un:#b5b3ad;--amb-bg:#352c16;--amb:#e3c77a;}}
:root[data-theme="dark"]{--bg:#151514;--panel:#1e1e1c;--ink:#ecebe6;--muted:#a09e97;--line:#33322f;--accent:#8db8e3;--hover:#262624;
 --yes-bg:#1d3324;--yes:#8fd3a2;--no-bg:#3a1f1b;--no:#f0a397;--un-bg:#2a2a28;--un:#b5b3ad;--amb-bg:#352c16;--amb:#e3c77a;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px}
.sub{color:var(--muted);margin:0 0 16px;font-size:14px}
a{color:var(--accent)}
header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
button.theme{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:13px}
.funnel{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin:16px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.stat b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.stat span{color:var(--muted);font-size:12.5px}
.wrap{overflow:auto;max-height:70vh;background:var(--panel);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}
th,td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
th:nth-child(2),td:nth-child(2){text-align:left}
td:nth-child(2){white-space:nowrap}
th{cursor:pointer;user-select:none;color:var(--muted);font-weight:600;font-size:12.5px;position:sticky;top:0;background:var(--panel)}
th[aria-sort="ascending"]::after{content:" ▲"}th[aria-sort="descending"]::after{content:" ▼"}
tbody tr{cursor:pointer}tbody tr:hover,tbody tr.sel{background:var(--hover)}
tr:last-child td{border-bottom:0}
tr.tier td{text-align:left;color:var(--muted);font-size:12.5px;font-weight:600;background:var(--hover);cursor:default}
tr.prov td{color:var(--muted)}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
.controls input,.controls select{font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}
.controls input[type=search]{flex:1 1 220px}
.chip{display:inline-flex;gap:6px;align-items:center;background:var(--hover);border-radius:999px;padding:4px 10px;font-size:13px}
.chip button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:13px;margin-bottom:6px;align-items:center}
.claim{font-size:15px;margin:0 0 6px}
.badge{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600}
.b-yes{background:var(--yes-bg);color:var(--yes)}.b-no{background:var(--no-bg);color:var(--no)}
.b-unresolved,.b-unjudged{background:var(--un-bg);color:var(--un)}.b-ambiguous{background:var(--amb-bg);color:var(--amb)}
.note{color:var(--muted);font-size:13.5px;margin:4px 0 0}
details{margin-top:6px;font-size:13.5px}summary{cursor:pointer;color:var(--muted)}
.tweet{white-space:pre-wrap;border-left:3px solid var(--line);padding:4px 10px;margin:6px 0;color:var(--ink)}
.author{background:none;border:0;padding:0;color:var(--accent);cursor:pointer;font:inherit}
.empty{color:var(--muted);padding:16px;text-align:center}
.legend{color:var(--muted);font-size:13px;margin:8px 0 0}
.av{width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px;object-fit:cover;background:var(--line);display:inline-block}
span.av{font-size:11px;line-height:22px;text-align:center;color:var(--muted)}
.profile{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;margin:0 0 12px}
.profile .big{width:64px;height:64px;border-radius:50%;flex:none;object-fit:cover;background:var(--line)}
.profile h3{margin:0;font-size:17px}.profile .handle{color:var(--muted);font-size:14px}
.profile .bio{margin:6px 0;white-space:pre-wrap}.profile .facts{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:4px 14px}
.profile .facts b{color:var(--ink)}
.profile .clr{margin-left:auto;background:none;border:1px solid var(--line);border-radius:8px;color:var(--muted);cursor:pointer;padding:2px 8px;font:inherit;flex:none}
.chartwrap{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 6px;overflow-x:auto}
#ridge{display:block;width:100%;min-width:520px;height:auto}
#ridge text{fill:var(--ink);font-size:12px}#ridge .muted{fill:var(--muted);font-size:11px}
#ridge .axis{stroke:var(--line)}#ridge .svy{fill:none;stroke:var(--ink);stroke-width:1.4;stroke-dasharray:4 3;opacity:.75}
.method{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0 0}
.method>summary{font-weight:600;color:var(--ink);font-size:15px}
.method ol{padding-left:20px;margin:10px 0 4px}.method li{margin:0 0 12px;max-width:72ch}
.method b{font-variant-numeric:tabular-nums}.method .gap{color:var(--muted);font-size:13.5px;display:block;margin-top:3px}
</style>
</head>
<body>
<main>
<header>
 <div><h1>Forecast track record</h1>
 <p class="sub" id="sub"></p></div>
 <button class="theme" id="theme" type="button" aria-label="Toggle colour theme">Theme</button>
</header>
<section class="funnel" id="funnel" aria-label="Funnel counts"></section>

<details class="method" id="method"><summary>How this works: every filter from tweet to score</summary><div id="methodBody"></div></details>

<h2 id="wordsh">What confidence words delivered</h2>
<div class="chartwrap"><svg id="ridge" role="img" aria-label="Ridgeline chart: how often claims with each confidence word came true, against how survey respondents read the word"></svg></div>
<p class="legend" id="ridgelegend"></p>

<h2>Leaderboard</h2>
<div class="wrap"><table id="lb"><thead><tr>
 <th data-k="rank">#</th><th data-k="author">Author</th><th data-k="points">Points</th><th data-k="hits">Hits</th><th data-k="n">n</th>
 <th data-k="hit_rate">Hit rate (80% CI)</th><th data-k="mean_brier">Mean Brier</th><th data-k="skill">Skill</th><th data-k="ambiguous_rate" title="Share of this author's judged forecasts the judge found too vague, joke-like or unsettleable">Ambiguous</th><th data-k="mean_edge_vs_market">Edge vs market</th>
</tr></thead><tbody></tbody></table></div>
<p class="legend">Points = Σ(0.25 − Brier) over due, resolved claims: Brier points above a coin flip. Confident wrong calls subtract.
Skill = 1 − shrunk Brier / 0.25. Ambiguous = share of the author's judged forecasts the judge could not settle because they were vague, jokes or plans. Edge vs market = market Brier − author Brier where a market price at posting is known. Authors with fewer scored calls than the ranking minimum are listed below the divider as provisional. Click a row to see all of that author's forecasts.</p>

<h2 id="fh">Forecasts</h2>
<div class="controls">
 <input type="search" id="q" placeholder="Search claims, tweets, authors" aria-label="Search">
 <select id="dom" aria-label="Domain"><option value="">All domains</option></select>
 <select id="out" aria-label="Outcome"><option value="">All outcomes</option><option>yes</option><option>no</option><option>unresolved</option><option>ambiguous</option><option value="unjudged">not judged</option></select>
 <select id="due" aria-label="Deadline"><option value="">Any deadline</option><option value="1">Deadline passed</option><option value="0">Deadline not passed</option></select>
</div>
<div id="active"></div>
<div id="list"></div>
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
(function(){
const D = JSON.parse(document.getElementById('data').textContent);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
const safeUrl = u => /^https?:\\/\\//i.test(u || '') ? u : null;
const prof = a => (D.profiles || {})[(a || '').toLowerCase()];
const avatar = (a, cls = 'av') => { const p = prof(a); const src = p && p.av && p.av.startsWith('data:image/') ? p.av : null;
  return src ? \`<img class="\${cls}" src="\${src}" alt="">\` : \`<span class="\${cls}">\${esc((a || '?')[0].toUpperCase())}</span>\`; };

// theme
const root = document.documentElement;
try { const t = localStorage.getItem('tr-theme'); if (t) root.dataset.theme = t; } catch (e) {}
$('#theme').onclick = () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('tr-theme', root.dataset.theme); } catch (e) {}
};

$('#sub').textContent = \`Scored as of \${D.as_of || 'n/a'}. Only claims whose deadline has passed count toward the leaderboard (min n = \${D.min_n}\` +
  (D.min_judge_confidence ? \`, judge confidence ≥ \${D.min_judge_confidence}\` : '') + ').' +
  (D.recalibrated === 'both' ? ' Implied probabilities are recalibrated on the LLM\\'s reading of the tweet plus its confidence word, fitted on other authors\\' outcomes; stated numbers are kept.'
    : D.recalibrated === 'words' ? ' Implied probabilities are replaced by how often other authors\\' claims with the same confidence word came true; stated numbers are kept.'
    : D.recalibrated ? ' Implied probabilities are recalibrated against how often similarly worded claims by other authors came true; stated numbers are kept.' : '') +
  (D.spread ? \` Spread test: among \${D.spread.authors} authors with ≥ \${D.spread.min_n} scored claims, shuffled outcomes produce at least this much spread \${Math.round(D.spread.p_value * 100)}% of the time.\` : '');
$('#funnel').innerHTML = Object.entries(D.funnel).map(([k, v]) =>
  \`<div class="stat"><b>\${esc(typeof v === 'number' ? v.toLocaleString() : v)}</b><span>\${esc(k)}</span></div>\`).join('');

// method
(() => {
  const m = D.method, f = D.funnel, n = x => (typeof x === 'number' ? x.toLocaleString() : esc(x ?? '–'));
  const A = D.audit || {}, P = x => (x * 100).toFixed(1).replace(/\\.0$/, '') + '%';
  const ci = c => \`95% CI \${P(c[0])}–\${P(c[1])}\`;
  const v = (k, verdict) => A[k] && A[k].verdicts[verdict];
  const meas = html => html ? \`<span class="gap"><b>Measured\${A.scope ? \` on \${esc(A.scope)}\` : ''}:</b> \${html}</span>\` : '';
  const recallLine = (A.recall || []).map(r => \`\${esc(r.label)}: \${r.with_forecast} of \${r.sampled} sampled tweets were forecasts (\${P(r.rate)}, \${ci(r.ci95)}), so about \${n(r.projected)} (\${n(r.projected_ci95[0])}–\${n(r.projected_ci95[1])}) forecasts are dropped here.\`).join(' ');
  const fc = A.forecast ? \`\${A.forecast.labeled} extracted forecasts checked by a second reader: \${P(v('forecast','forecast').rate)} genuine (\${ci(v('forecast','forecast').ci95)}); jokes \${P(v('forecast','joke').rate)}, too vague \${P(v('forecast','vague').rate)}, misread \${P(v('forecast','misread').rate)}, other non-forecasts \${P(1 - v('forecast','forecast').rate - v('forecast','joke').rate - v('forecast','vague').rate - v('forecast','misread').rate)}.\` : '';
  const ea = A.early ? \`\${A.early.labeled} not-yet-due forecasts researched: \${P(v('early','already_yes').rate)} already came true and \${P(v('early','already_no').rate)} already became impossible (about \${n(v('early','already_yes').projected + v('early','already_no').projected)} of \${n(A.early.population)}); \${P(v('early','open').rate)} are still open and \${P(v('early','ambiguous').rate)} too vague to tell.\` : '';
  const va = A.vague ? \`\${A.vague.labeled} of these vague, never-judged claims researched anyway: \${P(v('vague','yes').rate + v('vague','no').rate)} could be settled yes or no (about \${n(v('vague','yes').projected + v('vague','no').projected)} claims the gate discards), \${P(v('vague','unresolved').rate)} found no evidence, \${P(v('vague','ambiguous').rate)} truly too vague.\` : '';
  const rj = A.rejudge ? \`\${A.rejudge.labeled} judged claims re-judged blind: exact agreement \${P(A.rejudge.agreement.rate)} (\${ci(A.rejudge.agreement.ci95)}); yes and no flipped in \${A.rejudge.agreement.yes_no_flips} of \${A.rejudge.agreement.yes_no_both} cases where both judges were decisive. Most disagreement is ambiguous vs unresolved.\` : '';
  const fk = k => Object.keys(f).find(x => x.startsWith(k));
  $('#methodBody').innerHTML = \`<ol>
  <li><b>Top-level tweets only.</b> From the consent-filtered public export: no replies, no retweets, no text starting with "@", at least 40 characters without links.
   \${fk('Top-level') ? \`<b>\${n(f[fk('Top-level')])}</b> tweets.\` : ''}</li>
  <li><b>Keyword prefilter decides what the LLM reads.</b> Each tweet gets a score: +3 per strong marker ("I predict", "calling it", "bet", "N% chance", "by 2027", "within 6 months"), +2 per loose marker ("my guess", "I suspect", "I think … will", "doomed", "bubble", "someday"), +1 per future word ("will", "gonna", "likely", "soon", up to 2), +1 for touching any broad topic; −2 for personal plans ("I'm going to try", "I'll post") and for ending in "?". Tweets without any future or forecast language score 0 or less.
   \${fk('Labeled') ? \`<b>\${n(f[fk('Labeled')])}</b> tweets cleared the cutoff and were sent to the LLM (\${esc(fk('Labeled'))}).\` : ''}
   <span class="gap">Gap: forecasts phrased without future words never reach the LLM.</span>\${meas(recallLine)}</li>
  <li><b>An LLM (Jev router) decides what counts as a forecast.</b> A forecast is a claim about the external world at a later time that a third party could check. It excludes personal plans, jokes and sarcasm, role-play, normative claims ("we should"), unfalsifiable vibes ("AI will change everything"), statements about the present or past, quoted predictions the author doesn't endorse, and questions. For each forecast it writes a self-contained claim, a deadline, the author's confidence p and a specificity score from 0 (vague) to 3 (crisp).
   \${fk('Tweets with') ? \`<b>\${n(f[fk('Tweets with')])}</b> tweets had a forecast; \` : ''}<b>\${n(m.claims)}</b> forecasts in total.
   <span class="gap">Gap: the LLM leans toward counting jokes and present-tense statements.</span>\${meas(fc)}</li>
  <li><b>Deadline.</b> If the tweet names a date or horizon ("by 2025", "next year"), that becomes the deadline. Otherwise the LLM picks a reasonable one and marks it inferred. A claim is <i>due</i> when its deadline is on or before \${esc(D.as_of)}.
   <b>\${n(m.inferred)}</b> of \${n(m.claims)} deadlines were inferred; <b>\${n(m.no_deadline)}</b> had none and can never be scored; <b>\${n(m.due)}</b> are due.
   <span class="gap">Gap: most deadlines are the model's guess, so "due" depends on that guess, and forecasts settled before their deadline wait.</span>\${meas(ea)}</li>
  <li><b>What goes to the judge.</b> Every due claim with specificity ≥ 2 ("checkable with judgement" or "crisp"), and in some runs the vaguer ones too. <b>\${n(m.judged)}</b> were judged; <b>\${n(m.due_unjudged)}</b> due claims were never judged.
   <span class="gap">Gap: vague forecasts are never scored, so an author who only makes vague calls cannot lose points.</span>\${meas(va)}</li>
  <li><b>The judge does live web research.</b> Claude agents with web search, at most two searches per claim. A yes or no requires a source found by a search in that session and is cited as the evidence link. Claims that turn out to be jokes, plans or too vague are marked <i>ambiguous</i> without searching (<b>\${n(m.amb_no_search)}</b> of them). <i>Unresolved</i> means the search found nothing decisive (<b>\${n(m.unres)}</b>, \${n(m.unres_no_ev)} with no source at all); a longer search could settle some of these. Agents sometimes filled a detail from memory; they say so in the note and lower their confidence.\${meas(rj)}</li>
  <li><b>What is scored.</b> Due claims resolved yes or no\${m.min_judge_confidence ? \` with judge confidence ≥ \${m.min_judge_confidence}\` : ''}, minus claims whose outcome was already public when they were posted (<b>\${n(m.known)}</b> found by a dated-source check of every scored YES): <b>\${n(m.scored)}</b> of \${n(m.yes_no_due)}. Brier = (p − outcome)²; points = Σ(0.25 − Brier), so confident wrong calls cost up to 0.75 each and confident right ones earn up to 0.25.\${D.recalibrated ? ' Implied p is first mapped to how often similarly worded claims by other authors came true.' : ''}</li>
  </ol>\`;
})();

// ridgeline: how often each confidence word came true vs how people read it
(() => {
  const W = (D.words || []).filter(r => r.n >= 3 && r.word !== 'stated %');
  const svg = $('#ridge');
  if (!W.length) { $('#wordsh').style.display = 'none'; svg.parentNode.style.display = 'none'; return; }
  const L = 150, R = 20, top = 52, step = 36, amp = 42, width = 760, plotW = width - L - R;
  const height = top + step * (W.length - 1) + 40;
  svg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);
  const X = x => L + x * plotW;
  const xs = Array.from({length: 201}, (_, i) => i / 200);
  const betaCurve = (k, n) => {  // posterior Beta(1+k, 1+n-k), scaled to peak 1
    const lg = xs.map(x => (x <= 0 || x >= 1) ? NaN : k * Math.log(x) + (n - k) * Math.log(1 - x));
    const m = Math.max(...lg.filter(v => !Number.isNaN(v)));
    return lg.map(v => Number.isNaN(v) ? 0 : Math.exp(v - m));
  };
  const kde = vals => {
    const bw = 0.045, ys = xs.map(x => vals.reduce((t, v) => t + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0));
    const m = Math.max(...ys); return ys.map(y => y / m);
  };
  const path = (ys, base, h) => xs.map((x, i) => \`\${i ? 'L' : 'M'}\${X(x).toFixed(1)},\${(base - ys[i] * h).toFixed(1)}\`).join('');
  const trimmed = (ys, base, h) => {  // only where the curve has visible mass
    let d = '', on = false;
    xs.forEach((x, i) => {
      if (ys[i] < 0.08) { on = false; return; }
      d += \`\${on ? 'L' : 'M'}\${X(x).toFixed(1)},\${(base - ys[i] * h).toFixed(1)}\`; on = true;
    });
    return d;
  };
  let out = '', svy = '';
  [0, .25, .5, .75, 1].forEach(t => {
    out += \`<line class="axis" x1="\${X(t)}" x2="\${X(t)}" y1="\${top - amp}" y2="\${height - 24}"/>\`;
    out += \`<text class="muted" x="\${X(t)}" y="\${height - 8}" text-anchor="middle">\${t * 100}%</text>\`;
  });
  W.forEach((r, i) => {
    const base = top + i * step, hue = Math.round(275 - i * (275 / Math.max(W.length - 1, 1)));
    out += \`<path d="\${path(betaCurve(r.came_true, r.n), base, amp)}L\${X(1)},\${base}L\${X(0)},\${base}Z" fill="hsl(\${hue} 72% 56%)" fill-opacity=".82" stroke="var(--panel)" stroke-width="1.2"/>\`;
    if (r.survey) svy += \`<path class="svy" d="\${trimmed(kde(r.survey), base, amp * .9)}"/>\`;
    out += \`<text x="\${L - 10}" y="\${base - 4}" text-anchor="end">\${esc(r.word)}</text>\`;
    out += \`<text class="muted" x="\${L - 10}" y="\${base + 9}" text-anchor="end">\${Math.round(r.rate * 100)}% of \${r.n}</text>\`;
  });
  svg.innerHTML = out + svy;  // survey readings drawn last so no ridge hides them
  $('#ridgelegend').innerHTML = 'Each filled curve is where the true rate plausibly lies for scored claims whose tweet used that word (a Beta posterior); its label gives the share that came true. ' +
    'Dashed curves show how 46 people read the same phrase in Zonination\\'s <a href="https://github.com/zonination/perceptions" target="_blank" rel="noopener noreferrer">Perceptions of Probability</a> survey (MIT License); “doubt / unlikely” and “probably not” are flipped, because claims are phrased in the direction the author bets. Words with fewer than 3 scored claims, and stated percentages, are not shown.';
})();

// leaderboard
const rankMin = D.rank_min_n || 1;
const isRanked = a => a.ranked !== undefined ? a.ranked : a.n >= rankMin;
let rk = 0;
const authors = D.authors.map(a => ({...a, rank: isRanked(a) ? ++rk : null}));
let sortK = 'rank', sortDir = 1, selected = null;
function renderLb() {
  const rows = authors.slice().sort((x, y) => {
    // Ranked authors always come before provisional ones, whatever the sort.
    if (isRanked(x) !== isRanked(y)) return isRanked(x) ? -1 : 1;
    let a = x[sortK], b = y[sortK];
    if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
    return (typeof a === 'string' ? a.localeCompare(b) : a - b) * sortDir;
  });
  document.querySelectorAll('#lb th').forEach(th => th.setAttribute('aria-sort', th.dataset.k === sortK ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'));
  let divided = false;
  $('#lb tbody').innerHTML = rows.length ? rows.map(a => {
    const div = !isRanked(a) && !divided ? (divided = true, \`<tr class="tier"><td colspan="10">Provisional: fewer than \${rankMin} scored calls, listed after everyone ranked</td></tr>\`) : '';
    return div + \`<tr data-a="\${esc(a.author)}" class="\${a.author === selected ? 'sel' : ''}\${isRanked(a) ? '' : ' prov'}">
    <td>\${a.rank ?? '–'}</td><td>\${avatar(a.author)}@\${esc(a.author)}</td><td>\${a.points >= 0 ? '+' : ''}\${a.points.toFixed(2)}</td><td>\${a.hits}</td><td>\${a.n}</td>
    <td>\${pct(a.hit_rate)} (\${pct(a.hit_rate_80ci[0])}–\${pct(a.hit_rate_80ci[1])})</td><td>\${a.mean_brier.toFixed(3)}</td>
    <td>\${a.skill >= 0 ? '+' : ''}\${a.skill.toFixed(3)}</td>
    <td>\${a.ambiguous_rate == null ? '–' : pct(a.ambiguous_rate) + ' of ' + a.judged}</td>
    <td>\${a.mean_edge_vs_market == null ? '–' : (a.mean_edge_vs_market >= 0 ? '+' : '') + a.mean_edge_vs_market.toFixed(3) + ' (' + a.n_with_market + ')'}</td></tr>\`; }).join('')
    : '<tr><td colspan="10" class="empty">No author has a due, resolved claim yet.</td></tr>';
}
document.querySelectorAll('#lb th').forEach(th => th.onclick = () => {
  const k = th.dataset.k;
  if (k === sortK) sortDir = -sortDir; else { sortK = k; sortDir = (k === 'rank' || k === 'author' || k === 'mean_brier') ? 1 : -1; }
  renderLb();
});
$('#lb tbody').onclick = e => { const tr = e.target.closest('tr[data-a]'); if (tr) selectAuthor(tr.dataset.a); };

// forecasts
const doms = [...new Set(D.claims.map(c => c.dom))].sort();
$('#dom').insertAdjacentHTML('beforeend', doms.map(d => \`<option>\${esc(d)}</option>\`).join(''));
function selectAuthor(a) {
  selected = a; renderLb(); renderList();
  $('#fh').scrollIntoView({behavior: 'smooth', block: 'start'});
}
function renderList() {
  const q = $('#q').value.trim().toLowerCase(), dom = $('#dom').value, out = $('#out').value, due = $('#due').value;
  const rows = D.claims.filter(c =>
    (!selected || c.a === selected) && (!dom || c.dom === dom) && (!out || c.out === out) &&
    (!due || String(+c.due) === due) &&
    (!q || [c.claim, c.text, c.a, c.note, c.crit].some(s => (s || '').toLowerCase().includes(q))));
  rows.sort((x, y) => (x.posted || '').localeCompare(y.posted || ''));
  const st = selected ? D.authors.find(a => a.author === selected) : null;
  const p = selected ? prof(selected) : null, num = x => x == null ? '–' : Number(x).toLocaleString();
  const web = p && safeUrl(p.web);
  $('#active').innerHTML = selected ? \`<div class="profile">\${avatar(selected, 'big')}
     <div><h3>\${esc((p && p.name) || selected)}</h3>
      <a class="handle" href="https://x.com/\${encodeURIComponent(selected)}" target="_blank" rel="noopener noreferrer">@\${esc(selected)}</a>
      \${p && p.bio ? \`<p class="bio">\${esc(p.bio)}</p>\` : ''}
      <div class="facts">
       \${p ? \`<span><b>\${num(p.followers)}</b> followers</span><span><b>\${num(p.following)}</b> following</span><span><b>\${num(p.tweets)}</b> tweets</span>\` : ''}
       \${p && p.loc ? \`<span>\${esc(p.loc)}</span>\` : ''}\${web ? \`<a href="\${esc(web)}" target="_blank" rel="noopener noreferrer">\${esc(web.replace(/^https?:\\/\\//, ''))}</a>\` : ''}
       \${p && p.joined ? \`<span>joined \${esc(p.joined)}</span>\` : ''}
      </div>
      <div class="facts" style="margin-top:6px">\${st ? \`<span><b>\${st.points >= 0 ? '+' : ''}\${st.points.toFixed(2)}</b> points</span><span><b>\${st.hits}/\${st.n}</b> scored calls right</span><span>skill <b>\${st.skill >= 0 ? '+' : ''}\${st.skill.toFixed(2)}</b></span>\` : '<span>No scored calls yet</span>'}
       <span><b>\${D.claims.filter(c => c.a === selected).length}</b> forecasts extracted</span>
       \${st && st.already_known ? \`<span><b>\${st.already_known}</b> already known at posting (not scored)</span>\` : ''}</div>
     </div>
     <button type="button" class="clr" aria-label="Clear author filter" id="clr">✕</button></div>\` : '';
  if (selected) $('#clr').onclick = () => { selected = null; renderLb(); renderList(); };
  $('#fh').textContent = \`Forecasts (\${rows.length.toLocaleString()} shown)\`;
  const shown = rows.slice(0, 500);
  $('#list').innerHTML = shown.length ? shown.map(card).join('') + (rows.length > 500 ? \`<p class="empty">Showing the first 500; search or filter to narrow.</p>\` : '')
    : '<p class="empty">No forecasts match.</p>';
}
function card(c) {
  const tw = c.tid ? \`<a href="https://x.com/i/status/\${encodeURIComponent(c.tid)}" target="_blank" rel="noopener noreferrer">\${esc(c.posted)}</a>\` : esc(c.posted);
  const ev = safeUrl(c.ev), mu = safeUrl(c.murl);
  const label = c.out === 'unjudged' ? 'not judged' : c.out;
  return \`<article class="card">
   <div class="meta"><span class="badge b-\${esc(c.out)}">\${esc(label)}</span>
    <button class="author" type="button" data-a="\${esc(c.a)}">\${avatar(c.a)}@\${esc(c.a)}</button>
    <span>posted \${tw}</span>
    <span>p \${c.p == null ? '–' : c.p.toFixed(2)} (\${esc(c.psrc || 'implied')})\${c.pc != null ? \` → \${c.pc.toFixed(2)} calibrated\` : ''}\${c.cw ? \` · “\${esc(c.cw)}”\` : ''}</span>
    <span>deadline \${esc(c.dl || 'none')}\${c.dli ? ' (inferred)' : ''}\${c.due ? ' · passed' : ''}</span>
    <span>\${esc(c.dom)}</span>
    \${c.mp != null ? \`<span>market at post \${c.mp.toFixed(2)}\${mu ? \` <a href="\${esc(mu)}" target="_blank" rel="noopener noreferrer">market</a>\` : ''}</span>\` : ''}
    \${c.scored ? \`<span>scored · Brier \${c.brier.toFixed(3)}</span>\` : ''}
    \${c.known === 'already_known' ? \`<span class="badge b-ambiguous" title="The outcome was already public when this was posted, so it is not scored">known at posting</span>\${safeUrl(c.kev) ? \` <a href="\${esc(safeUrl(c.kev))}" target="_blank" rel="noopener noreferrer">source</a>\` : ''}\` : ''}
   </div>
   <p class="claim">\${esc(c.claim)}</p>
   \${c.note || ev ? \`<p class="note">\${esc(c.note || '')}\${ev ? \` <a href="\${esc(ev)}" target="_blank" rel="noopener noreferrer">evidence</a>\` : ''}</p>\` : ''}
   <details><summary>Tweet and resolution criteria</summary><div class="tweet">\${esc(c.text)}</div><div>\${esc(c.crit || '')}</div></details>
  </article>\`;
}
$('#list').onclick = e => { const b = e.target.closest('button.author'); if (b) selectAuthor(b.dataset.a); };
['#q', '#dom', '#out', '#due'].forEach(s => $(s).addEventListener('input', renderList));
renderLb(); renderList();
})();
</script>
</body>
</html>
`
