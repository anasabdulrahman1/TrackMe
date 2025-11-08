-- Add notification_settings column to profiles table
-- This stores user preferences for notification timing and behavior

DO $$
BEGIN
  -- Add notification_settings column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'notification_settings'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN notification_settings JSONB DEFAULT '{
        "enabled": true,
        "reminder_time": "08:00",
        "default_reminder_days": "1,3,7",
        "sound_enabled": true,
        "vibration_enabled": true
      }'::jsonb;
    
    RAISE NOTICE 'Added notification_settings column to profiles table';
  ELSE
    RAISE NOTICE 'notification_settings column already exists in profiles table';
  END IF;
END$$;

-- Create index for faster queries on notification settings
CREATE INDEX IF NOT EXISTS idx_profiles_notification_enabled
  ON public.profiles ((notification_settings->>'enabled'));

COMMENT ON COLUMN public.profiles.notification_settings IS 'User notification preferences including timing, sound, and vibration settings';
