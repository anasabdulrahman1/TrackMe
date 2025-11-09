-- ============================================================================
-- FIX INGEST QUEUE - Delete bad jobs and reset parse jobs
-- ============================================================================

-- Step 1: Delete all pending ingest jobs (they have wrong data structure)
DELETE FROM queue_ingest WHERE status = 'pending';

-- Step 2: Reset the completed parse jobs back to pending so they recreate ingest jobs
UPDATE queue_parse
SET 
  status = 'pending',
  attempts = 0,
  worker_id = NULL,
  started_at = NULL,
  completed_at = NULL,
  updated_at = NOW()
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '1 hour';  -- Only recent ones

-- Step 3: Verify
SELECT 
  'parse' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'completed') as completed
FROM queue_parse;

SELECT 
  'ingest' as queue,
  COUNT(*) as total
FROM queue_ingest;
