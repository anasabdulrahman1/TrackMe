-- ============================================================================
-- EMAIL SCANNING SYSTEM - EVENT-DRIVEN ARCHITECTURE
-- ============================================================================
-- This migration creates the complete infrastructure for our scalable,
-- asynchronous email scanning "factory" with job queues and microservices.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USER INTEGRATIONS TABLE
-- Stores encrypted OAuth tokens for Gmail access
-- ============================================================================

-- Add columns to existing user_integrations table if they don't exist
DO $$
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'error'));
  END IF;

  -- Add last_scan_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'last_scan_at'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN last_scan_at TIMESTAMPTZ;
  END IF;

  -- Add last_error column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN last_error TEXT;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON public.user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status ON public.user_integrations(status);

COMMENT ON TABLE public.user_integrations IS 'Stores OAuth tokens for third-party integrations (Gmail, Outlook, etc.)';

-- ============================================================================
-- 2. JOB QUEUE 1: SCAN JOBS
-- Users who need their Gmail scanned
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.queue_scan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job configuration
  scan_type TEXT NOT NULL DEFAULT 'deep-365-day' CHECK (scan_type IN ('deep-365-day', 'daily-2-day', 'manual')),
  priority INTEGER DEFAULT 5, -- Lower number = higher priority
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Worker tracking
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_scan_status ON public.queue_scan(status, priority, created_at);
CREATE INDEX idx_queue_scan_user_id ON public.queue_scan(user_id);

COMMENT ON TABLE public.queue_scan IS 'Queue 1: Users waiting for Gmail scan';

-- ============================================================================
-- 3. JOB QUEUE 2: PARSE JOBS
-- Individual emails that need AI parsing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.queue_parse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_job_id UUID REFERENCES public.queue_scan(id) ON DELETE CASCADE,
  
  -- Email data
  email_id TEXT NOT NULL, -- Gmail message ID
  email_subject TEXT,
  email_snippet TEXT,
  email_from TEXT,
  email_date TIMESTAMPTZ,
  raw_text TEXT, -- Full email body if needed
  
  -- Job configuration
  priority INTEGER DEFAULT 5,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 2,
  
  -- Worker tracking
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, email_id)
);

CREATE INDEX idx_queue_parse_status ON public.queue_parse(status, priority, created_at);
CREATE INDEX idx_queue_parse_user_id ON public.queue_parse(user_id);
CREATE INDEX idx_queue_parse_scan_job ON public.queue_parse(scan_job_id);

COMMENT ON TABLE public.queue_parse IS 'Queue 2: Raw emails waiting for AI parsing';

-- ============================================================================
-- 4. JOB QUEUE 3: INGESTION JOBS
-- Parsed subscription data ready for database insertion
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.queue_ingest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parse_job_id UUID REFERENCES public.queue_parse(id) ON DELETE CASCADE,
  
  -- Parsed subscription data
  parsed_data JSONB NOT NULL,
  -- Example: {
  --   "service_name": "Netflix",
  --   "price": 15.99,
  --   "currency": "USD",
  --   "billing_cycle": "monthly",
  --   "confidence": 0.95,
  --   "email_id": "...",
  --   "email_date": "..."
  -- }
  
  -- Job configuration
  priority INTEGER DEFAULT 5,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'duplicate')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 2,
  
  -- Worker tracking
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Result
  suggestion_id UUID, -- Links to subscription_suggestions table
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_ingest_status ON public.queue_ingest(status, priority, created_at);
CREATE INDEX idx_queue_ingest_user_id ON public.queue_ingest(user_id);

COMMENT ON TABLE public.queue_ingest IS 'Queue 3: Parsed data ready for database insertion';

-- ============================================================================
-- 5. SUBSCRIPTION SUGGESTIONS TABLE
-- AI-discovered subscriptions awaiting user approval
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Email metadata
  email_id TEXT NOT NULL,
  email_subject TEXT,
  email_snippet TEXT,
  email_from TEXT,
  email_date TIMESTAMPTZ,
  
  -- Parsed subscription data
  service_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  next_payment_date DATE,
  
  -- AI confidence
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- User action
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_merged')),
  reviewed_at TIMESTAMPTZ,
  
  -- If approved, link to created subscription
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, email_id)
);

CREATE INDEX idx_subscription_suggestions_user_id ON public.subscription_suggestions(user_id);
CREATE INDEX idx_subscription_suggestions_status ON public.subscription_suggestions(status);
CREATE INDEX idx_subscription_suggestions_created_at ON public.subscription_suggestions(created_at DESC);

COMMENT ON TABLE public.subscription_suggestions IS 'AI-discovered subscriptions awaiting user approval';

-- ============================================================================
-- 6. SCAN HISTORY TABLE
-- Audit log of all scan operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_job_id UUID REFERENCES public.queue_scan(id) ON DELETE SET NULL,
  
  -- Scan details
  scan_type TEXT NOT NULL,
  scan_started_at TIMESTAMPTZ DEFAULT NOW(),
  scan_completed_at TIMESTAMPTZ,
  
  -- Results
  emails_scanned INTEGER DEFAULT 0,
  emails_parsed INTEGER DEFAULT 0,
  suggestions_created INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_history_user_id ON public.scan_history(user_id, created_at DESC);
CREATE INDEX idx_scan_history_status ON public.scan_history(status);

COMMENT ON TABLE public.scan_history IS 'Audit log of all email scan operations';

-- ============================================================================
-- 7. DEAD LETTER QUEUE
-- Failed jobs for manual review
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original job details
  queue_name TEXT NOT NULL, -- 'scan', 'parse', or 'ingest'
  original_job_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job data
  job_data JSONB NOT NULL,
  
  -- Failure details
  error_message TEXT NOT NULL,
  error_stack TEXT,
  attempts INTEGER NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'retrying', 'discarded', 'resolved')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dead_letter_queue_status ON public.dead_letter_queue(status, created_at);
CREATE INDEX idx_dead_letter_queue_queue_name ON public.dead_letter_queue(queue_name);

COMMENT ON TABLE public.dead_letter_queue IS 'Failed jobs requiring manual intervention';

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_parse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_ingest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- User Integrations: Users can only see their own
CREATE POLICY "Users can view own integrations"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON public.user_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything on queues (for workers)
CREATE POLICY "Service role full access to queue_scan"
  ON public.queue_scan FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to queue_parse"
  ON public.queue_parse FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to queue_ingest"
  ON public.queue_ingest FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Subscription Suggestions: Users can view and update their own
CREATE POLICY "Users can view own suggestions"
  ON public.subscription_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own suggestions"
  ON public.subscription_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert suggestions"
  ON public.subscription_suggestions FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Scan History: Users can view their own
CREATE POLICY "Users can view own scan history"
  ON public.scan_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage scan history"
  ON public.scan_history FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Dead Letter Queue: Only service role
CREATE POLICY "Service role full access to DLQ"
  ON public.dead_letter_queue FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up old completed jobs (run daily)
CREATE OR REPLACE FUNCTION cleanup_completed_jobs()
RETURNS void AS $$
BEGIN
  -- Delete completed scan jobs older than 7 days
  DELETE FROM public.queue_scan
  WHERE status = 'completed'
    AND completed_at < NOW() - INTERVAL '7 days';
  
  -- Delete completed parse jobs older than 3 days
  DELETE FROM public.queue_parse
  WHERE status IN ('completed', 'skipped')
    AND completed_at < NOW() - INTERVAL '3 days';
  
  -- Delete completed ingest jobs older than 3 days
  DELETE FROM public.queue_ingest
  WHERE status IN ('completed', 'duplicate')
    AND completed_at < NOW() - INTERVAL '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to move failed jobs to dead letter queue
CREATE OR REPLACE FUNCTION move_to_dead_letter_queue(
  p_queue_name TEXT,
  p_job_id UUID,
  p_user_id UUID,
  p_job_data JSONB,
  p_error_message TEXT,
  p_error_stack TEXT,
  p_attempts INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.dead_letter_queue (
    queue_name,
    original_job_id,
    user_id,
    job_data,
    error_message,
    error_stack,
    attempts
  ) VALUES (
    p_queue_name,
    p_job_id,
    p_user_id,
    p_job_data,
    p_error_message,
    p_error_stack,
    p_attempts
  )
  RETURNING id INTO v_dlq_id;
  
  RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next job from queue (with locking)
CREATE OR REPLACE FUNCTION get_next_scan_job(p_worker_id TEXT)
RETURNS TABLE (
  job_id UUID,
  user_id UUID,
  scan_type TEXT
) AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Get and lock the next pending job
  SELECT id INTO v_job_id
  FROM public.queue_scan
  WHERE status = 'pending'
    AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Update job status
  UPDATE public.queue_scan
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = NOW(),
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE id = v_job_id;
  
  -- Return job details
  RETURN QUERY
  SELECT 
    qs.id,
    qs.user_id,
    qs.scan_type
  FROM public.queue_scan qs
  WHERE qs.id = v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Similar functions for parse and ingest queues
CREATE OR REPLACE FUNCTION get_next_parse_job(p_worker_id TEXT)
RETURNS TABLE (
  job_id UUID,
  user_id UUID,
  email_id TEXT,
  email_subject TEXT,
  email_snippet TEXT,
  email_from TEXT
) AS $$
DECLARE
  v_job_id UUID;
BEGIN
  SELECT id INTO v_job_id
  FROM public.queue_parse
  WHERE status = 'pending'
    AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  UPDATE public.queue_parse
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = NOW(),
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE id = v_job_id;
  
  RETURN QUERY
  SELECT 
    qp.id,
    qp.user_id,
    qp.email_id,
    qp.email_subject,
    qp.email_snippet,
    qp.email_from
  FROM public.queue_parse qp
  WHERE qp.id = v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_next_ingest_job(p_worker_id TEXT)
RETURNS TABLE (
  job_id UUID,
  user_id UUID,
  parsed_data JSONB
) AS $$
DECLARE
  v_job_id UUID;
BEGIN
  SELECT id INTO v_job_id
  FROM public.queue_ingest
  WHERE status = 'pending'
    AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  UPDATE public.queue_ingest
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    started_at = NOW(),
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE id = v_job_id;
  
  RETURN QUERY
  SELECT 
    qi.id,
    qi.user_id,
    qi.parsed_data
  FROM public.queue_ingest qi
  WHERE qi.id = v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. TRIGGERS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queue_scan_updated_at
  BEFORE UPDATE ON public.queue_scan
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queue_parse_updated_at
  BEFORE UPDATE ON public.queue_parse
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queue_ingest_updated_at
  BEFORE UPDATE ON public.queue_ingest
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_suggestions_updated_at
  BEFORE UPDATE ON public.subscription_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_integrations TO authenticated;
GRANT SELECT, UPDATE ON public.subscription_suggestions TO authenticated;
GRANT SELECT ON public.scan_history TO authenticated;
