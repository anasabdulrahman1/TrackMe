-- ============================================================================
-- SIMPLIFY DEVICES RLS FOR ACCOUNT SWITCHING
-- ============================================================================
-- Allow any authenticated user to upsert on device_token
-- This enables seamless device transfer between accounts

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON public.devices;
DROP POLICY IF EXISTS "Users can update devices by token" ON public.devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON public.devices;

-- SELECT: Users can only see their own devices
CREATE POLICY "Users can view own devices"
  ON public.devices
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Any authenticated user can insert (will be caught by unique constraint)
CREATE POLICY "Authenticated users can insert devices"
  ON public.devices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Any authenticated user can update any device
-- But can only set user_id to themselves
-- This allows device transfer via upsert on device_token conflict
CREATE POLICY "Authenticated users can claim devices"
  ON public.devices
  FOR UPDATE
  TO authenticated
  USING (true)  -- Can update any device
  WITH CHECK (auth.uid() = user_id);  -- But must set user_id to self

-- DELETE: Users can only delete their own devices
CREATE POLICY "Users can delete own devices"
  ON public.devices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_devices_device_token ON public.devices(device_token);

COMMENT ON TABLE public.devices IS 'Device registrations for push notifications. Any authenticated user can claim a device via upsert on device_token, enabling seamless account switching.';
