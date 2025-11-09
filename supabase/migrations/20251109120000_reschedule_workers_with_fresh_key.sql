-- ============================================================================
-- RESCHEDULE EMAIL WORKERS WITH FRESH SERVICE ROLE KEY
-- ============================================================================
-- This migration updates the cron jobs to use the current service role key
-- Run this after redeploying Edge Functions
-- ============================================================================

-- Extensions already enabled in previous migrations
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing jobs (ignore errors if they don't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('email-scanning-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

DO $$
BEGIN
  PERFORM cron.unschedule('email-parsing-worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

DO $$
BEGIN
  PERFORM cron.unschedule('email-ingestion-service');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- ============================================================================
-- IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
-- Get it from: Supabase Dashboard → Project Settings → API → service_role
-- ============================================================================

-- Schedule scanning worker (every minute)
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR52umobGfBI'
    )
  );
  $$
);

-- Schedule parsing worker (every minute)
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR52umobGfBI'
    )
  );
  $$
);

-- Schedule ingestion service (every minute)
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR52umobGfBI'
    )
  );
  $$
);

-- Verify jobs are scheduled
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname LIKE 'email-%'
ORDER BY jobname;
