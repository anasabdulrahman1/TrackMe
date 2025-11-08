// ============================================================================
// REVOCATION-WEBHOOK - OAuth Revocation Handler
// ============================================================================
// This webhook is called by Google when a user revokes our app's access.
// It immediately deletes the user's OAuth tokens from our database.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  console.log('[revocation-webhook] Received revocation event');

  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    });
  }

  try {
    // ========================================================================
    // 1. PARSE WEBHOOK PAYLOAD
    // ========================================================================

    const contentType = req.headers.get('content-type');

    let token: string | null = null;

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      // Google sends revocation as form data
      const formData = await req.formData();
      token = formData.get('token') as string;
    } else if (contentType?.includes('application/json')) {
      // Some implementations send JSON
      const body = await req.json();
      token = body.token || body.refresh_token;
    }

    if (!token) {
      console.error('[revocation-webhook] No token in payload');
      return new Response(
        JSON.stringify({ error: 'Missing token' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[revocation-webhook] Token revoked: ${token.substring(0, 10)}...`);

    // ========================================================================
    // 2. INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 3. FIND AND UPDATE INTEGRATION
    // ========================================================================

    // Find integration by refresh_token or access_token
    const { data: integration, error: findError } = await supabase
      .from('user_integrations')
      .select('id, user_id, provider_user_id')
      .eq('provider', 'google')
      .or(`refresh_token.eq.${token},access_token.eq.${token}`)
      .maybeSingle();

    if (findError) {
      console.error('[revocation-webhook] Error finding integration:', findError);
      throw findError;
    }

    if (!integration) {
      console.log('[revocation-webhook] Integration not found, may have been already deleted');
      return new Response(
        JSON.stringify({ message: 'Integration not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[revocation-webhook] Found integration for user: ${integration.user_id}`);

    // ========================================================================
    // 4. UPDATE INTEGRATION STATUS
    // ========================================================================

    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({
        status: 'revoked',
        access_token: null,
        refresh_token: null,
        last_error: 'User revoked access',
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('[revocation-webhook] Error updating integration:', updateError);
      throw updateError;
    }

    console.log('[revocation-webhook] Integration marked as revoked');

    // ========================================================================
    // 5. CANCEL ANY PENDING SCAN JOBS
    // ========================================================================

    const { error: cancelError } = await supabase
      .from('queue_scan')
      .update({
        status: 'failed',
        error_message: 'User revoked Gmail access',
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', integration.user_id)
      .in('status', ['pending', 'processing']);

    if (cancelError) {
      console.error('[revocation-webhook] Error canceling scan jobs:', cancelError);
      // Don't throw, this is not critical
    }

    // ========================================================================
    // 6. OPTIONALLY NOTIFY USER
    // ========================================================================

    // You could send a push notification here to inform the user
    // that their Gmail connection has been disconnected

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Integration revoked successfully',
        user_id: integration.user_id,
        email: integration.provider_user_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[revocation-webhook] Error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// SETUP INSTRUCTIONS
// ============================================================================

/*
To set up this webhook with Google:

1. Go to Google Cloud Console
2. Navigate to your OAuth 2.0 Client
3. Add this URL as a revocation endpoint:
   https://your-project.supabase.co/functions/v1/revocation-webhook

4. Google will call this endpoint when users revoke access from:
   - https://myaccount.google.com/permissions
   - Your app's settings

5. Test the webhook:
   curl -X POST https://your-project.supabase.co/functions/v1/revocation-webhook \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "token=YOUR_REFRESH_TOKEN"
*/
