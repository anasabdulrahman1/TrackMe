-- Check the actual data in pending ingest jobs to see what might be causing the error
SELECT 
  id,
  user_id,
  parsed_data,
  status,
  error_message,
  attempts,
  created_at
FROM queue_ingest
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1;
