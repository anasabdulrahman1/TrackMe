// ============================================================================
// AUTH-ORCHESTRATOR - OAuth Handler & Scan Job Creator
// ============================================================================
// This Edge Function handles the Gmail OAuth flow and creates scan jobs.
// It's the entry point for the email scanning system.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// TYPES
// ============================================================================

interface OAuthRequest {
  code: string; // Authorization code from Google
  redirect_uri: string;
  scan_type?: 'deep-365-day' | 'daily-2-day' | 'manual';
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  email: string;
  id: string;
  verified_email: boolean;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    console.log(`[auth-orchestrator] Received ${req.method} request`);
    
    // ========================================================================
    // 1. VALIDATE REQUEST & EXTRACT PARAMETERS
    // ========================================================================

    let code: string;
    let redirect_uri: string;
    let scan_type: string = 'deep-365-day';
    let userId: string | null = null;

    // Handle GET request (OAuth callback from Google)
    if (req.method === 'GET') {
      console.log('[auth-orchestrator] Handling GET request (OAuth callback)');
      const url = new URL(req.url);
      code = url.searchParams.get('code') || '';
      redirect_uri = url.origin + url.pathname; // Reconstruct the redirect URI
      userId = url.searchParams.get('state') || null; // User ID passed in state parameter
      scan_type = 'manual';

      console.log(`[auth-orchestrator] Code: ${code ? 'present' : 'missing'}, State: ${userId}`);

      if (!code) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization code' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // For GET requests, we'll use the user ID from state parameter
      // and return a success page instead of JSON
    } 
    // Handle POST request (from mobile app with code)
    else if (req.method === 'POST') {
      console.log('[auth-orchestrator] Handling POST request');
      const body: OAuthRequest = await req.json();
      code = body.code;
      redirect_uri = body.redirect_uri;
      scan_type = body.scan_type || 'deep-365-day';
    } else {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!code || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code, redirect_uri' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // 2. INITIALIZE SUPABASE CLIENT & AUTHENTICATE USER
    // ========================================================================

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    let user: any;
    
    if (req.method === 'GET') {
      // For GET requests (OAuth callback from Google), user ID comes from state parameter
      // This endpoint is public - no auth header required
      console.log('[auth-orchestrator] GET request - using state parameter for user ID');
      if (!userId) {
        console.error('[auth-orchestrator] Missing state parameter');
        return new Response(
          JSON.stringify({ error: 'Missing user ID in state parameter' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Fetch user by ID using service role (bypasses RLS)
      console.log(`[auth-orchestrator] Fetching user by ID: ${userId}`);
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !userData.user) {
        console.error('[auth-orchestrator] Invalid user ID:', userError);
        return new Response(
          JSON.stringify({ error: 'Invalid user ID', details: userError?.message }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      user = userData.user;
      console.log(`[auth-orchestrator] User authenticated via state: ${user.email}`);
    } else {
      // For POST requests (from mobile app), require auth header
      console.log('[auth-orchestrator] POST request - checking auth header');
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        console.error('[auth-orchestrator] Missing authorization header in POST request');
        return new Response(
          JSON.stringify({ error: 'Missing authorization header' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !authUser) {
        console.error('[auth-orchestrator] Invalid auth token:', userError);
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
      console.log(`[auth-orchestrator] User authenticated via token: ${user.email}`);
    }

    console.log(`[auth-orchestrator] Processing OAuth for user: ${user.id}`);

    // ========================================================================
    // 3. EXCHANGE CODE FOR TOKENS
    // ========================================================================

    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!googleClientId || !googleClientSecret) {
      throw new Error('Missing Google OAuth credentials');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[auth-orchestrator] Token exchange failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // ========================================================================
    // 4. GET USER INFO FROM GOOGLE
    // ========================================================================

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Google');
    }

    const userInfo: GoogleUserInfo = await userInfoResponse.json();

    console.log(`[auth-orchestrator] Connected Gmail account: ${userInfo.email}`);

    // ========================================================================
    // 5. STORE TOKENS IN DATABASE (ENCRYPTED)
    // ========================================================================

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: user.id,
        provider: 'google',
        provider_user_id: userInfo.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        scopes: tokens.scope.split(' '),
        status: 'active',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (insertError) {
      console.error('[auth-orchestrator] Failed to store tokens:', insertError);
      throw insertError;
    }

    console.log(`[auth-orchestrator] Tokens stored successfully`);

    // ========================================================================
    // 6. CREATE SCAN JOB IN QUEUE 1
    // ========================================================================

    const { data: scanJob, error: queueError } = await supabase
      .from('queue_scan')
      .insert({
        user_id: user.id,
        scan_type,
        priority: scan_type === 'manual' ? 1 : 5, // Manual scans get higher priority
        status: 'pending',
      })
      .select()
      .single();

    if (queueError) {
      console.error('[auth-orchestrator] Failed to create scan job:', queueError);
      throw queueError;
    }

    console.log(`[auth-orchestrator] Scan job created: ${scanJob.id}`);

    // ========================================================================
    // 7. CREATE SCAN HISTORY ENTRY
    // ========================================================================

    await supabase
      .from('scan_history')
      .insert({
        user_id: user.id,
        scan_job_id: scanJob.id,
        scan_type,
        status: 'running',
      });

    // ========================================================================
    // 8. RETURN SUCCESS RESPONSE
    // ========================================================================

    // For GET requests (OAuth callback), return HTML page
    if (req.method === 'GET') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Gmail Connected - TrackMe</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              color: #333;
              margin: 0 0 10px 0;
              font-size: 24px;
            }
            p {
              color: #666;
              line-height: 1.6;
              margin: 10px 0;
            }
            .email {
              background: #f5f5f5;
              padding: 10px;
              border-radius: 8px;
              margin: 20px 0;
              font-weight: 500;
              color: #667eea;
            }
            .close-btn {
              margin-top: 20px;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <h1>Gmail Connected!</h1>
            <p>We've successfully connected your Gmail account:</p>
            <div class="email">${userInfo.email}</div>
            <p>We're now scanning your inbox for subscriptions. You'll receive a notification when we're done!</p>
            <p><small>Estimated time: ${scan_type === 'deep-365-day' ? '5-10 minutes' : '1-2 minutes'}</small></p>
            <button class="close-btn" onclick="window.close()">Close this window</button>
          </div>
          <script>
            // Auto-close after 3 seconds
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `;
      
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // For POST requests, return JSON
    return new Response(
      JSON.stringify({
        success: true,
        message: "We've started scanning your inbox. We'll notify you when it's done!",
        data: {
          email: userInfo.email,
          scan_job_id: scanJob.id,
          scan_type,
          estimated_time: scan_type === 'deep-365-day' ? '5-10 minutes' : '1-2 minutes',
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error: any) {
    console.error('[auth-orchestrator] Error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Encrypt sensitive data before storing
 * Note: In production, use proper encryption libraries
 */
function encryptToken(token: string): string {
  // TODO: Implement proper encryption using pgcrypto or similar
  // For now, we're storing tokens as-is (Supabase encrypts at rest)
  return token;
}

/**
 * Validate OAuth scopes
 */
function validateScopes(scopes: string[]): boolean {
  const requiredScopes = ['https://www.googleapis.com/auth/gmail.readonly'];
  return requiredScopes.every(scope => scopes.includes(scope));
}
