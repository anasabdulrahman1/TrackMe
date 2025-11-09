-- ============================================================================
-- DISABLE NOTIFICATION TRIGGER TEMPORARILY
-- ============================================================================
-- The trigger is failing because app.supabase_url is not set
-- We'll disable it so ingestion can complete, then fix it later

-- Disable the trigger
DROP TRIGGER IF EXISTS on_suggestion_created ON subscription_suggestions;

-- Verify it's gone
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_suggestion_created';
