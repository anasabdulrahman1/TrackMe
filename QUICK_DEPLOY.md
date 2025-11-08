# ⚡ Quick Deploy Reference

## 🚀 **Deploy All Edge Functions**

```powershell
cd c:\TrackMe

# Deploy all 6 functions at once
supabase functions deploy auth-orchestrator
supabase functions deploy scanning-worker
supabase functions deploy parsing-worker
supabase functions deploy ingestion-service
supabase functions deploy notification-service
supabase functions deploy revocation-webhook
```

---

## 🔑 **Set Secrets (Replace with your actual values)**

```powershell
# Google OAuth
supabase secrets set GOOGLE_CLIENT_ID="YOUR_CLIENT_ID"
supabase secrets set GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"

# Google Service Account (FCM) - Single line, escape quotes
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# OpenAI
supabase secrets set OPENAI_API_KEY="sk-..."

# Verify
supabase secrets list
```

---

## ⏰ **Schedule Workers (Run in Supabase SQL Editor)**

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Scanning Worker (every minute)
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );$$
);

-- Parsing Worker (every minute)
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );$$
);

-- Ingestion Service (every minute)
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzO3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );$$
);

-- Verify
SELECT * FROM cron.job WHERE jobname LIKE 'email-%';
```

---

## 🧪 **Quick Test Commands**

```powershell
# Test scanning-worker
Invoke-WebRequest -Uri "https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker" `
  -Method POST `
  -Headers @{"Authorization"="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}
```

---

## 📊 **Monitor Queues (SQL)**

```sql
-- Queue status
SELECT 
  'scan' as queue, 
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing
FROM queue_scan
UNION ALL
SELECT 'parse', COUNT(*) FILTER (WHERE status = 'pending'), COUNT(*) FILTER (WHERE status = 'processing') FROM queue_parse
UNION ALL
SELECT 'ingest', COUNT(*) FILTER (WHERE status = 'pending'), COUNT(*) FILTER (WHERE status = 'processing') FROM queue_ingest;
```

---

## 🔗 **Important URLs**

- **Supabase Dashboard**: https://supabase.com/dashboard/project/aqpnksnxuiutwobkwzst
- **Google Cloud Console**: https://console.cloud.google.com/
- **OpenAI Platform**: https://platform.openai.com/

---

## 📝 **What You Need**

From Google Cloud:
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] Service Account JSON (entire file content)

From OpenAI:
- [ ] `OPENAI_API_KEY` (starts with `sk-`)

---

**Next Steps:**
1. Get credentials from Google Cloud & OpenAI
2. Set secrets in Supabase
3. Deploy Edge Functions
4. Schedule cron jobs
5. Test the system
6. Build mobile UI

**See SETUP_INSTRUCTIONS.md for detailed steps!**
