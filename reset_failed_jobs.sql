-- ============================================================================
-- RESET FAILED INGEST JOBS - Run in Supabase SQL Editor
-- ============================================================================
-- Now that price/billing_cycle are nullable, retry the failed jobs

-- Reset all failed ingest jobs to pending
UPDATE queue_ingest
SET 
  status = 'pending',
  attempts = 0,
  worker_id = NULL,
  started_at = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE status = 'failed';

-- Check the result
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;
