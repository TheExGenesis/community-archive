CREATE OR REPLACE FUNCTION private.tes_invoke_edge_function_move_data_to_storage()
RETURNS void AS $$
DECLARE
    request_id TEXT;
    response_status INTEGER;
    start_time TIMESTAMP;
    elapsed_seconds NUMERIC;
BEGIN
    PERFORM net.http_post(
        url:='https://fabxmporizzqflnftavs.supabase.co/functions/v1/schedule_data_moving'
    );
END;
$$ LANGUAGE plpgsql;
