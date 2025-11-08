-- ============================================================================
-- NOTIFICATION TRIGGER
-- ============================================================================
-- This trigger calls the notification-service Edge Function when a new
-- subscription suggestion is created with status='pending'
-- ============================================================================

-- Create function to invoke Edge Function
CREATE OR REPLACE FUNCTION notify_new_suggestions()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Only trigger for pending suggestions
  IF NEW.status = 'pending' THEN
    -- Build payload
    v_payload := jsonb_build_object(
      'type', 'new_suggestion',
      'record', row_to_json(NEW)
    );

    -- Call Edge Function asynchronously using pg_net
    -- Note: This requires pg_net extension
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/notification-service',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := v_payload
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_new_suggestions ON public.subscription_suggestions;

CREATE TRIGGER trigger_notify_new_suggestions
  AFTER INSERT ON public.subscription_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_suggestions();

COMMENT ON FUNCTION notify_new_suggestions() IS 'Triggers notification-service when new suggestions are created';

-- Note: To use this trigger, you need to:
-- 1. Enable pg_net extension: CREATE EXTENSION IF NOT EXISTS pg_net;
-- 2. Set configuration: 
--    ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
--    ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';
