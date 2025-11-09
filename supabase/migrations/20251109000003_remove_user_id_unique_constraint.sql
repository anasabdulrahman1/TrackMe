-- ============================================================================
-- REMOVE USER_ID UNIQUE CONSTRAINT FROM DEVICES
-- ============================================================================
-- Users should be able to have multiple devices (phone, tablet, etc.)
-- Only device_token should be unique

-- Drop the user_id unique constraint
ALTER TABLE public.devices
DROP CONSTRAINT IF EXISTS devices_user_id_key;

-- Ensure device_token is unique (should already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'devices_device_token_key'
  ) THEN
    ALTER TABLE public.devices 
      ADD CONSTRAINT devices_device_token_key UNIQUE (device_token);
  END IF;
END$$;

-- Add index for better query performance on user_id
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);

COMMENT ON TABLE public.devices IS 'Device registrations. Users can have multiple devices. Each device_token is unique and can be transferred between users via upsert.';
