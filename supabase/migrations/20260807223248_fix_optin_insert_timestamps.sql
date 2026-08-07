CREATE OR REPLACE FUNCTION public.update_optin_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    NEW.updated_at = NOW();

    -- Inserts have no OLD row, so initialize state timestamps explicitly.
    IF TG_OP = 'INSERT' THEN
        IF NEW.explicit_optout IS TRUE THEN
            NEW.opted_in = false;
            NEW.opted_out_at = NOW();
        ELSIF NEW.opted_in IS TRUE THEN
            NEW.opted_in_at = NOW();
            NEW.opted_out_at = NULL;
            NEW.explicit_optout = false;
            NEW.opt_out_reason = NULL;
        END IF;

        RETURN NEW;
    END IF;

    -- State timestamps are server-owned. Ignore caller-supplied rewrites unless
    -- the opt-in state actually changes below.
    NEW.opted_in_at = OLD.opted_in_at;
    NEW.opted_out_at = OLD.opted_out_at;

    -- Explicit opt-outs always override opt-in state.
    IF NEW.explicit_optout IS TRUE THEN
        NEW.opted_in = false;
        IF OLD.explicit_optout IS DISTINCT FROM TRUE
           OR OLD.opted_in IS TRUE
           OR NEW.opted_out_at IS NULL THEN
            NEW.opted_out_at = NOW();
        END IF;
    -- Track opt-in/opt-out timestamps.
    ELSIF OLD.opted_in IS FALSE AND NEW.opted_in IS TRUE THEN
        NEW.opted_in_at = NOW();
        NEW.opted_out_at = NULL;
        NEW.explicit_optout = false;
        NEW.opt_out_reason = NULL;
    ELSIF OLD.opted_in IS TRUE AND NEW.opted_in IS FALSE THEN
        NEW.opted_out_at = NOW();
    ELSIF NEW.opted_in IS TRUE AND NEW.opted_in_at IS NULL THEN
        -- Repair legacy opted-in rows the next time they are updated.
        NEW.opted_in_at = COALESCE(OLD.opted_in_at, OLD.created_at, OLD.updated_at, NOW());
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER update_optin_timestamp
BEFORE INSERT OR UPDATE ON public.optin
FOR EACH ROW
EXECUTE FUNCTION public.update_optin_updated_at();

-- Existing manual opt-ins were inserted before the trigger covered INSERT.
-- Their creation time is the closest durable record of when they opted in.
-- Preserve historical updated_at values while repairing the missing timestamp.
ALTER TABLE public.optin DISABLE TRIGGER update_optin_timestamp;

UPDATE public.optin
SET opted_in_at = COALESCE(created_at, updated_at, NOW())
WHERE opted_in IS TRUE
  AND opted_in_at IS NULL;

ALTER TABLE public.optin ENABLE TRIGGER update_optin_timestamp;
