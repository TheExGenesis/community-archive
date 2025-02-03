ALTER TYPE upload_phase_enum ADD VALUE IF NOT EXISTS 'ready_for_commit' AFTER 'uploading';
ALTER TYPE upload_phase_enum ADD VALUE IF NOT EXISTS 'committing' AFTER 'ready_for_commit';
