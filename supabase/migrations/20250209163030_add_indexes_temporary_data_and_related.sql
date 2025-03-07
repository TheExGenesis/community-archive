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

CREATE INDEX IF NOT EXISTS idx_mentioned_users_user_id 
ON public.mentioned_users (user_id);