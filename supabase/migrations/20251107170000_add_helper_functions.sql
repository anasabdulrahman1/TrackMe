-- ============================================================================
-- HELPER FUNCTIONS FOR EMAIL SCANNING WORKERS
-- ============================================================================

-- Function to increment suggestions count in scan_history
CREATE OR REPLACE FUNCTION increment_suggestions_count(p_scan_job_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.scan_history
  SET suggestions_created = suggestions_created + 1
  WHERE scan_job_id = p_scan_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION increment_suggestions_count(UUID) TO service_role;
