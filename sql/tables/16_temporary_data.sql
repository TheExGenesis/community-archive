CREATE TABLE IF NOT EXISTS public.temporary_data (
    type VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    originator_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB NOT NULL,
    user_id VARCHAR(255) NOT NULL DEFAULT 'anon',
    inserted TIMESTAMP WITH TIME ZONE,
    stored boolean DEFAULT false,
    id INT GENERATED ALWAYS AS IDENTITY UNIQUE,
    PRIMARY KEY (type, originator_id, item_id, timestamp)
);

CREATE INDEX idx_temporary_data_lookup 
ON public.temporary_data(type, originator_id, item_id);

CREATE INDEX IF NOT EXISTS idx_temporary_data_user_id 
ON public.temporary_data(user_id);

CREATE INDEX IF NOT EXISTS idx_temporary_data_stored 
ON public.temporary_data(stored);

CREATE INDEX IF NOT EXISTS idx_temporary_data_timestamp 
ON public.temporary_data(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_temporary_data_data 
ON public.temporary_data USING gin(data);

CREATE INDEX IF NOT EXISTS idx_temporary_data_inserted_stored 
ON public.temporary_data(inserted, stored, type);

CREATE INDEX IF NOT EXISTS idx_temporary_data_type_pattern 
ON public.temporary_data (type text_pattern_ops);


CREATE INDEX IF NOT EXISTSidx_temp_data_api_types ON temporary_data (inserted, stored) 
WHERE inserted IS NOT NULL AND stored = 'false' AND type LIKE 'api_%';


ALTER TABLE public.temporary_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY temporary_data_select_policy 
    ON public.temporary_data
    FOR SELECT 
    USING (true);
CREATE POLICY temporary_data_insert_policy 
    ON public.temporary_data
    FOR INSERT 
    WITH CHECK (true);
CREATE POLICY temporary_data_update_policy 
    ON public.temporary_data
    FOR UPDATE 
    WITH CHECK (false);
CREATE POLICY temporary_data_no_delete_policy 
    ON public.temporary_data
    FOR DELETE
    USING (false);