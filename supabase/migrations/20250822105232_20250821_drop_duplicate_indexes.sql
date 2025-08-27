-- Drop duplicate indexes to save space and improve performance
DROP INDEX IF EXISTS private.archived_temp_data_pk_idx;
DROP INDEX IF EXISTS private.archived_temp_data_timestamp_idx;
DROP INDEX IF EXISTS private.archived_temp_data_inserted_idx;

-- Consider dropping the GIN index if not searching JSONB frequently (1.8GB!)
-- DROP INDEX IF EXISTS private.archived_temporary_data_data_idx;