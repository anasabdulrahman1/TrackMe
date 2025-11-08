-- ============================================================================
-- ADD SCOPES COLUMN TO USER_INTEGRATIONS TABLE
-- ============================================================================

-- Add scopes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'scopes'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN scopes TEXT[];
  END IF;
END$$;

-- Add comment
COMMENT ON COLUMN public.user_integrations.scopes IS 'OAuth scopes granted by the user';
