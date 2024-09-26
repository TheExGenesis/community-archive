CREATE OR REPLACE FUNCTION public.drop_function_if_exists(function_name text, function_args text[])
RETURNS void AS $$
DECLARE
full_function_name text;
func_oid oid;
BEGIN
-- Find the function OID
SELECT p.oid INTO func_oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = function_name
AND array_length(p.proargtypes, 1) = array_length(function_args, 1)
AND array_to_string(p.proargtypes::regtype[], ',') = array_to_string(function_args::regtype[], ',');
-- If the function exists, drop it
IF func_oid IS NOT NULL THEN
full_function_name := 'public.' || function_name || '(' || array_to_string(function_args, ', ') || ')';
EXECUTE 'DROP FUNCTION ' || full_function_name;
END IF;
END;
$$ LANGUAGE plpgsql;
