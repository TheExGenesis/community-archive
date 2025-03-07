

CREATE INDEX IF NOT EXISTS idx_temp_data_api_types ON temporary_data (inserted, stored) 
WHERE inserted IS NOT NULL AND stored = 'false' AND type LIKE 'api_%';

ALTER TABLE temporary_data
ADD COLUMN id INT GENERATED ALWAYS AS IDENTITY;

ALTER TABLE temporary_data
ADD CONSTRAINT AK_temporary_data_id UNIQUE (id);