-- create table to store daily snapshots of pg_stat_statements
CREATE TABLE private.daily_pg_stat_statements (
  id SERIAL PRIMARY KEY,
  snapshot_time TIMESTAMP DEFAULT NOW(),
  userid OID,
  dbid OID,
  toplevel BOOLEAN,
  queryid BIGINT,
  query TEXT,
  plans BIGINT,
  total_plan_time DOUBLE PRECISION,
  min_plan_time DOUBLE PRECISION,
  max_plan_time DOUBLE PRECISION,
  mean_plan_time DOUBLE PRECISION,
  stddev_plan_time DOUBLE PRECISION,
  calls BIGINT,
  total_exec_time DOUBLE PRECISION,
  min_exec_time DOUBLE PRECISION,
  max_exec_time DOUBLE PRECISION,
  mean_exec_time DOUBLE PRECISION,
  stddev_exec_time DOUBLE PRECISION,
  rows BIGINT,
  shared_blks_hit BIGINT,
  shared_blks_read BIGINT,
  shared_blks_dirtied BIGINT,
  shared_blks_written BIGINT,
  local_blks_hit BIGINT,
  local_blks_read BIGINT,
  local_blks_dirtied BIGINT,
  local_blks_written BIGINT,
  temp_blks_read BIGINT,
  temp_blks_written BIGINT,
  blk_read_time DOUBLE PRECISION,
  blk_write_time DOUBLE PRECISION,
  temp_blk_read_time DOUBLE PRECISION,
  temp_blk_write_time DOUBLE PRECISION,
  wal_records BIGINT,
  wal_fpi BIGINT,
  wal_bytes NUMERIC,
  jit_functions BIGINT,
  jit_generation_time DOUBLE PRECISION,
  jit_inlining_count BIGINT,
  jit_inlining_time DOUBLE PRECISION,
  jit_optimization_count BIGINT,
  jit_optimization_time DOUBLE PRECISION,
  jit_emission_count BIGINT,
  jit_emission_time DOUBLE PRECISION
);

-- function to snapshot pg_stat_statements daily
CREATE OR REPLACE FUNCTION private.snapshot_pg_stat_statements()
RETURNS void AS $$
BEGIN
  INSERT INTO daily_pg_stat_statements (
    userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time,
    mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time,
    mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied,
    shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written,
    temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, temp_blk_read_time,
    temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time,
    jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time,
    jit_emission_count, jit_emission_time
  )
  SELECT
    userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time,
    mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time,
    mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied,
    shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written,
    temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, temp_blk_read_time,
    temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time,
    jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time,
    jit_emission_count, jit_emission_time
  FROM pg_stat_statements;

  -- reset stats after snapshot
  PERFORM pg_stat_statements_reset();
END;
$$ LANGUAGE plpgsql;

select
  cron.schedule(
    'daily-pg-stat-statements-snapshot',
    '0 0 * * *', -- run daily at midnight
    $$
    select private.snapshot_pg_stat_statements();
    $$
  );