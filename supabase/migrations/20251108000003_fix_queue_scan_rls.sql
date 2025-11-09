-- ============================================================================
-- FIX QUEUE_SCAN RLS POLICIES
-- ============================================================================
-- Allow authenticated users to insert their own scan jobs

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Service role full access to queue_scan" ON public.queue_scan;

-- Add policies for authenticated users
CREATE POLICY "Users can insert own scan jobs"
  ON public.queue_scan FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own scan jobs"
  ON public.queue_scan FOR SELECT
  USING (auth.uid() = user_id);

-- Service role still has full access
CREATE POLICY "Service role full access to queue_scan"
  ON public.queue_scan FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
