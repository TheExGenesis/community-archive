-- prod.sql still owns legacy private staging tables, so attach their policy
-- triggers only after that compatibility schema has been loaded.
CREATE OR REPLACE TRIGGER "reject_policy_blocked_json_payload"
BEFORE INSERT OR UPDATE ON "private"."archived_temporary_data"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_json_payload"('data');

CREATE OR REPLACE TRIGGER "reject_policy_blocked_json_payload"
BEFORE INSERT OR UPDATE ON "public"."digest_runs"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_json_payload"(
  'candidates', 'model_request', 'raw_response', 'parsed_output'
);

CREATE OR REPLACE TRIGGER "reject_policy_blocked_json_payload"
BEFORE INSERT OR UPDATE ON "public"."digest_editions"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_policy_blocked_json_payload"('content');
