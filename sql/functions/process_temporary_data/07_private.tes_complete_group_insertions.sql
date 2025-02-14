CREATE OR REPLACE FUNCTION private.tes_complete_group_insertions()
RETURNS TABLE (
    completed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    completed_count INTEGER := 0;
    error_records TEXT[];
BEGIN
    BEGIN
        WITH api_groups AS (
            SELECT DISTINCT originator_id
            FROM temporary_data td1
            WHERE 
                -- Find groups where all records are API-type
                type LIKE 'api%'
                AND NOT EXISTS (
                    SELECT 1 
                    FROM temporary_data td2 
                    WHERE td2.originator_id = td1.originator_id 
                    AND td2.type NOT LIKE 'api%'
                    AND td2.inserted IS NULL
                )
        ),
        updates AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM api_groups ag
            WHERE td.originator_id = ag.originator_id
            AND td.type LIKE 'api%'
            AND td.inserted IS NULL
            RETURNING td.originator_id
        )
        SELECT COUNT(DISTINCT originator_id), array_agg(DISTINCT originator_id)
        INTO completed_count, error_records
        FROM updates;
        RETURN QUERY SELECT completed_count, error_records;
  
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
