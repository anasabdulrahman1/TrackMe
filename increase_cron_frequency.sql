-- ============================================================================
-- INCREASE CRON FREQUENCY FOR FASTER PROCESSING
-- ============================================================================
-- Run this in Supabase SQL Editor to update cron jobs to run every 30 seconds
-- This doubles the processing speed: 100 jobs/minute instead of 50 jobs/minute

-- Step 1: Unschedule old cron jobs
SELECT cron.unschedule('scanning-worker');
SELECT cron.unschedule('parsing-worker');
SELECT cron.unschedule('ingestion-worker');

-- Step 2: Schedule with 30-second frequency
-- Note: PostgreSQL cron supports 6-field format for seconds
-- Format: second minute hour day month weekday

-- Scanning Worker - Every 30 seconds
SELECT cron.schedule(
  'scanning-worker',
  '*/30 * * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDg3MzEwNywiZXhwIjoyMDQ2NDQ5MTA3fQ.QsvFNfuCKJBpFvhUJLNHvDOzCHIlVfPqWoVSCXLp-Zk'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Parsing Worker - Every 30 seconds
SELECT cron.schedule(
  'parsing-worker',
  '*/30 * * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDg3MzEwNywiZXhwIjoyMDQ2NDQ5MTA3fQ.QsvFNfuCKJBpFvhUJLNHvDOzCHIlVfPqWoVSCXLp-Zk'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Ingestion Worker - Every 30 seconds
SELECT cron.schedule(
  'ingestion-worker',
  '*/30 * * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDg3MzEwNywiZXhwIjoyMDQ2NDQ5MTA3fQ.QsvFNfuCKJBpFvhUJLNHvDOzCHIlVfPqWoVSCXLp-Zk'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Step 3: Verify the new schedules
SELECT 
  jobname,
  schedule,
  active,
  nodename
FROM cron.job
WHERE jobname IN ('scanning-worker', 'parsing-worker', 'ingestion-worker')
ORDER BY jobname;
