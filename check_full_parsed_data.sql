-- Get the full parsed_data JSON to see the complete structure
SELECT 
  id,
  parsed_data::text as full_parsed_data
FROM queue_ingest
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1;
