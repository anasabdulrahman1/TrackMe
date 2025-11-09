-- ============================================================================
-- SET DATABASE CONFIGURATION PARAMETERS
-- ============================================================================
-- Set app.supabase_url and app.service_role_key for notification trigger

-- Set Supabase URL
ALTER DATABASE postgres 
SET app.supabase_url = 'https://aqpnksnxuiutwobkwzst.supabase.co';

-- Set Service Role Key
ALTER DATABASE postgres 
SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDg3MzEwNywiZXhwIjoyMDQ2NDQ5MTA3fQ.QsvFNfuCKJBpFvhUJLNHvDOzCHIlVfPqWoVSCXLp-Zk';

-- Verify settings
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE 'app.%';
