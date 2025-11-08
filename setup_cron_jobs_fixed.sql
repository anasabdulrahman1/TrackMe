-- ============================================================================
-- EMAIL SCANNING SYSTEM - CRON JOB SETUP (FIXED)
-- ============================================================================
-- Run this script in Supabase SQL Editor to schedule all workers
-- Note: pg_cron and pg_net are already enabled in Supabase by default
-- ============================================================================

-- First, unschedule any existing jobs (in case you're re-running this)
SELECT cron.unschedule('email-scanning-worker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-scanning-worker'
);

SELECT cron.unschedule('email-parsing-worker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-parsing-worker'
);

SELECT cron.unschedule('email-ingestion-service') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-ingestion-service'
);

-- ============================================================================
-- SCHEDULE WORKERS (Every Minute)
-- ============================================================================

-- 1. Scanning Worker - Processes scan jobs from queue_scan
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );
  $$
);

-- 2. Parsing Worker - Processes parse jobs from queue_parse
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );
  $$
);

-- 3. Ingestion Service - Processes ingest jobs from queue_ingest
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );
  $$
);

-- ============================================================================
-- VERIFY CRON JOBS
-- ============================================================================

SELECT 
  jobname,
  schedule,
  active,
  jobid,
  nodename
FROM cron.job
WHERE jobname LIKE 'email-%'
ORDER BY jobname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
-- If you see 3 jobs listed above, your workers are scheduled!
-- They will run every minute to process email scanning jobs.
-- ============================================================================
