CREATE OR REPLACE FUNCTION private.tes_complete_group_insertions()
RETURNS TABLE (
    completed INTEGER
) AS $$
DECLARE
    completed_count INTEGER := 0;
BEGIN
    BEGIN
        -- Identify originator_ids with only api% rows and inserted IS NULL
        WITH eligible_groups AS (
            SELECT originator_id
            FROM temporary_data
            WHERE inserted IS NULL
            GROUP BY originator_id
            HAVING COUNT(*) FILTER (WHERE type NOT LIKE 'api%') = 0
        ),
        updates AS (
            UPDATE temporary_data td
            SET inserted = CURRENT_TIMESTAMP
            FROM eligible_groups eg
            WHERE td.originator_id = eg.originator_id
            AND td.type LIKE 'api%'
            AND td.inserted IS NULL
            RETURNING td.originator_id
        )
        SELECT COUNT(DISTINCT u.originator_id), 
               ARRAY_AGG(DISTINCT u.originator_id)
        INTO completed_count
        FROM updates u;

        RETURN QUERY SELECT completed_count;

    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT -1, ARRAY[SQLERRM];
    END;
END;
$$ LANGUAGE plpgsql;
