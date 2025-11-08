// ============================================================================
// SCANNING-WORKER - Gmail API Scanner
// ============================================================================
// This worker reads from Queue 1 (queue_scan) and scans Gmail for receipts.
// It uses a two-pronged search strategy and populates Queue 2 (queue_parse).
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const WORKER_ID = `scanning-worker-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_SIZE = 50; // Process 50 emails per batch
const MAX_RESULTS = 500; // Maximum emails to scan per job

// Known subscription service senders
const KNOWN_SENDERS = [
  'netflix.com',
  'spotify.com',
  'adobe.com',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'github.com',
  'digitalocean.com',
  'aws.amazon.com',
  'google.com',
  'dropbox.com',
  'zoom.us',
  'slack.com',
  'notion.so',
  'figma.com',
  'canva.com',
  'grammarly.com',
  'evernote.com',
  'trello.com',
  'asana.com',
];

// Subscription-related keywords
const KEYWORDS = [
  'subscription',
  'billed monthly',
  'billed annually',
  'recurring payment',
  'auto-renewal',
  'membership fee',
  'monthly charge',
  'annual charge',
  'payment confirmation',
  'invoice',
  'receipt',
  'your payment',
];

// ============================================================================
// TYPES
// ============================================================================

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (_req) => {
  console.log(`[${WORKER_ID}] Starting scan worker...`);

  try {
    // ========================================================================
    // 1. INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 2. GET NEXT JOB FROM QUEUE 1
    // ========================================================================

    const { data: jobs, error: jobError } = await supabase
      .rpc('get_next_scan_job', { p_worker_id: WORKER_ID });

    if (jobError) {
      console.error(`[${WORKER_ID}] Error fetching job:`, jobError);
      throw jobError;
    }

    if (!jobs || jobs.length === 0) {
      console.log(`[${WORKER_ID}] No pending jobs. Exiting.`);
      return new Response(
        JSON.stringify({ message: 'No pending jobs' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const job = jobs[0];
    console.log(`[${WORKER_ID}] Processing job: ${job.job_id} for user: ${job.user_id}`);

    // ========================================================================
    // 3. GET USER'S OAUTH TOKENS
    // ========================================================================

    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', job.user_id)
      .eq('provider', 'google')
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      console.error(`[${WORKER_ID}] No active Google integration found`);
      await markJobFailed(supabase, job.job_id, 'No active Google integration');
      return new Response(
        JSON.stringify({ error: 'No active integration' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 4. REFRESH ACCESS TOKEN IF NEEDED
    // ========================================================================

    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.token_expires_at);

    if (expiresAt < new Date()) {
      console.log(`[${WORKER_ID}] Access token expired, refreshing...`);
      accessToken = await refreshAccessToken(supabase, integration);
    }

    // ========================================================================
    // 5. BUILD GMAIL SEARCH QUERY
    // ========================================================================

    const query = buildGmailQuery(job.scan_type);
    console.log(`[${WORKER_ID}] Gmail query: ${query}`);

    // ========================================================================
    // 6. SEARCH GMAIL
    // ========================================================================

    const messageIds = await searchGmail(accessToken, query);
    console.log(`[${WORKER_ID}] Found ${messageIds.length} potential emails`);

    if (messageIds.length === 0) {
      await markJobCompleted(supabase, job.job_id, 0);
      return new Response(
        JSON.stringify({ message: 'No emails found', scanned: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 7. FETCH EMAIL DETAILS IN BATCHES
    // ========================================================================

    let processedCount = 0;
    const parseJobs = [];

    for (let i = 0; i < messageIds.length && i < MAX_RESULTS; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);

      for (const msgId of batch) {
        try {
          const message = await getGmailMessage(accessToken, msgId);

          // Extract headers
          const subject = getHeader(message, 'Subject') || '';
          const from = getHeader(message, 'From') || '';
          const date = new Date(parseInt(message.internalDate));

          // Create parse job
          parseJobs.push({
            user_id: job.user_id,
            scan_job_id: job.job_id,
            email_id: message.id,
            email_subject: subject,
            email_snippet: message.snippet,
            email_from: from,
            email_date: date.toISOString(),
            status: 'pending',
          });

          processedCount++;
        } catch (error) {
          console.error(`[${WORKER_ID}] Error fetching message ${msgId}:`, error);
          // Continue with next message
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ========================================================================
    // 8. INSERT PARSE JOBS INTO QUEUE 2
    // ========================================================================

    if (parseJobs.length > 0) {
      const { error: insertError } = await supabase
        .from('queue_parse')
        .insert(parseJobs);

      if (insertError) {
        console.error(`[${WORKER_ID}] Error inserting parse jobs:`, insertError);
        // Don't fail the entire job, just log it
      } else {
        console.log(`[${WORKER_ID}] Created ${parseJobs.length} parse jobs`);
      }
    }

    // ========================================================================
    // 9. UPDATE SCAN HISTORY
    // ========================================================================

    await supabase
      .from('scan_history')
      .update({
        emails_scanned: processedCount,
        status: 'completed',
        scan_completed_at: new Date().toISOString(),
      })
      .eq('scan_job_id', job.job_id);

    // ========================================================================
    // 10. MARK JOB AS COMPLETED
    // ========================================================================

    await markJobCompleted(supabase, job.job_id, processedCount);

    // Update integration last_scan_at
    await supabase
      .from('user_integrations')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('user_id', job.user_id)
      .eq('provider', 'google');

    console.log(`[${WORKER_ID}] Job completed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.job_id,
        emails_scanned: processedCount,
        parse_jobs_created: parseJobs.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(`[${WORKER_ID}] Fatal error:`, error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        worker_id: WORKER_ID,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build Gmail search query based on scan type
 */
function buildGmailQuery(scanType: string): string {
  const today = new Date();
  let afterDate: Date;

  switch (scanType) {
    case 'deep-365-day':
      afterDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'daily-2-day':
      afterDate = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      break;
    default:
      afterDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
  }

  const afterDateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');

  // Build sender query
  const senderQuery = KNOWN_SENDERS.map(s => `from:${s}`).join(' OR ');

  // Build keyword query
  const keywordQuery = KEYWORDS.map(k => `"${k}"`).join(' OR ');

  // Combine queries
  return `(${senderQuery}) OR subject:(${keywordQuery}) -in:spam -in:promotions after:${afterDateStr}`;
}

/**
 * Search Gmail using the API
 */
async function searchGmail(accessToken: string, query: string): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
    }

    const data: GmailListResponse = await response.json();

    if (data.messages) {
      messageIds.push(...data.messages.map(m => m.id));
    }

    pageToken = data.nextPageToken;

    // Limit to prevent infinite loops
    if (messageIds.length >= MAX_RESULTS) {
      break;
    }
  } while (pageToken);

  return messageIds;
}

/**
 * Get full message details from Gmail
 */
async function getGmailMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch message ${messageId}: ${response.status}`);
  }

  return await response.json();
}

/**
 * Extract header value from Gmail message
 */
function getHeader(message: GmailMessage, headerName: string): string | null {
  const header = message.payload.headers.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header ? header.value : null;
}

/**
 * Refresh OAuth access token
 */
async function refreshAccessToken(supabase: any, integration: any): Promise<string> {
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Update tokens in database
  await supabase
    .from('user_integrations')
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
    })
    .eq('id', integration.id);

  return data.access_token;
}

/**
 * Mark scan job as completed
 */
async function markJobCompleted(supabase: any, jobId: string, emailsScanned: number) {
  await supabase
    .from('queue_scan')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId);
}

/**
 * Mark scan job as failed
 */
async function markJobFailed(supabase: any, jobId: string, errorMessage: string) {
  await supabase
    .from('queue_scan')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
}
