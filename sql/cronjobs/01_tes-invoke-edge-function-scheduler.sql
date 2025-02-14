select
  cron.schedule(
    'tes-invoke-edge-function-scheduler',
    '* * * * *', 
    $$
    select private.tes_invoke_edge_function_move_data_to_storage()
    $$
  )
WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tes-invoke-edge-function-scheduler'
);