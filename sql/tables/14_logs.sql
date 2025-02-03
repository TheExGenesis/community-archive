CREATE TABLE IF NOT EXISTS private.logs (
    log_id SERIAL PRIMARY KEY,
    log_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_type TEXT,  -- 'upload', 'auth', 'payment' etc
    error_message TEXT,
    error_code TEXT,
    context JSONB  -- {account_id: '123', upload_id: 456, custom_data: {}}
);