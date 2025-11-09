-- ============================================================================
-- OPTIMIZE PARSE WORKER FOR BATCH PROCESSING
-- ============================================================================
-- Update get_next_parse_job to return up to 50 jobs at once for faster processing

-- Drop old function first
DROP FUNCTION IF EXISTS get_next_parse_job(TEXT);

CREATE OR REPLACE FUNCTION get_next_parse_job(p_worker_id TEXT, p_batch_size INT DEFAULT 50)
RETURNS TABLE (
  job_id UUID,
  user_id UUID,
  email_id TEXT,
  email_subject TEXT,
  email_snippet TEXT,
  email_from TEXT
) AS $$
DECLARE
  v_job_ids UUID[];
BEGIN
  -- Select up to p_batch_size jobs
  SELECT ARRAY_AGG(id) INTO v_job_ids
  FROM (
    SELECT id
    FROM public.queue_parse
    WHERE status = 'pending'
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) sub;
  
  IF v_job_ids IS NULL OR array_length(v_job_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- Update all selected jobs to processing
  UPDATE public.queue_parse
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = NOW(),
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE id = ANY(v_job_ids);
  
  -- Return all selected jobs
  RETURN QUERY
  SELECT 
    qp.id,
    qp.user_id,
    qp.email_id,
    qp.email_subject,
    qp.email_snippet,
    qp.email_from
  FROM public.queue_parse qp
  WHERE qp.id = ANY(v_job_ids)
  ORDER BY qp.priority ASC, qp.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_next_parse_job IS 'Returns up to p_batch_size parse jobs for batch processing (default 50)';
