-- ============================================================================
-- ADD STATUS COLUMN TO USER_INTEGRATIONS TABLE
-- ============================================================================
-- The scanning-worker expects a status column to filter active integrations

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked', 'error'));
  END IF;
END$$;

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_user_integrations_status ON public.user_integrations(status);

-- Add comment
COMMENT ON COLUMN public.user_integrations.status IS 'Integration status: active, inactive, revoked, or error';

-- Update existing rows to have active status
UPDATE public.user_integrations 
SET status = 'active' 
WHERE status IS NULL;
