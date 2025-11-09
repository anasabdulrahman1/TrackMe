-- ============================================================================
-- FIX INGESTION ERRORS - Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Set database configuration (run as postgres superuser)
ALTER DATABASE postgres 
SET app.supabase_url = 'https://aqpnksnxuiutwobkwzst.supabase.co';

ALTER DATABASE postgres 
SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDg3MzEwNywiZXhwIjoyMDQ2NDQ5MTA3fQ.QsvFNfuCKJBpFvhUJLNHvDOzCHIlVfPqWoVSCXLp-Zk';

-- Step 2: Reset failed ingest jobs to pending so they can be retried
UPDATE queue_ingest
SET 
  status = 'pending',
  attempts = 0,
  worker_id = NULL,
  started_at = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE status = 'failed';

-- Step 3: Verify the changes
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;
