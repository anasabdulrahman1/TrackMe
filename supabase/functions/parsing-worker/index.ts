// ============================================================================
// PARSING-WORKER - AI-Powered Email Parser
// ============================================================================
// This worker reads from Queue 2 (queue_parse) and uses AI to extract
// subscription details. It populates Queue 3 (queue_ingest).
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const WORKER_ID = `parsing-worker-${crypto.randomUUID().slice(0, 8)}`;
const MIN_CONFIDENCE = 0.7; // Minimum confidence to accept a suggestion

// ============================================================================
// TYPES
// ============================================================================

interface ParseJob {
  job_id: string;
  user_id: string;
  email_id: string;
  email_subject: string;
  email_snippet: string;
  email_from: string;
}

interface AIResponse {
  is_subscription: boolean;
  service_name: string | null;
  price: number | null;
  currency: string | null;
  billing_cycle: 'weekly' | 'monthly' | 'yearly' | null;
  confidence: number;
  reasoning?: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (_req) => {
  console.log(`[${WORKER_ID}] Starting parsing worker...`);

  try {
    // ========================================================================
    // 1. INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 2. GET NEXT JOB FROM QUEUE 2
    // ========================================================================

    const { data: jobs, error: jobError } = await supabase
      .rpc('get_next_parse_job', { p_worker_id: WORKER_ID });

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

    const job: ParseJob = jobs[0];
    console.log(`[${WORKER_ID}] Processing job: ${job.job_id}`);
    console.log(`[${WORKER_ID}] Email: ${job.email_subject}`);

    // ========================================================================
    // 3. CALL AI PARSER
    // ========================================================================

    let aiResponse: AIResponse;

    try {
      aiResponse = await parseEmailWithAI(job);
      console.log(`[${WORKER_ID}] AI Response:`, JSON.stringify(aiResponse));
    } catch (error: any) {
      console.error(`[${WORKER_ID}] AI parsing failed:`, error);
      await markJobFailed(supabase, job.job_id, error.message);
      return new Response(
        JSON.stringify({ error: 'AI parsing failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 4. VALIDATE AI RESPONSE
    // ========================================================================

    if (!aiResponse.is_subscription) {
      console.log(`[${WORKER_ID}] Not a subscription email, skipping`);
      await markJobSkipped(supabase, job.job_id, 'Not a subscription');
      return new Response(
        JSON.stringify({ message: 'Not a subscription' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (aiResponse.confidence < MIN_CONFIDENCE) {
      console.log(`[${WORKER_ID}] Low confidence (${aiResponse.confidence}), skipping`);
      await markJobSkipped(supabase, job.job_id, `Low confidence: ${aiResponse.confidence}`);
      return new Response(
        JSON.stringify({ message: 'Low confidence' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!aiResponse.service_name || !aiResponse.price || !aiResponse.billing_cycle) {
      console.log(`[${WORKER_ID}] Missing required fields, skipping`);
      await markJobSkipped(supabase, job.job_id, 'Missing required fields');
      return new Response(
        JSON.stringify({ message: 'Missing required fields' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 5. CREATE INGEST JOB IN QUEUE 3
    // ========================================================================

    const parsedData = {
      service_name: aiResponse.service_name,
      price: aiResponse.price,
      currency: aiResponse.currency || 'INR',
      billing_cycle: aiResponse.billing_cycle,
      confidence: aiResponse.confidence,
      email_id: job.email_id,
      email_subject: job.email_subject,
      email_snippet: job.email_snippet,
      email_from: job.email_from,
    };

    const { error: ingestError } = await supabase
      .from('queue_ingest')
      .insert({
        user_id: job.user_id,
        parse_job_id: job.job_id,
        parsed_data: parsedData,
        status: 'pending',
      });

    if (ingestError) {
      console.error(`[${WORKER_ID}] Error creating ingest job:`, ingestError);
      await markJobFailed(supabase, job.job_id, ingestError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to create ingest job' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${WORKER_ID}] Ingest job created successfully`);

    // ========================================================================
    // 6. MARK PARSE JOB AS COMPLETED
    // ========================================================================

    await markJobCompleted(supabase, job.job_id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.job_id,
        service_name: aiResponse.service_name,
        confidence: aiResponse.confidence,
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
// AI PARSING FUNCTIONS
// ============================================================================

/**
 * Parse email using OpenAI GPT-4
 */
async function parseEmailWithAI(job: ParseJob): Promise<AIResponse> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const prompt = buildPrompt(job);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Cost-effective model
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying subscription payment receipts from email data. You respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistent results
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON response
  try {
    const parsed = JSON.parse(content);
    return parsed as AIResponse;
  } catch (error) {
    console.error(`[${WORKER_ID}] Failed to parse AI response:`, content);
    throw new Error('Invalid AI response format');
  }
}

/**
 * Build AI prompt
 */
function buildPrompt(job: ParseJob): string {
  return `
Analyze this email and determine if it's a subscription payment receipt.

Email Subject: ${job.email_subject}
Email From: ${job.email_from}
Email Snippet: ${job.email_snippet}

Respond ONLY with valid JSON in this exact format:
{
  "is_subscription": boolean,
  "service_name": string | null,
  "price": number | null,
  "currency": string | null,
  "billing_cycle": "monthly" | "yearly" | "weekly" | null,
  "confidence": number (0.0 to 1.0)
}

Rules:
1. is_subscription: true ONLY if this is clearly a payment receipt for a recurring service
2. service_name: The name of the service (e.g., "Netflix", "Spotify", "Adobe Creative Cloud")
3. price: The amount charged (numeric only, no currency symbols)
4. currency: Currency code (e.g., "USD", "INR", "EUR")
5. billing_cycle: How often they're charged ("monthly", "yearly", or "weekly")
6. confidence: Your confidence level (0.0 to 1.0)

Examples of subscriptions:
- Netflix monthly payment
- Spotify Premium renewal
- Adobe Creative Cloud subscription
- AWS monthly bill
- GitHub Pro subscription

Examples of NOT subscriptions:
- One-time purchases
- Shipping notifications
- Promotional emails
- Order confirmations for physical goods
- Free trial notifications (unless payment was charged)

Be conservative. If unsure, set is_subscription to false.
`.trim();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Mark parse job as completed
 */
async function markJobCompleted(supabase: any, jobId: string) {
  await supabase
    .from('queue_parse')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId);
}

/**
 * Mark parse job as skipped
 */
async function markJobSkipped(supabase: any, jobId: string, reason: string) {
  await supabase
    .from('queue_parse')
    .update({
      status: 'skipped',
      completed_at: new Date().toISOString(),
      error_message: reason,
    })
    .eq('id', jobId);
}

/**
 * Mark parse job as failed
 */
async function markJobFailed(supabase: any, jobId: string, errorMessage: string) {
  await supabase
    .from('queue_parse')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
}
