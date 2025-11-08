// ============================================================================
// NOTIFICATION-SERVICE - Push Notification Sender
// ============================================================================
// This service is triggered when new suggestions are created.
// It batches suggestions and sends a single push notification to the user.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BATCH_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// TYPES
// ============================================================================

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  console.log('[notification-service] Triggered');

  try {
    // ========================================================================
    // 1. PARSE WEBHOOK PAYLOAD
    // ========================================================================

    const payload = await req.json();
    console.log('[notification-service] Payload:', JSON.stringify(payload));

    // Extract user_id from the new suggestion
    const userId = payload.record?.user_id;

    if (!userId) {
      console.log('[notification-service] No user_id in payload');
      return new Response(JSON.stringify({ message: 'No user_id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // 2. WAIT FOR BATCHING
    // ========================================================================

    console.log(`[notification-service] Waiting ${BATCH_DELAY_MS}ms for batching...`);
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));

    // ========================================================================
    // 3. INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 4. COUNT PENDING SUGGESTIONS
    // ========================================================================

    const { data: suggestions, error: countError } = await supabase
      .from('subscription_suggestions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (countError) {
      console.error('[notification-service] Error counting suggestions:', countError);
      throw countError;
    }

    const count = suggestions?.length || 0;

    if (count === 0) {
      console.log('[notification-service] No pending suggestions, skipping notification');
      return new Response(JSON.stringify({ message: 'No pending suggestions' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notification-service] Found ${count} pending suggestions`);

    // ========================================================================
    // 5. GET USER'S DEVICE TOKENS
    // ========================================================================

    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .select('device_token')
      .eq('user_id', userId)
      .eq('logged_in', true);

    if (devicesError) {
      console.error('[notification-service] Error fetching devices:', devicesError);
      throw devicesError;
    }

    if (!devices || devices.length === 0) {
      console.log('[notification-service] No active devices for user');
      return new Response(JSON.stringify({ message: 'No active devices' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notification-service] Found ${devices.length} devices`);

    // ========================================================================
    // 6. SEND PUSH NOTIFICATIONS
    // ========================================================================

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
    }

    const sa: ServiceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(sa);

    const title = '🎉 New Subscriptions Found!';
    const body = `We found ${count} subscription${count > 1 ? 's' : ''} for you to review`;

    let sentCount = 0;
    let failedCount = 0;

    for (const device of devices) {
      try {
        await sendFCMNotification(
          accessToken,
          sa.project_id,
          device.device_token,
          title,
          body,
          { type: 'suggestions', count: count.toString() }
        );
        sentCount++;
      } catch (error) {
        console.error('[notification-service] Failed to send to device:', error);
        failedCount++;
      }
    }

    console.log(`[notification-service] Sent: ${sentCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        suggestions_count: count,
        notifications_sent: sentCount,
        notifications_failed: failedCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notification-service] Error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get Google OAuth access token for FCM
 */
async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const scope = 'https://www.googleapis.com/auth/firebase.messaging';

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const jwtToken = await createJWT(header, claim, sa.private_key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create JWT for Google OAuth
 */
async function createJWT(header: any, claim: any, privateKey: string): Promise<string> {
  const encoder = new TextEncoder();

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claimB64 = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const message = `${headerB64}.${claimB64}`;

  // Import private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKey.substring(
    privateKey.indexOf(pemHeader) + pemHeader.length,
    privateKey.indexOf(pemFooter)
  ).replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(message)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${message}.${signatureB64}`;
}

/**
 * Send FCM notification
 */
async function sendFCMNotification(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const payload = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FCM error: ${response.status} - ${errorText}`);
  }
}
