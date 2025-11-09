// ============================================================================
// PARSING-WORKER - Pattern-Based Email Parser
// ============================================================================
// This worker reads from Queue 2 (queue_parse) and uses regex patterns to
// extract subscription details. It populates Queue 3 (queue_ingest).
// Zero cost, instant processing, learns from user feedback over time.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const WORKER_ID = `parsing-worker-${crypto.randomUUID().slice(0, 8)}`;
const MIN_CONFIDENCE = 0.6; // Lower threshold for pattern matching
const BATCH_SIZE = 50; // Process 50 jobs per invocation for speed

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

interface ParseResult {
  is_subscription: boolean;
  service_name: string | null;
  price: number | null;
  currency: string | null;
  billing_cycle: 'weekly' | 'monthly' | 'yearly' | null;
  confidence: number;
  reasoning: string;
  matched_patterns: string[];
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
      .rpc('get_next_parse_job', { p_worker_id: WORKER_ID, p_batch_size: BATCH_SIZE });

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

    console.log(`[${WORKER_ID}] Processing ${jobs.length} jobs in batch...`);

    // ========================================================================
    // 3. PROCESS JOBS IN BATCH
    // ========================================================================

    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const job of jobs) {
      try {
        console.log(`[${WORKER_ID}] Processing job ${processedCount + skippedCount + failedCount + 1}/${jobs.length}: ${job.email_subject}`);
        
        const parseResult = parseEmailWithPatterns(job);

        // Check if it's a subscription
        if (!parseResult.is_subscription || parseResult.confidence < MIN_CONFIDENCE) {
          await markJobSkipped(supabase, job.job_id, parseResult.reasoning);
          skippedCount++;
          continue;
        }

        // Create ingest job
        const ingestData = {
          email_id: job.email_id,
          email_subject: job.email_subject,
          email_snippet: job.email_snippet,
          email_from: job.email_from,
          service_name: parseResult.service_name,
          price: parseResult.price,
          currency: parseResult.currency,
          billing_cycle: parseResult.billing_cycle,
          confidence: parseResult.confidence,
          matched_patterns: parseResult.matched_patterns,
        };

        const { error: ingestError } = await supabase
          .from('queue_ingest')
          .insert({
            user_id: job.user_id,
            parsed_data: ingestData,
            status: 'pending',
          });

        if (ingestError) {
          console.error(`[${WORKER_ID}] Failed to create ingest job:`, ingestError);
          await markJobFailed(supabase, job.job_id, ingestError.message);
          failedCount++;
          continue;
        }

        // Mark job as completed
        await markJobCompleted(supabase, job.job_id);
        processedCount++;

      } catch (error: unknown) {
        console.error(`[${WORKER_ID}] Error processing job ${job.job_id}:`, error);
        await markJobFailed(supabase, job.job_id, error instanceof Error ? error.message : 'Unknown error');
        failedCount++;
      }
    }

    console.log(`[${WORKER_ID}] Batch complete: ${processedCount} processed, ${skippedCount} skipped, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: processedCount,
        skipped: skippedCount,
        failed: failedCount,
        total: jobs.length
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[${WORKER_ID}] Fatal error:`, error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        worker_id: WORKER_ID,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// PATTERN-BASED PARSING FUNCTIONS
// ============================================================================

/**
 * Parse email using comprehensive regex patterns
 * This function uses multiple pattern matching strategies to identify subscriptions
 */
function parseEmailWithPatterns(job: ParseJob): ParseResult {
  const text = `${job.email_subject} ${job.email_snippet}`.toLowerCase();
  const matchedPatterns: string[] = [];
  
  // ========================================================================
  // STEP 1: Check if it's subscription-related
  // ========================================================================
  
  const subscriptionScore = calculateSubscriptionScore(text, job.email_from, matchedPatterns);
  
  if (subscriptionScore < 0.3) {
    return {
      is_subscription: false,
      service_name: null,
      price: null,
      currency: null,
      billing_cycle: null,
      confidence: 1.0 - subscriptionScore,
      reasoning: 'No subscription indicators found',
      matched_patterns: [],
    };
  }
  
  // ========================================================================
  // STEP 2: Extract subscription details
  // ========================================================================
  
  const serviceName = extractServiceName(job.email_from, job.email_subject, matchedPatterns);
  const price = extractPrice(text, matchedPatterns);
  const currency = extractCurrency(text, matchedPatterns);
  const billingCycle = extractBillingCycle(text, matchedPatterns);
  
  // ========================================================================
  // STEP 3: Calculate confidence score
  // ========================================================================
  
  let confidence = subscriptionScore;
  
  // Boost confidence based on extracted data
  if (price !== null) confidence += 0.15;
  if (currency !== null) confidence += 0.05;
  if (billingCycle !== null) confidence += 0.10;
  if (serviceName && serviceName.length > 2) confidence += 0.10;
  
  // Cap confidence at 0.95 (never 100% certain with patterns)
  confidence = Math.min(confidence, 0.95);
  
  return {
    is_subscription: true,
    service_name: serviceName,
    price,
    currency,
    billing_cycle: billingCycle,
    confidence,
    reasoning: `Matched ${matchedPatterns.length} patterns`,
    matched_patterns: matchedPatterns,
  };
}

/**
 * Calculate subscription likelihood score (0.0 to 1.0)
 */
function calculateSubscriptionScore(text: string, from: string, matchedPatterns: string[]): number {
  let score = 0.0;
  
  // High-confidence subscription keywords (0.3 each)
  const highConfidenceKeywords = [
    'subscription', 'recurring payment', 'membership renewed',
    'auto-renewal', 'billing statement', 'payment successful',
    'subscription renewed', 'monthly charge', 'annual charge'
  ];
  
  for (const keyword of highConfidenceKeywords) {
    if (text.includes(keyword)) {
      score += 0.3;
      matchedPatterns.push(`high_confidence:${keyword}`);
      break; // Only count once
    }
  }
  
  // Medium-confidence keywords (0.2 each)
  const mediumConfidenceKeywords = [
    'invoice', 'receipt', 'payment received', 'charged',
    'billing', 'premium', 'pro plan', 'plus plan'
  ];
  
  for (const keyword of mediumConfidenceKeywords) {
    if (text.includes(keyword)) {
      score += 0.2;
      matchedPatterns.push(`medium_confidence:${keyword}`);
      break;
    }
  }
  
  // Billing cycle indicators (0.15)
  if (/\b(monthly|yearly|annual|weekly)\b/i.test(text)) {
    score += 0.15;
    matchedPatterns.push('billing_cycle_found');
  }
  
  // Price indicators (0.15)
  if (/[$₹€£¥]\s*[0-9]+|[0-9]+\s*[$₹€£¥]|usd|inr|eur|gbp/i.test(text)) {
    score += 0.15;
    matchedPatterns.push('price_found');
  }
  
  // Known subscription service senders (0.2)
  const knownServices = [
    'netflix', 'spotify', 'amazon', 'apple', 'microsoft', 'adobe',
    'google', 'youtube', 'dropbox', 'github', 'slack', 'zoom',
    'notion', 'figma', 'canva', 'grammarly', 'linkedin', 'aws'
  ];
  
  const fromLower = from.toLowerCase();
  for (const service of knownServices) {
    if (fromLower.includes(service)) {
      score += 0.2;
      matchedPatterns.push(`known_service:${service}`);
      break;
    }
  }
  
  // Negative indicators (reduce score)
  const negativeKeywords = [
    'security alert', 'password reset', 'verify your', 'confirm your email',
    'welcome', 'getting started', 'free trial', 'promotional',
    'shipping', 'delivered', 'tracking', 'order confirmation'
  ];
  
  for (const keyword of negativeKeywords) {
    if (text.includes(keyword)) {
      score -= 0.2;
      matchedPatterns.push(`negative:${keyword}`);
      break;
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Extract service name from email sender or subject
 */
function extractServiceName(from: string, subject: string, matchedPatterns: string[]): string {
  // Strategy 1: Extract from sender name (before email)
  const nameMatch = from.match(/^([^<]+)\s*</);  if (nameMatch) {
    let name = nameMatch[1].trim();
    // Clean up common patterns
    name = name.replace(/\b(team|support|billing|noreply|no-reply)\b/gi, '').trim();
    if (name.length > 2 && name.length < 50) {
      matchedPatterns.push('service_from_sender_name');
      return capitalize(name);
    }
  }
  
  // Strategy 2: Extract from email domain
  const emailMatch = from.match(/<[^@]+@([^>]+)>/);
  if (emailMatch) {
    const domain = emailMatch[1];
    // Remove common TLDs and subdomains
    const parts = domain.split('.');
    const serviceName = parts[parts.length - 2] || parts[0];
    
    // Skip generic domains
    const genericDomains = ['gmail', 'yahoo', 'outlook', 'hotmail', 'mail', 'email'];
    if (!genericDomains.includes(serviceName.toLowerCase())) {
      matchedPatterns.push('service_from_domain');
      return capitalize(serviceName);
    }
  }
  
  // Strategy 3: Extract from subject line
  const subjectWords = subject.split(/[\s\-_:]+/).filter(w => w.length > 2);
  if (subjectWords.length > 0) {
    // Look for capitalized words (likely service names)
    for (const word of subjectWords) {
      if (/^[A-Z][a-z]+/.test(word) && word.length > 2) {
        matchedPatterns.push('service_from_subject');
        return word;
      }
    }
    // Fallback to first few words
    const firstWords = subjectWords.slice(0, 2).join(' ');
    if (firstWords.length > 2) {
      matchedPatterns.push('service_from_subject_fallback');
      return capitalize(firstWords);
    }
  }
  
  matchedPatterns.push('service_name_unknown');
  return 'Unknown Service';
}

/**
 * Extract price from text using comprehensive patterns
 */
function extractPrice(text: string, matchedPatterns: string[]): number | null {
  // Pattern 1: Currency symbol followed by number ($9.99, ₹499)
  const pattern1 = /[$₹€£¥]\s*([0-9]+(?:[.,][0-9]{1,2})?)/g;
  let match = pattern1.exec(text);
  if (match) {
    const price = parseFloat(match[1].replace(',', '.'));
    if (isValidPrice(price)) {
      matchedPatterns.push('price_pattern_1');
      return price;
    }
  }
  
  // Pattern 2: Number followed by currency (499 INR, 9.99 USD)
  const pattern2 = /([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:usd|inr|eur|gbp|rs\.?|rupees?)/gi;
  match = pattern2.exec(text);
  if (match) {
    const price = parseFloat(match[1].replace(',', '.'));
    if (isValidPrice(price)) {
      matchedPatterns.push('price_pattern_2');
      return price;
    }
  }
  
  // Pattern 3: Context-based (charged, paid, total, amount)
  const pattern3 = /(?:charged|paid|total|amount|price)\s*:?\s*[$₹€£¥]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi;
  match = pattern3.exec(text);
  if (match) {
    const price = parseFloat(match[1].replace(',', '.'));
    if (isValidPrice(price)) {
      matchedPatterns.push('price_pattern_3');
      return price;
    }
  }
  
  // Pattern 4: Invoice/receipt patterns
  const pattern4 = /(?:invoice|receipt|bill)\s*(?:for|of)?\s*[$₹€£¥]?\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi;
  match = pattern4.exec(text);
  if (match) {
    const price = parseFloat(match[1].replace(',', '.'));
    if (isValidPrice(price)) {
      matchedPatterns.push('price_pattern_4');
      return price;
    }
  }
  
  return null;
}

/**
 * Validate if price is reasonable for a subscription
 */
function isValidPrice(price: number): boolean {
  return price > 0 && price < 50000; // Reasonable subscription range
}

/**
 * Extract currency from text
 */
function extractCurrency(text: string, matchedPatterns: string[]): string | null {
  // Check for currency symbols
  if (text.includes('$') || /\busd\b/i.test(text)) {
    matchedPatterns.push('currency_usd');
    return 'USD';
  }
  if (text.includes('₹') || /\b(inr|rs\.?|rupees?)\b/i.test(text)) {
    matchedPatterns.push('currency_inr');
    return 'INR';
  }
  if (text.includes('€') || /\beur(o)?\b/i.test(text)) {
    matchedPatterns.push('currency_eur');
    return 'EUR';
  }
  if (text.includes('£') || /\bgbp\b/i.test(text) || /\bpounds?\b/i.test(text)) {
    matchedPatterns.push('currency_gbp');
    return 'GBP';
  }
  if (text.includes('¥') || /\b(jpy|yen)\b/i.test(text)) {
    matchedPatterns.push('currency_jpy');
    return 'JPY';
  }
  
  return null;
}

/**
 * Extract billing cycle from text
 */
function extractBillingCycle(text: string, matchedPatterns: string[]): 'weekly' | 'monthly' | 'yearly' | null {
  if (/\b(week|weekly)\b/i.test(text)) {
    matchedPatterns.push('cycle_weekly');
    return 'weekly';
  }
  if (/\b(month|monthly)\b/i.test(text)) {
    matchedPatterns.push('cycle_monthly');
    return 'monthly';
  }
  if (/\b(year|yearly|annual|annually)\b/i.test(text)) {
    matchedPatterns.push('cycle_yearly');
    return 'yearly';
  }
  
  return null;
}

/**
 * Capitalize first letter of each word
 */
function capitalize(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Mark parse job as completed
 */
async function markJobCompleted(supabase: SupabaseClient, jobId: string) {
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
async function markJobSkipped(supabase: SupabaseClient, jobId: string, reason: string) {
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
async function markJobFailed(supabase: SupabaseClient, jobId: string, errorMessage: string) {
  await supabase
    .from('queue_parse')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
}
