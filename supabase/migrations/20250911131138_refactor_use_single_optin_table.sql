-- Drop the separate optout table as we'll use the optin table for both
DROP TABLE IF EXISTS public.optout CASCADE;

-- Drop the functions related to optout table
DROP FUNCTION IF EXISTS update_optout_updated_at() CASCADE;

-- Add missing columns to optin table if they don't exist
ALTER TABLE public.optin 
ADD COLUMN IF NOT EXISTS explicit_optout BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS opt_out_reason TEXT;

-- Update the trigger function to handle explicit opt-out
CREATE OR REPLACE FUNCTION update_optin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Track opt-in/opt-out timestamps
    IF OLD.opted_in = false AND NEW.opted_in = true THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
        NEW.explicit_optout = false; -- Clear explicit opt-out when opting in
        NEW.opt_out_reason = NULL;
    ELSIF OLD.opted_in = true AND NEW.opted_in = false THEN
        NEW.opted_out_at = NOW();
    END IF;
    
    -- Handle explicit opt-out
    IF OLD.explicit_optout = false AND NEW.explicit_optout = true THEN
        NEW.opted_in = false;
        NEW.opted_out_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_optin_explicit_optout 
ON public.optin(explicit_optout) 
WHERE explicit_optout = true;

-- Update RLS policies to handle opt-out scenarios
DROP POLICY IF EXISTS "Public can view opted-in users" ON public.optin;

-- Create new policy that allows viewing both opted-in and explicitly opted-out users
CREATE POLICY "Public can view user opt status" ON public.optin
    FOR SELECT
    USING (true); -- Allow public to check both opt-in and opt-out status

-- Add comments for documentation
COMMENT ON COLUMN public.optin.explicit_optout IS 'User has explicitly opted out - stronger than just opted_in=false';
COMMENT ON COLUMN public.optin.opt_out_reason IS 'Optional reason provided by user for opting out';
