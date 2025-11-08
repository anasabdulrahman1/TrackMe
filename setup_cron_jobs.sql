-- ============================================================================
-- EMAIL SCANNING SYSTEM - CRON JOB SETUP
-- ============================================================================
-- Run this script in Supabase SQL Editor to schedule all workers
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
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
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
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
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
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
  jobid
FROM cron.job
WHERE jobname LIKE 'email-%'
ORDER BY jobname;

-- ============================================================================
-- MONITORING QUERIES
-- ============================================================================

-- Check queue status
SELECT 
  'scan' as queue, 
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_scan
UNION ALL
SELECT 
  'parse' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_parse
UNION ALL
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;

-- ============================================================================
-- OPTIONAL: Disable cron jobs (if needed for maintenance)
-- ============================================================================

-- Uncomment to disable:
-- SELECT cron.unschedule('email-scanning-worker');
-- SELECT cron.unschedule('email-parsing-worker');
-- SELECT cron.unschedule('email-ingestion-service');

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- Your email scanning system is now fully operational!
-- Workers will run every minute to process jobs.
-- ============================================================================
