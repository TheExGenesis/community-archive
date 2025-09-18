-- Types required by table definitions

CREATE TYPE "public"."upload_phase_enum" AS ENUM (
    'uploading',
    'ready_for_commit',
    'committing',
    'completed',
    'failed'
);

ALTER TYPE "public"."upload_phase_enum" OWNER TO "postgres";

