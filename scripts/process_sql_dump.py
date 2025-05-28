# %%
import gc
import re
import csv
import pandas as pd
import io

public_tables = [
    "account",
    "archive_upload",
    "followers",
    "liked_tweets",
    "likes",
    "mentioned_users",
    "profile",
    "tweets",
    "tweet_media",
    "tweet_urls",
    "user_mentions",
]


insertion_separator = """);
"""

row_separator = """),
	("""


from functools import reduce


def parse_sql_values(line):
    def process_char(state, char):
        values, current_value, in_quotes, parentheses_count = state

        if char == "(" and not in_quotes:
            return (values, current_value, in_quotes, parentheses_count + 1)
        elif char == ")" and not in_quotes:
            if parentheses_count == 1:
                return (values + [current_value.strip()], "", in_quotes, 0)
            return (values, current_value, in_quotes, parentheses_count - 1)
        elif char == "'" and not in_quotes:
            return (values, current_value, True, parentheses_count)
        elif char == "'" and in_quotes:
            if current_value.endswith("'"):
                return (values, current_value + char, in_quotes, parentheses_count)
            return (values, current_value, False, parentheses_count)
        elif char == "," and not in_quotes and parentheses_count == 1:
            return (values + [current_value.strip()], "", in_quotes, parentheses_count)
        else:
            return (values, current_value + char, in_quotes, parentheses_count)

    initial_state = ([], "", False, 0)
    final_state = reduce(process_char, line.strip(), initial_state)
    return [v.strip("'").replace("''", "'") for v in final_state[0]]


start_of_insert = """INSERT INTO "public"."""
start_of_table = """
--
-- Data for Name:"""

row_separator = """),
	("""
row_separator = """),\n\t("""


def process_dump(input_file, output_dir):
    current_table = None
    current_table = None
    table_cols = {}
    table_rows = {}

    insert_regex = re.compile(
        r'INSERT INTO "public"\."(\w+)" \((.*?)\)(?: OVERRIDING SYSTEM VALUE)? VALUES'
    )

    with open(input_file, "r", encoding="utf-8") as f:
        content = f.read()
        insert_iter = insert_regex.finditer(content)
        for match in insert_iter:

            current_table = match.group(1)
            columns = [col.strip('"') for col in match.group(2).split(", ")]
            if current_table not in table_cols:
                table_cols[current_table] = [columns]
            print(f"table: {current_table} columns: {columns}")
            start = match.end()
            end = min(
                content.find(start_of_insert, start),
                content.find(start_of_table, start),
            )
            end = end if end != -1 else len(content)
            print(f"insert from {start} to {end}, length: {end-start}")
            print("Breaking insert into row strings...")
            insert_txt = content[start:end]
            row_strs = list(map(lambda x: f"({x})", insert_txt.split(row_separator)))
            print(f"Found {len(row_strs)} rows")

            print("Parsing SQL rows...")
            if current_table not in table_rows:
                table_rows[current_table] = []

            current_rows = []
            for i, row_str in enumerate(row_strs, 1):
                parsed_values = parse_sql_values(row_str)
                if len(parsed_values) == len(columns):
                    current_rows.append(parsed_values)
                else:
                    print(
                        f"Error: Row {i} in table {current_table} has {len(parsed_values)} values, expected {len(columns)}"
                    )
                if i % 10000 == 0:
                    print(f"Parsed {i} rows")
            table_rows[current_table].extend(current_rows)
            del current_rows
            gc.collect()

            print(
                f"Table {current_table} now has {len(table_rows[current_table])} rows"
            )

    # take the table_rows and create dataframes and write them
    import os

    parent_dir = os.path.dirname(output_dir)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    for table in table_rows:
        df = pd.DataFrame(table_rows[table], columns=table_cols[table])
        df.to_csv(f"{output_dir}/{table}.csv", index=False)
        del df
        gc.collect()


import os

PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "../..")
input_file = f"{PROJECT_ROOT}/supabase/schema.sql"
output_dir = f"{PROJECT_ROOT}/dumps/big1"
# %%
# Usage

# process_dump(input_file, output_dir)
# %%
insertions_str = """
--
-- Data for Name: likes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."likes" ("id", "account_id", "liked_tweet_id", "archive_upload_id") OVERRIDING SYSTEM VALUE VALUES
	(747024, '1796120648281923584', '1826310911050629401', 17),
	(747025, '1796120648281923584', '1826257777892983255', 17),
	(747026, '1796120648281923584', '1826204870694916186', 17),
	(747027, '1796120648281923584', '1826296964881027483', 17),
	(747028, '1796120648281923584', '1825774665144340827', 17),
	(747029, '1796120648281923584', '1826024905227244030', 17),
	(747030, '1796120648281923584', '1826139046483013948', 17),
	(747031, '1796120648281923584', '1826078098481361307', 17),
	(747032, '1796120648281923584', '1826282730193318175', 17),
	(747033, '1796120648281923584', '1826271289017028776', 17),
	(747034, '1796120648281923584', '1826266593950564355', 17),
	(747035, '1796120648281923584', '1826265722634502301', 17),
	(747036, '1796120648281923584', '1826264433578148064', 17),
	(747037, '1796120648281923584', '1825928781367791868', 17),
	(747038, '1796120648281923584', '1826257231786242482', 17);

    

--
-- Data for Name: mentioned_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
	('29961293', 'Geger Riyanto', 'gegerriy', '2024-09-05 18:06:03.635+00'),
	('15633111', 'Mason Currey', 'masoncurrey', '2024-09-04 15:25:09.757+00'),
	('44833706', 'synaptic stimuli', 'lindaraharja', '2024-09-05 18:06:03.634+00'),
	('10545', 'Mike Rundle', 'flyosity', '2024-09-03 11:52:44.385+00'),
	('21195588', 'Tim Pastoor', 'timpastoor', '2024-09-04 15:25:09.757+00'),
	('46991136', 'Gauchienne', 'gaucheian', '2024-09-05 18:06:03.637+00'),
	('24490384', 'Damian', 'BEEPLEofWALMART', '2024-09-04 15:25:09.757+00'),
	('182383', 'Ben Gold', 'bengold', '2024-09-06 18:29:53.843+00'),
	('53044984', 'Harbowoputra', 'harbowoputra', '2024-09-05 18:06:03.633+00'),
	('57816604', 'Maybe: Hegar', 'HPEgieara', '2024-09-05 18:06:03.636+00'),
	('74731503', 'Liam 🔻', 'cluelessdirectr', '2024-09-05 18:06:03.635+00'),
	('93421683', 'Yihui is returning to self', 'empirepowder', '2024-09-05 18:06:03.635+00'),
	('1106554797879119872', 'Victor', 'notnaughtknot', '2024-07-14 20:59:36+00'),
	('70894158', 'Ryan Abel', 'GeneralAntilles', '2024-09-04 15:25:09.758+00'),
	('110451384', 'Matt S "unpredictably hypergolic" Trout (mst)', 'shadowcat_mst', '2024-09-04 15:25:09.756+00'),
	('122484263', 'Urban Composition', 'urban_comp', '2024-09-04 15:25:09.758+00'),
	('100686498', 'Winda', 'windaul', '2024-09-05 18:06:03.634+00');

	
INSERT INTO "public"."mentioned_users" ("user_id", "name", "screen_name", "updated_at") VALUES
	('29961293', 'Geger Riyanto', 'gegerriy', '2024-09-05 18:06:03.635+00'),
	('15633111', 'Mason Currey', 'masoncurrey', '2024-09-04 15:25:09.757+00'),
	('44833706', 'synaptic stimuli', 'lindaraharja', '2024-09-05 18:06:03.634+00'),
	('10545', 'Mike Rundle', 'flyosity', '2024-09-03 11:52:44.385+00'),
	('21195588', 'Tim Pastoor', 'timpastoor', '2024-09-04 15:25:09.757+00'),
	('46991136', 'Gauchienne', 'gaucheian', '2024-09-05 18:06:03.637+00'),
	('24490384', 'Damian', 'BEEPLEofWALMART', '2024-09-04 15:25:09.757+00'),
	('182383', 'Ben Gold', 'bengold', '2024-09-06 18:29:53.843+00'),
	('53044984', 'Harbowoputra', 'harbowoputra', '2024-09-05 18:06:03.633+00'),
	('57816604', 'Maybe: Hegar', 'HPEgieara', '2024-09-05 18:06:03.636+00'),
	('74731503', 'Liam 🔻', 'cluelessdirectr', '2024-09-05 18:06:03.635+00'),
	('93421683', 'Yihui is returning to self', 'empirepowder', '2024-09-05 18:06:03.635+00'),
	('1106554797879119872', 'Victor', 'notnaughtknot', '2024-07-14 20:59:36+00'),
	('70894158', 'Ryan Abel', 'GeneralAntilles', '2024-09-04 15:25:09.758+00'),
	('110451384', 'Matt S "unpredictably hypergolic" Trout (mst)', 'shadowcat_mst', '2024-09-04 15:25:09.756+00'),
	('122484263', 'Urban Composition', 'urban_comp', '2024-09-04 15:25:09.758+00'),
	('100686498', 'Winda', 'windaul', '2024-09-05 18:06:03.634+00');
"""

rows_str = """('1823552071452242220', 'The plan isn''t that important in the end. But the plan allows you to take action &amp; the action will generate better plans. This feedback loop is the important part.

You just have to start somewhere &amp; dive in. https://t.co/I2nnM2rIHT'),
	('1823671598911463631', '@_samand_ @So8res curiously this is a great relationship advice'),
	('1823552064363938254', 'there is a blog post called by @So8res that helped me develop more agency &amp; take imperfect action toward a goal

the main takeaway is if you''re ambitious and want to do something important, you have to get your hands dirty and try things https://t.co/YzgNt4sQuM'),
	('1823552068868604085', 'Alice''s plan is bad. But it''s better than Bob''s.

Why? Because Alice will be in the arena _trying things_.

Alice will be out there "bumping into the world" — I love this phrase. I think about it all the time. I want to bump into things!!! https://t.co/GeFbBrrv8d'),
	('1823478439875060100', 'the problem is not that insight is hard to get— the problem is it’s fucking scary'),
	('1823626245348688380', 'this portal retrospective ain''t gonna write itself folks'),
	('1823632275453469080', 'omg i need to leave my job NOW i''m suffering'),
	('1823655030404116482', '@nido_kween @exgenesis 😂😂😂'),
	('1823654543067865491', '@TheJointleman @exgenesis same');"""

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Process SQL dump")
    parser.add_argument("input_file", help="Path to the input SQL dump file")
    parser.add_argument("output_file", help="Path to the output processed file")
    args = parser.parse_args()

    # Use args.input_file and args.output_file in your main logic
    process_dump(args.input_file, args.output_file)
