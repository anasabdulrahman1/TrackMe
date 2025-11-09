-- ============================================================================
-- DISABLE DEVICES RLS FOR UPSERT OPERATIONS
-- ============================================================================
-- Temporary solution: Allow authenticated users to manage devices
-- Security is handled at application layer (users can only set their own user_id)

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own devices" ON public.devices;
DROP POLICY IF EXISTS "Authenticated users can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Authenticated users can claim devices" ON public.devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON public.devices;

-- Create permissive policies for authenticated users
-- SELECT: Users can see all devices (needed for upsert to work)
CREATE POLICY "Authenticated users can view devices"
  ON public.devices
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Authenticated users can insert devices
CREATE POLICY "Authenticated users can insert devices"
  ON public.devices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Authenticated users can update devices
CREATE POLICY "Authenticated users can update devices"
  ON public.devices
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own devices
CREATE POLICY "Users can delete own devices"
  ON public.devices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.devices IS 'Device registrations. RLS allows authenticated users to upsert on device_token for account switching.';
