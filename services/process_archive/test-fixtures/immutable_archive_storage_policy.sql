INSERT INTO storage.objects VALUES
('fixture_owner/archive.json','archives'),
('fixture_owner/12345678-1234-1234-1234-123456789abc/archive.json','archives');
SET ROLE authenticated;
DO $$
DECLARE affected integer;
BEGIN
  UPDATE storage.objects SET bucket_id='archives' WHERE name='fixture_owner/archive.json';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Legacy update unexpectedly denied'; END IF;
  UPDATE storage.objects SET bucket_id='archives' WHERE name='fixture_owner/12345678-1234-1234-1234-123456789abc/archive.json';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Immutable object update unexpectedly allowed'; END IF;
END;
$$;
RESET ROLE;
