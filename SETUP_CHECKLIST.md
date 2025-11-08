# 📋 Email Scanning Setup Checklist

## ✅ **Progress Tracker**

- [x] Database migrations deployed
- [x] Edge Functions created
- [x] Google Service Account configured (FCM)
- [ ] Google OAuth credentials
- [ ] OpenAI API key
- [ ] Deploy Edge Functions
- [ ] Schedule cron jobs
- [ ] Test the system

---

## 🔑 **Step 1: Google OAuth Credentials**

### **What you need:**
- Google OAuth Client ID
- Google OAuth Client Secret

### **Instructions:**

1. **Open Google Cloud Console:**
   - Go to: https://console.cloud.google.com/
   - Select your project (or create new one)

2. **Enable Gmail API:**
   - Go to: **APIs & Services** > **Library**
   - Search: "Gmail API"
   - Click **Enable**

3. **Configure OAuth Consent Screen:**
   - Go to: **APIs & Services** > **OAuth consent screen**
   - User Type: **External**
   - App name: **TrackMe**
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**
   - Scopes: Click **Add or Remove Scopes**
     - Add: `https://www.googleapis.com/auth/gmail.readonly`
   - Click **Save and Continue**
   - Test users: Add your Gmail for testing
   - Click **Save and Continue**

4. **Create OAuth 2.0 Client:**
   - Go to: **APIs & Services** > **Credentials**
   - Click: **Create Credentials** > **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: **TrackMe Mobile**
   - Authorized redirect URIs:
     ```
     trackme://oauth/callback
     http://localhost:3000/oauth/callback
     ```
   - Click **Create**

5. **Copy Your Credentials:**
   ```
   Client ID: [Copy this - looks like: 123456-abc.apps.googleusercontent.com]
   Client Secret: [Copy this - looks like: GOCSPX-abc123...]
   ```

### **Set in Supabase:**

Once you have the credentials, run:

```powershell
supabase secrets set GOOGLE_CLIENT_ID="YOUR_CLIENT_ID_HERE"
supabase secrets set GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"
```

---

## 🤖 **Step 2: OpenAI API Key**

### **What you need:**
- OpenAI API Key

### **Instructions:**

1. **Go to OpenAI Platform:**
   - Visit: https://platform.openai.com/
   - Sign in or create account

2. **Add Billing (if not done):**
   - Go to: **Settings** > **Billing**
   - Add payment method
   - Add at least $5 credit

3. **Create API Key:**
   - Go to: **API Keys**
   - Click: **Create new secret key**
   - Name: **TrackMe Email Parser**
   - Click **Create**
   - **COPY THE KEY** (starts with `sk-`)
   - ⚠️ You won't see it again!

### **Set in Supabase:**

```powershell
supabase secrets set OPENAI_API_KEY="sk-YOUR_KEY_HERE"
```

---

## 🚀 **Step 3: Deploy Edge Functions**

Once all secrets are set, deploy the functions:

```powershell
cd c:\TrackMe

# Deploy all 6 functions
supabase functions deploy auth-orchestrator
supabase functions deploy scanning-worker
supabase functions deploy parsing-worker
supabase functions deploy ingestion-service
supabase functions deploy notification-service
supabase functions deploy revocation-webhook
```

---

## ⏰ **Step 4: Schedule Cron Jobs**

Copy and run this SQL in Supabase SQL Editor:

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
    headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}'::jsonb
  );$$
);

-- Verify cron jobs
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'email-%';
```

---

## 🧪 **Step 5: Test the System**

### **Test 1: Verify Functions Are Deployed**

```powershell
# Test scanning-worker (should return "No pending jobs")
Invoke-WebRequest -Uri "https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker" `
  -Method POST `
  -Headers @{"Authorization"="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"}
```

### **Test 2: Check Queue Status**

Run in Supabase SQL Editor:

```sql
-- Should show all zeros (no jobs yet)
SELECT 
  'scan' as queue, 
  COUNT(*) FILTER (WHERE status = 'pending') as pending
FROM queue_scan
UNION ALL
SELECT 'parse', COUNT(*) FILTER (WHERE status = 'pending') FROM queue_parse
UNION ALL
SELECT 'ingest', COUNT(*) FILTER (WHERE status = 'pending') FROM queue_ingest;
```

---

## 📊 **Current Status**

### **Completed:**
- ✅ Database schema deployed
- ✅ Edge Functions created (6 functions)
- ✅ Google Service Account configured
- ✅ Documentation complete

### **Remaining:**
- ⏳ Get Google OAuth credentials
- ⏳ Get OpenAI API key
- ⏳ Deploy Edge Functions
- ⏳ Schedule cron jobs
- ⏳ Test end-to-end

### **Estimated Time:**
- Google OAuth: 10 minutes
- OpenAI API: 5 minutes
- Deploy Functions: 5 minutes
- Schedule Cron: 2 minutes
- Testing: 5 minutes

**Total: ~30 minutes**

---

## 🎯 **Next Action**

**Start with Step 1:** Get Google OAuth credentials

1. Open: https://console.cloud.google.com/
2. Follow the instructions above
3. Come back with your Client ID and Client Secret
4. We'll set them in Supabase and continue!

---

## 📞 **Need Help?**

If you get stuck:
- Check the detailed SETUP_INSTRUCTIONS.md
- Review QUICK_DEPLOY.md for commands
- Let me know which step you're on!

**Let's do this! 🚀**
