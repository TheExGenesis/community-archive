-- Create opt-in table for users who consent to tweet streaming
CREATE TABLE IF NOT EXISTS public.optin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    twitter_user_id TEXT, -- Optional: store Twitter user ID if available
    opted_in BOOLEAN NOT NULL DEFAULT false,
    terms_version TEXT NOT NULL DEFAULT 'v1.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opted_in_at TIMESTAMP WITH TIME ZONE, -- Track when they opted in
    opted_out_at TIMESTAMP WITH TIME ZONE, -- Track when they opted out
    UNIQUE(user_id),
    UNIQUE(username)
);

-- Create index for faster lookups
CREATE INDEX idx_optin_username ON public.optin(username);
CREATE INDEX idx_optin_user_id ON public.optin(user_id);
CREATE INDEX idx_optin_opted_in ON public.optin(opted_in) WHERE opted_in = true;

-- Add RLS policies
ALTER TABLE public.optin ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own opt-in status
CREATE POLICY "Users can view own opt-in status" ON public.optin
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own opt-in record
CREATE POLICY "Users can create own opt-in record" ON public.optin
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own opt-in status
CREATE POLICY "Users can update own opt-in status" ON public.optin
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Public can view opted-in usernames (for streaming service)
CREATE POLICY "Public can view opted-in users" ON public.optin
    FOR SELECT
    USING (opted_in = true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_optin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Track opt-in/opt-out timestamps
    IF OLD.opted_in = false AND NEW.opted_in = true THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
    ELSIF OLD.opted_in = true AND NEW.opted_in = false THEN
        NEW.opted_out_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating timestamps
CREATE TRIGGER update_optin_timestamp
    BEFORE UPDATE ON public.optin
    FOR EACH ROW
    EXECUTE FUNCTION update_optin_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.optin IS 'Stores user consent for tweet streaming to the community archive';
COMMENT ON COLUMN public.optin.opted_in IS 'Current opt-in status for tweet streaming';
COMMENT ON COLUMN public.optin.terms_version IS 'Version of terms and conditions the user agreed to';