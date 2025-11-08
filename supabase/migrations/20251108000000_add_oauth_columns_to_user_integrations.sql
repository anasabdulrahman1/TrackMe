-- ============================================================================
-- ADD OAUTH TOKEN COLUMNS TO USER_INTEGRATIONS TABLE
-- ============================================================================
-- This migration adds the missing OAuth token columns to the user_integrations table

-- Add OAuth token columns if they don't exist
DO $$
BEGIN
  -- Add access_token column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'access_token'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN access_token TEXT;
  END IF;

  -- Add refresh_token column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN refresh_token TEXT;
  END IF;

  -- Add token_expires_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN token_expires_at TIMESTAMPTZ;
  END IF;

  -- Add provider column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN provider TEXT NOT NULL DEFAULT 'google';
  END IF;

  -- Add provider_user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_integrations' 
      AND column_name = 'provider_user_id'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD COLUMN provider_user_id TEXT;
  END IF;

  -- Add scopes column if it doesn't exist
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
COMMENT ON COLUMN public.user_integrations.access_token IS 'OAuth access token (encrypted in production)';
COMMENT ON COLUMN public.user_integrations.refresh_token IS 'OAuth refresh token (encrypted in production)';
COMMENT ON COLUMN public.user_integrations.token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN public.user_integrations.provider IS 'OAuth provider (google, microsoft, etc.)';
COMMENT ON COLUMN public.user_integrations.provider_user_id IS 'User email or ID from the provider';
COMMENT ON COLUMN public.user_integrations.scopes IS 'OAuth scopes granted by the user';
