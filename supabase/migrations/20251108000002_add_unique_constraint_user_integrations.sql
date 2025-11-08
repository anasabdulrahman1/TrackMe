-- ============================================================================
-- ADD UNIQUE CONSTRAINT TO USER_INTEGRATIONS TABLE
-- ============================================================================
-- This ensures one integration per user per provider

-- Add unique constraint on user_id and provider
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_integrations_user_id_provider_key'
  ) THEN
    ALTER TABLE public.user_integrations 
      ADD CONSTRAINT user_integrations_user_id_provider_key 
      UNIQUE (user_id, provider);
  END IF;
END$$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider 
  ON public.user_integrations(user_id, provider);
