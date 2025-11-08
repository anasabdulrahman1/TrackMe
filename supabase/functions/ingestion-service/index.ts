// ============================================================================
// INGESTION-SERVICE - Database Writer
// ============================================================================
// This service reads from Queue 3 (queue_ingest) and writes subscription
// suggestions to the database. It handles deduplication and merging.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const WORKER_ID = `ingestion-service-${crypto.randomUUID().slice(0, 8)}`;

// ============================================================================
// TYPES
// ============================================================================

interface IngestJob {
  job_id: string;
  user_id: string;
  parsed_data: {
    service_name: string;
    price: number;
    currency: string;
    billing_cycle: string;
    confidence: number;
    email_id: string;
    email_subject: string;
    email_snippet: string;
    email_from: string;
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (_req) => {
  console.log(`[${WORKER_ID}] Starting ingestion service...`);

  try {
    // ========================================================================
    // 1. INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 2. GET NEXT JOB FROM QUEUE 3
    // ========================================================================

    const { data: jobs, error: jobError } = await supabase
      .rpc('get_next_ingest_job', { p_worker_id: WORKER_ID });

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

    const job: IngestJob = jobs[0];
    console.log(`[${WORKER_ID}] Processing job: ${job.job_id}`);
    console.log(`[${WORKER_ID}] Service: ${job.parsed_data.service_name}`);

    // ========================================================================
    // 3. CHECK FOR DUPLICATE SUGGESTION
    // ========================================================================

    const { data: existingSuggestion } = await supabase
      .from('subscription_suggestions')
      .select('id, status')
      .eq('user_id', job.user_id)
      .eq('email_id', job.parsed_data.email_id)
      .maybeSingle();

    if (existingSuggestion) {
      console.log(`[${WORKER_ID}] Duplicate suggestion found, skipping`);
      await markJobDuplicate(supabase, job.job_id);
      return new Response(
        JSON.stringify({ message: 'Duplicate suggestion' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 4. CHECK FOR EXISTING SUBSCRIPTION
    // ========================================================================

    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('id, name, price, billing_cycle')
      .eq('user_id', job.user_id)
      .ilike('name', `%${job.parsed_data.service_name}%`)
      .eq('status', 'active')
      .maybeSingle();

    let suggestionStatus = 'pending';
    let subscriptionId = null;

    if (existingSubscription) {
      console.log(`[${WORKER_ID}] Found existing subscription: ${existingSubscription.name}`);

      // Check if price or cycle has changed
      const priceChanged = Math.abs(existingSubscription.price - job.parsed_data.price) > 0.01;
      const cycleChanged = existingSubscription.billing_cycle !== job.parsed_data.billing_cycle;

      if (priceChanged || cycleChanged) {
        console.log(`[${WORKER_ID}] Price or cycle changed, creating alert suggestion`);
        // Keep as pending so user can review the change
        suggestionStatus = 'pending';
      } else {
        console.log(`[${WORKER_ID}] No changes detected, auto-merging`);
        suggestionStatus = 'auto_merged';
        subscriptionId = existingSubscription.id;
      }
    }

    // ========================================================================
    // 5. CALCULATE NEXT PAYMENT DATE
    // ========================================================================

    const nextPaymentDate = calculateNextPaymentDate(job.parsed_data.billing_cycle);

    // ========================================================================
    // 6. INSERT SUBSCRIPTION SUGGESTION
    // ========================================================================

    const { data: suggestion, error: insertError } = await supabase
      .from('subscription_suggestions')
      .insert({
        user_id: job.user_id,
        email_id: job.parsed_data.email_id,
        email_subject: job.parsed_data.email_subject,
        email_snippet: job.parsed_data.email_snippet,
        email_from: job.parsed_data.email_from,
        email_date: new Date().toISOString(),
        service_name: job.parsed_data.service_name,
        price: job.parsed_data.price,
        currency: job.parsed_data.currency,
        billing_cycle: job.parsed_data.billing_cycle,
        next_payment_date: nextPaymentDate,
        confidence_score: job.parsed_data.confidence,
        status: suggestionStatus,
        subscription_id: subscriptionId,
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[${WORKER_ID}] Error inserting suggestion:`, insertError);
      await markJobFailed(supabase, job.job_id, insertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to create suggestion' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${WORKER_ID}] Suggestion created: ${suggestion.id}`);

    // ========================================================================
    // 7. UPDATE SCAN HISTORY
    // ========================================================================

    // Find the scan history entry and increment suggestions_created
    const { data: parseJob } = await supabase
      .from('queue_parse')
      .select('scan_job_id')
      .eq('id', job.job_id)
      .maybeSingle();

    if (parseJob?.scan_job_id) {
      await supabase.rpc('increment_suggestions_count', {
        p_scan_job_id: parseJob.scan_job_id,
      });
    }

    // ========================================================================
    // 8. MARK INGEST JOB AS COMPLETED
    // ========================================================================

    await markJobCompleted(supabase, job.job_id, suggestion.id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.job_id,
        suggestion_id: suggestion.id,
        service_name: job.parsed_data.service_name,
        status: suggestionStatus,
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
 * Calculate next payment date based on billing cycle
 */
function calculateNextPaymentDate(billingCycle: string): string {
  const today = new Date();
  let nextDate: Date;

  switch (billingCycle) {
    case 'weekly':
      nextDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      nextDate = new Date(today);
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'yearly':
      nextDate = new Date(today);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      nextDate = new Date(today);
      nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate.toISOString().split('T')[0];
}

/**
 * Mark ingest job as completed
 */
async function markJobCompleted(supabase: any, jobId: string, suggestionId: string) {
  await supabase
    .from('queue_ingest')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      suggestion_id: suggestionId,
      error_message: null,
    })
    .eq('id', jobId);
}

/**
 * Mark ingest job as duplicate
 */
async function markJobDuplicate(supabase: any, jobId: string) {
  await supabase
    .from('queue_ingest')
    .update({
      status: 'duplicate',
      completed_at: new Date().toISOString(),
      error_message: 'Duplicate suggestion already exists',
    })
    .eq('id', jobId);
}

/**
 * Mark ingest job as failed
 */
async function markJobFailed(supabase: any, jobId: string, errorMessage: string) {
  await supabase
    .from('queue_ingest')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
}
