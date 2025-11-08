# 🔧 Email Scanning System - Setup Instructions

## ✅ **Step 1: Database Migrations - COMPLETED**

All database tables and functions have been deployed successfully!

---

## 📋 **Step 2: Google Cloud Setup**

### **A. Create Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: **"TrackMe Email Scanner"**
3. Note your **Project ID**

### **B. Enable Gmail API**

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for **"Gmail API"**
3. Click **Enable**

### **C. Create OAuth 2.0 Credentials**

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client ID**
3. Configure consent screen:
   - User Type: **External**
   - App name: **TrackMe**
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `https://www.googleapis.com/auth/gmail.readonly`
4. Create OAuth Client:
   - Application type: **Web application** (for mobile, we'll add custom URI scheme)
   - Name: **TrackMe Mobile**
   - Authorized redirect URIs:
     ```
     trackme://oauth/callback
     http://localhost:3000/oauth/callback
     ```
5. **Download JSON** and note:
   - `client_id` (looks like: `123456789-abc.apps.googleusercontent.com`)
   - `client_secret` (looks like: `GOCSPX-abc123...`)

### **D. Create Service Account for FCM**

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
   - Name: **TrackMe FCM**
   - Description: **Firebase Cloud Messaging for push notifications**
3. Grant role: **Firebase Cloud Messaging Admin**
4. Click **Done**
5. Click on the service account you just created
6. Go to **Keys** tab
7. Click **Add Key** > **Create new key** > **JSON**
8. **Download the JSON file** - you'll need the entire content

---

## 🔑 **Step 3: OpenAI API Setup**

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to **API Keys**
4. Click **Create new secret key**
5. Name it: **TrackMe Email Parser**
6. **Copy the key** (starts with `sk-...`)
7. Note: You'll need to add billing info if you haven't already

---

## 🔐 **Step 4: Configure Supabase Secrets**

Now we'll set all the secrets in Supabase. Run these commands:

### **Set Google OAuth Credentials:**

```powershell
# Replace with your actual values
supabase secrets set GOOGLE_CLIENT_ID="YOUR_CLIENT_ID_HERE"
supabase secrets set GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"
```

### **Set Google Service Account (for FCM):**

```powershell
# Replace with the ENTIRE JSON content from the service account file
# Make sure to escape quotes properly or use single quotes
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

### **Set OpenAI API Key:**

```powershell
supabase secrets set OPENAI_API_KEY="YOUR_OPENAI_KEY_HERE"
```

### **Verify Secrets:**

```powershell
supabase secrets list
```

You should see:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_SERVICE_ACCOUNT_JSON
- OPENAI_API_KEY

---

## 🚀 **Step 5: Deploy Edge Functions**

Deploy all 6 Edge Functions:

```powershell
cd c:\TrackMe

# Deploy each function
supabase functions deploy auth-orchestrator
supabase functions deploy scanning-worker
supabase functions deploy parsing-worker
supabase functions deploy ingestion-service
supabase functions deploy notification-service
supabase functions deploy revocation-webhook
```

**Expected output for each:**
```
Deploying function...
Function deployed successfully!
URL: https://your-project.supabase.co/functions/v1/function-name
```

---

## ⏰ **Step 6: Set Up Cron Jobs (Worker Scheduling)**

We need to schedule the workers to run every minute. 

### **Option A: Using Supabase Dashboard (Recommended)**

1. Go to your Supabase project dashboard
2. Navigate to **Database** > **Functions**
3. Create these cron jobs:

**Scanning Worker:**
```sql
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);
```

**Parsing Worker:**
```sql
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);
```

**Ingestion Service:**
```sql
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);
```

### **Option B: Using SQL Editor**

Run this script in Supabase SQL Editor:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule scanning worker (every minute)
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);

-- Schedule parsing worker (every minute)
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);

-- Schedule ingestion service (every minute)
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI'
    )
  );
  $$
);

-- Verify cron jobs
SELECT * FROM cron.job;
```

---

## 🧪 **Step 7: Test the System**

### **Test 1: Check Database Tables**

```sql
-- Verify all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'user_integrations',
    'queue_scan',
    'queue_parse',
    'queue_ingest',
    'subscription_suggestions',
    'scan_history',
    'dead_letter_queue'
  )
ORDER BY table_name;
```

Expected: 7 rows

### **Test 2: Check Edge Functions**

Visit these URLs in your browser (you'll get auth errors, but that means they're deployed):

- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/auth-orchestrator
- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker
- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/parsing-worker
- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/ingestion-service
- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/notification-service
- https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/revocation-webhook

### **Test 3: Manually Trigger a Worker**

```powershell
# Test scanning-worker (should return "No pending jobs")
Invoke-WebRequest -Uri "https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/scanning-worker" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcG5rc254dWl1dHdvYmt3enN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjA1NzcwNywiZXhwIjoyMDc3NjMzNzA3fQ.QsvFNfhMihltdXq8aiyEJNISP5n0gSIHR525umobGfBI"
  }
```

Expected response:
```json
{"message":"No pending jobs"}
```

---

## 📊 **Step 8: Monitor the System**

### **Check Queue Status:**

```sql
-- Queue depths
SELECT 
  'scan' as queue, 
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_scan
UNION ALL
SELECT 
  'parse' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_parse
UNION ALL
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;
```

### **Check Cron Jobs:**

```sql
-- View scheduled jobs
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname LIKE 'email-%';
```

### **View Logs:**

Go to Supabase Dashboard > **Edge Functions** > Select a function > **Logs**

---

## ✅ **Checklist**

- [ ] Database migrations pushed
- [ ] Google Cloud project created
- [ ] Gmail API enabled
- [ ] OAuth 2.0 credentials created
- [ ] Service account created for FCM
- [ ] OpenAI API key obtained
- [ ] All secrets configured in Supabase
- [ ] All 6 Edge Functions deployed
- [ ] Cron jobs scheduled
- [ ] System tested and monitoring

---

## 🎯 **Next: Build Mobile UI**

Once everything is set up and tested, we'll build:

1. **Gmail Connection Screen** - OAuth flow
2. **Suggestion Inbox** - Review AI-discovered subscriptions
3. **Approve/Reject** - One-tap actions
4. **Scan History** - View past scans

---

## 🆘 **Troubleshooting**

### **Issue: "No pending jobs" but I created a scan job**

Check if the job exists:
```sql
SELECT * FROM queue_scan ORDER BY created_at DESC LIMIT 5;
```

### **Issue: Workers not processing**

Check cron jobs are running:
```sql
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE 'email-%' 
ORDER BY start_time DESC 
LIMIT 10;
```

### **Issue: OAuth errors**

Verify secrets are set:
```powershell
supabase secrets list
```

---

**Ready to proceed? Let me know when you've completed the setup steps!** 🚀
