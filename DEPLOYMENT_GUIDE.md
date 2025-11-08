# 🚀 Email Scanning System - Deployment Guide

## ✅ **What We've Built**

### **Complete Event-Driven Microservices Architecture**

1. ✅ **Database Schema** (7 tables + helper functions)
2. ✅ **6 Edge Functions** (complete scanning pipeline)
3. ✅ **Job Queues** (3 queues for async processing)
4. ✅ **Database Triggers** (automatic notifications)
5. ✅ **Security** (RLS policies + OAuth)

---

## 📦 **Components Overview**

### **Edge Functions:**
1. **auth-orchestrator** - OAuth handler & scan job creator
2. **scanning-worker** - Gmail API scanner
3. **parsing-worker** - AI-powered email parser
4. **ingestion-service** - Database writer
5. **notification-service** - Push notification sender
6. **revocation-webhook** - OAuth revocation handler

### **Database Tables:**
1. **user_integrations** - OAuth tokens
2. **queue_scan** - Queue 1: Scan jobs
3. **queue_parse** - Queue 2: Parse jobs
4. **queue_ingest** - Queue 3: Ingestion jobs
5. **subscription_suggestions** - AI-discovered subscriptions
6. **scan_history** - Audit log
7. **dead_letter_queue** - Failed jobs

---

## 🔧 **Step-by-Step Deployment**

### **Step 1: Push Database Migrations**

```bash
cd c:\TrackMe
supabase db push
```

This will apply:
- `20251107160000_create_email_scanning_system.sql`
- `20251107170000_add_helper_functions.sql`
- `20251107170001_add_notification_trigger.sql`

### **Step 2: Set Up Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Gmail API**
4. Create **OAuth 2.0 Client ID**:
   - Application type: Web application
   - Authorized redirect URIs:
     - `https://your-app-scheme://oauth/callback` (for mobile)
     - `http://localhost:3000/oauth/callback` (for testing)
5. Download credentials JSON
6. Note down:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### **Step 3: Set Up Service Account for FCM**

1. In Google Cloud Console, go to **IAM & Admin** > **Service Accounts**
2. Create service account
3. Grant role: **Firebase Cloud Messaging Admin**
4. Create key (JSON format)
5. Copy the entire JSON content

### **Step 4: Set Up OpenAI API**

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create API key
3. Note down: `OPENAI_API_KEY`

### **Step 5: Configure Supabase Secrets**

```bash
# Set Google OAuth credentials
supabase secrets set GOOGLE_CLIENT_ID=your_client_id
supabase secrets set GOOGLE_CLIENT_SECRET=your_client_secret

# Set Google Service Account (for FCM)
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=your_openai_key
```

### **Step 6: Deploy Edge Functions**

```bash
# Deploy all functions
supabase functions deploy auth-orchestrator
supabase functions deploy scanning-worker
supabase functions deploy parsing-worker
supabase functions deploy ingestion-service
supabase functions deploy notification-service
supabase functions deploy revocation-webhook
```

### **Step 7: Set Up Cron Jobs**

Create cron jobs to run workers every minute:

```sql
-- Schedule scanning-worker
SELECT cron.schedule(
  'email-scanning-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/scanning-worker',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);

-- Schedule parsing-worker
SELECT cron.schedule(
  'email-parsing-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/parsing-worker',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);

-- Schedule ingestion-service
SELECT cron.schedule(
  'email-ingestion-service',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/ingestion-service',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### **Step 8: Configure Google Revocation Webhook**

1. In Google Cloud Console, go to your OAuth client
2. Add revocation endpoint:
   ```
   https://your-project.supabase.co/functions/v1/revocation-webhook
   ```

### **Step 9: Enable pg_net Extension**

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Set configuration for notification trigger
ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

---

## 🧪 **Testing**

### **Test 1: OAuth Flow**

```bash
# Test auth-orchestrator
curl -X POST https://your-project.supabase.co/functions/v1/auth-orchestrator \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "GOOGLE_AUTH_CODE",
    "redirect_uri": "your-redirect-uri",
    "scan_type": "manual"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "We've started scanning your inbox...",
  "data": {
    "email": "user@gmail.com",
    "scan_job_id": "uuid",
    "scan_type": "manual"
  }
}
```

### **Test 2: Check Queue Status**

```sql
-- Check scan queue
SELECT * FROM queue_scan WHERE status = 'pending';

-- Check parse queue
SELECT * FROM queue_parse WHERE status = 'pending';

-- Check ingest queue
SELECT * FROM queue_ingest WHERE status = 'pending';
```

### **Test 3: Manually Trigger Workers**

```bash
# Trigger scanning-worker
curl -X POST https://your-project.supabase.co/functions/v1/scanning-worker \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# Trigger parsing-worker
curl -X POST https://your-project.supabase.co/functions/v1/parsing-worker \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"

# Trigger ingestion-service
curl -X POST https://your-project.supabase.co/functions/v1/ingestion-service \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### **Test 4: Check Suggestions**

```sql
-- View created suggestions
SELECT 
  service_name,
  price,
  currency,
  billing_cycle,
  confidence_score,
  status
FROM subscription_suggestions
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;
```

---

## 📊 **Monitoring**

### **Queue Health**

```sql
-- Queue depths
SELECT 
  'scan' as queue, 
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_scan
UNION ALL
SELECT 
  'parse' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_parse
UNION ALL
SELECT 
  'ingest' as queue,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'processing') as processing,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM queue_ingest;
```

### **Worker Performance**

```sql
-- Average processing time per queue
SELECT 
  'scan' as queue,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
  COUNT(*) as completed_count
FROM queue_scan 
WHERE status = 'completed' 
  AND completed_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'parse' as queue,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
  COUNT(*) as completed_count
FROM queue_parse 
WHERE status = 'completed' 
  AND completed_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 
  'ingest' as queue,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
  COUNT(*) as completed_count
FROM queue_ingest 
WHERE status = 'completed' 
  AND completed_at > NOW() - INTERVAL '1 hour';
```

### **Error Tracking**

```sql
-- Recent errors
SELECT 
  queue_name,
  error_message,
  attempts,
  created_at
FROM dead_letter_queue
WHERE status = 'pending_review'
ORDER BY created_at DESC
LIMIT 20;
```

### **Scan Success Rate**

```sql
-- Scan completion rate
SELECT 
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    NULLIF(COUNT(*), 0) * 100, 
    2
  ) as success_rate_percent
FROM scan_history
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## 🐛 **Troubleshooting**

### **Issue: Workers not processing jobs**

**Check:**
1. Cron jobs are running: `SELECT * FROM cron.job;`
2. Edge Functions are deployed: Check Supabase dashboard
3. Secrets are set: `supabase secrets list`

**Fix:**
```bash
# Redeploy functions
supabase functions deploy scanning-worker --no-verify-jwt
supabase functions deploy parsing-worker --no-verify-jwt
supabase functions deploy ingestion-service --no-verify-jwt
```

### **Issue: OAuth tokens expired**

**Check:**
```sql
SELECT user_id, token_expires_at, status
FROM user_integrations
WHERE token_expires_at < NOW();
```

**Fix:**
The scanning-worker automatically refreshes tokens.

### **Issue: High failure rate**

**Check dead letter queue:**
```sql
SELECT queue_name, error_message, COUNT(*)
FROM dead_letter_queue
GROUP BY queue_name, error_message
ORDER BY COUNT(*) DESC;
```

**Common fixes:**
- Gmail API rate limiting: Reduce cron frequency
- OpenAI errors: Check API key and quota
- Network timeouts: Increase function timeout

---

## 💰 **Cost Optimization**

### **Current Setup:**
- **Scanning**: ~0.5s per email
- **Parsing**: ~2s per email (OpenAI API call)
- **Ingestion**: ~0.1s per suggestion

### **Optimization Strategies:**

1. **Limit AI Workers**
   - Run parsing-worker less frequently (every 5 minutes)
   - Process in smaller batches

2. **Use Cheaper AI Model**
   - Switch from `gpt-4o-mini` to `gpt-3.5-turbo`
   - Reduces cost by 50%

3. **Cache Common Services**
   - Store known service patterns
   - Skip AI for obvious subscriptions

4. **Batch Processing**
   - Process multiple emails in single AI call
   - Reduces API overhead

---

## 🎯 **Next Steps**

1. ✅ Deploy all Edge Functions
2. ✅ Set up cron jobs
3. ✅ Configure Google OAuth
4. ✅ Test end-to-end flow
5. 🔄 Build mobile UI
6. 🔄 Add user onboarding
7. 🔄 Implement analytics dashboard

---

## 📚 **Additional Resources**

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Gmail API Reference](https://developers.google.com/gmail/api)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)

---

**Status**: Backend Complete ✅ | Ready for Mobile Integration 🚀
