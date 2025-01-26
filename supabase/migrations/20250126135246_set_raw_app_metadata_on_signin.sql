CREATE OR REPLACE FUNCTION sync_meta_data()
RETURNS TRIGGER AS $$
BEGIN
    NEW.raw_app_meta_data = jsonb_set(
        jsonb_set(
            COALESCE(NEW.raw_app_meta_data::jsonb, '{}'::jsonb),
            '{user_name}',
            NEW.raw_user_meta_data::jsonb->'user_name'
        ),
        '{provider_id}',
        NEW.raw_user_meta_data::jsonb->'provider_id'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_user_meta_data
BEFORE INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION sync_meta_data();