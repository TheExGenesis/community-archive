-- Create opt-out table for users who explicitly refuse tweet streaming
CREATE TABLE IF NOT EXISTS public.optout (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    twitter_user_id TEXT, -- Optional: store Twitter user ID if available
    opted_out BOOLEAN NOT NULL DEFAULT true,
    reason TEXT, -- Optional: reason for opting out
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(username)
);

-- Create indexes for faster lookups
CREATE INDEX idx_optout_username ON public.optout(username);
CREATE INDEX idx_optout_user_id ON public.optout(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_optout_opted_out ON public.optout(opted_out) WHERE opted_out = true;

-- Add RLS policies
ALTER TABLE public.optout ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own opt-out status
CREATE POLICY "Users can view own opt-out status" ON public.optout
    FOR SELECT
    USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can insert their own opt-out record
CREATE POLICY "Users can create own opt-out record" ON public.optout
    FOR INSERT
    WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- Policy: Users can update their own opt-out status
CREATE POLICY "Users can update own opt-out status" ON public.optout
    FOR UPDATE
    USING (user_id IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- Policy: Public can view opted-out usernames (for streaming service to know who to skip)
CREATE POLICY "Public can view opted-out users" ON public.optout
    FOR SELECT
    USING (opted_out = true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_optout_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating timestamps
CREATE TRIGGER update_optout_timestamp
    BEFORE UPDATE ON public.optout
    FOR EACH ROW
    EXECUTE FUNCTION update_optout_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.optout IS 'Stores explicit opt-out preferences for users who do not want their tweets streamed';
COMMENT ON COLUMN public.optout.opted_out IS 'Current opt-out status for tweet streaming';
COMMENT ON COLUMN public.optout.reason IS 'Optional reason provided by user for opting out';

-- Modify the optin table to add an explicit opt-out field
ALTER TABLE public.optin ADD COLUMN IF NOT EXISTS explicit_optout BOOLEAN DEFAULT false;
COMMENT ON COLUMN public.optin.explicit_optout IS 'Indicates if user has explicitly opted out (overrides opted_in)';