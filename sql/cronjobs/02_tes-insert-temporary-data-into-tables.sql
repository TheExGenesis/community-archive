SELECT cron.schedule('tes-insert-temporary-data-into-tables', 
    '* * * * *', $$SELECT private.tes_import_temporary_data_into_tables();$$)
WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tes-insert-temporary-data-into-tables'
);