-- ============================================================================
-- FIX DEVICES RLS FOR ACCOUNT SWITCHING
-- ============================================================================
-- Allow device transfer when switching accounts (like Google/Facebook do)

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can manage their devices" ON public.devices;

-- Create separate policies for different operations
-- SELECT: Users can only see their own devices
CREATE POLICY "Users can view own devices"
  ON public.devices
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can insert devices for themselves
CREATE POLICY "Users can insert own devices"
  ON public.devices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update ANY device with their device_token
-- This allows device transfer when switching accounts
CREATE POLICY "Users can update devices by token"
  ON public.devices
  FOR UPDATE
  USING (
    -- Can update if it's their device OR if they're claiming it via device_token
    auth.uid() = user_id 
    OR 
    device_token IN (
      SELECT device_token FROM public.devices WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (auth.uid() = user_id); -- But can only set user_id to themselves

-- DELETE: Users can only delete their own devices
CREATE POLICY "Users can delete own devices"
  ON public.devices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment explaining the design
COMMENT ON TABLE public.devices IS 'Device registrations for push notifications. Devices can be transferred between users when switching accounts (upsert on device_token).';
