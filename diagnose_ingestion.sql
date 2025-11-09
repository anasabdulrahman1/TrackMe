-- ============================================================================
-- DIAGNOSE INGESTION ISSUES
-- ============================================================================

-- 1. Check if trigger is disabled
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'subscription_suggestions';

-- 2. Check ingest queue status
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;

-- 3. Check most recent failed ingest job error
SELECT 
  id,
  parsed_data->>'service_name' as service_name,
  status,
  error_message,
  attempts,
  created_at
FROM queue_ingest
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 3;

-- 4. Check if there are any pending ingest jobs with correct structure
SELECT 
  id,
  parsed_data->>'email_snippet' as has_snippet,
  parsed_data->>'confidence' as has_confidence,
  parsed_data->>'confidence_score' as has_old_confidence,
  status
FROM queue_ingest
WHERE status = 'pending'
LIMIT 3;

-- 5. Check suggestions table
SELECT COUNT(*) as total_suggestions FROM subscription_suggestions;

-- 6. Check if RLS is blocking inserts
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'subscription_suggestions';

-- 7. Check RLS policies on subscription_suggestions
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'subscription_suggestions';
