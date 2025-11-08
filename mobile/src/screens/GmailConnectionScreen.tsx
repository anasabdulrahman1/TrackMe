import React, { useState } from 'react';
import { View, StyleSheet, Alert, Linking } from 'react-native';
import { Text, Button, Card, useTheme, List, Dialog, Portal, TextInput } from 'react-native-paper';
import { AppLayout } from '../Components/AppLayout';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import InAppBrowser from 'react-native-inappbrowser-reborn';

export const GmailConnectionScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [pendingRedirectUri, setPendingRedirectUri] = useState('');

  // Check if already connected
  React.useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_integrations')
        .select('provider_user_id, status')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (data && data.status === 'active') {
        setIsConnected(true);
        setUserEmail(data.provider_user_id);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    }
  };

  const handleConnectGmail = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        setLoading(false);
        return;
      }

      // Google OAuth configuration - Using Web Client
      const clientId = '217563768495-deql7ahfm2vl35lhvf5fiffvbnqa90kr.apps.googleusercontent.com';
      // Use loopback for web OAuth client (Google's recommended approach)
      const redirectUri = 'http://127.0.0.1:8080/oauth/callback';
      const scope = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email';

      // Build OAuth URL
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${user.id}`;

      console.log('Opening OAuth URL:', authUrl);

      // Open in-app browser with OAuth
      if (await InAppBrowser.isAvailable()) {
        const result = await InAppBrowser.openAuth(authUrl, redirectUri, {
          // iOS options
          ephemeralWebSession: false,
          // Android options
          showTitle: true,
          toolbarColor: colors.primary,
          enableUrlBarHiding: true,
          enableDefaultShare: false,
        });

        if (result.type === 'success' && result.url) {
          // Extract code from redirect URL
          try {
            const url = result.url;
            console.log('OAuth redirect URL:', url);
            const params = url.split('?')[1];
            
            if (params) {
              const paramPairs = params.split('&');
              let code: string | null = null;
              
              for (const pair of paramPairs) {
                const [key, value] = pair.split('=');
                if (key === 'code') {
                  code = decodeURIComponent(value);
                  break;
                }
              }

              if (code) {
                await exchangeCodeForTokens(code, redirectUri);
              } else {
                Alert.alert('Error', 'No authorization code received');
                setLoading(false);
              }
            } else {
              Alert.alert('Error', 'Invalid OAuth response');
              setLoading(false);
            }
          } catch (error) {
            console.error('Error parsing OAuth response:', error);
            Alert.alert('Error', 'Failed to process OAuth response');
            setLoading(false);
          }
        } else if (result.type === 'cancel') {
          // Browser was closed - might be after successful auth
          // Show dialog to manually enter code
          setPendingRedirectUri(redirectUri);
          setShowCodeDialog(true);
        } else {
          Alert.alert('Error', 'OAuth flow failed');
          setLoading(false);
        }
      } else {
        // Fallback: open external browser and prompt for code
        Linking.openURL(authUrl);
        Alert.alert(
          'Complete Authorization',
          'After authorizing, you will be redirected. The app will capture the response automatically.',
          [{ text: 'OK', onPress: () => setLoading(false) }]
        );
      }
    } catch (error: any) {
      console.error('OAuth error:', error);
      Alert.alert('Error', error.message || 'Failed to connect Gmail');
      setLoading(false);
    }
  };

  const exchangeCodeForTokens = async (code: string, redirectUri: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();

      if (!user || !session) {
        throw new Error('Not authenticated');
      }

      // Call auth-orchestrator Edge Function
      const response = await fetch(
        'https://aqpnksnxuiutwobkwzst.supabase.co/functions/v1/auth-orchestrator',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            redirect_uri: redirectUri,
            scan_type: 'manual',
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setIsConnected(true);
        setUserEmail(result.data.email);
        
        Alert.alert(
          '✅ Success!',
          result.message || "We've started scanning your inbox for subscriptions!",
          [
            {
              text: 'View Suggestions',
              onPress: () => navigation.navigate('SuggestionInbox'),
            },
            { text: 'OK' },
          ]
        );
      } else {
        throw new Error(result.error || 'Failed to connect Gmail');
      }
    } catch (error: any) {
      console.error('Token exchange error:', error);
      Alert.alert('Error', error.message || 'Failed to connect Gmail');
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Gmail?',
      'This will stop scanning your inbox for subscriptions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              await supabase
                .from('user_integrations')
                .update({ status: 'disconnected' })
                .eq('user_id', user.id)
                .eq('provider', 'google');

              setIsConnected(false);
              setUserEmail(null);
              Alert.alert('Disconnected', 'Gmail has been disconnected');
            } catch (error) {
              console.error('Disconnect error:', error);
              Alert.alert('Error', 'Failed to disconnect Gmail');
            }
          },
        },
      ]
    );
  };

  const handleRescan = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create a new scan job
      const { error } = await supabase
        .from('queue_scan')
        .insert({
          user_id: user.id,
          scan_type: 'manual',
          priority: 1,
          status: 'pending',
        });

      if (error) throw error;

      Alert.alert(
        '🔍 Scanning Started',
        "We're scanning your inbox again. You'll get a notification when we find new subscriptions!",
        [
          {
            text: 'View Suggestions',
            onPress: () => navigation.navigate('SuggestionInbox'),
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('Rescan error:', error);
      Alert.alert('Error', 'Failed to start scan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Icon name="email-search" size={64} color={colors.primary} />
          <Text variant="headlineMedium" style={styles.title}>
            Gmail Connection
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Connect your Gmail to automatically discover subscriptions
          </Text>
        </View>

        {isConnected ? (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.connectedHeader}>
                  <Icon name="check-circle" size={48} color="#4CAF50" />
                  <Text variant="titleLarge" style={styles.connectedTitle}>
                    Connected
                  </Text>
                </View>
                <Text variant="bodyMedium" style={styles.connectedEmail}>
                  {userEmail}
                </Text>
              </Card.Content>
            </Card>

            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={handleRescan}
                loading={loading}
                disabled={loading}
                icon="refresh"
                style={styles.button}
              >
                Scan Again
              </Button>

              <Button
                mode="outlined"
                onPress={() => navigation.navigate('SuggestionInbox')}
                icon="inbox"
                style={styles.button}
              >
                View Suggestions
              </Button>

              <Button
                mode="text"
                onPress={handleDisconnect}
                textColor={colors.error}
                icon="link-off"
                style={styles.button}
              >
                Disconnect Gmail
              </Button>
            </View>
          </>
        ) : (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <List.Section>
                  <List.Item
                    title="Automatic Discovery"
                    description="We'll scan your inbox for subscription receipts"
                    left={props => <List.Icon {...props} icon="magnify" />}
                  />
                  <List.Item
                    title="AI-Powered"
                    description="Smart detection of recurring payments"
                    left={props => <List.Icon {...props} icon="brain" />}
                  />
                  <List.Item
                    title="Privacy First"
                    description="We only read email metadata, not content"
                    left={props => <List.Icon {...props} icon="shield-check" />}
                  />
                  <List.Item
                    title="Your Control"
                    description="Review and approve all suggestions"
                    left={props => <List.Icon {...props} icon="account-check" />}
                  />
                </List.Section>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={handleConnectGmail}
              loading={loading}
              disabled={loading}
              icon="google"
              style={styles.connectButton}
              contentStyle={styles.connectButtonContent}
            >
              {loading ? 'Connecting...' : 'Connect Gmail'}
            </Button>

            <Text variant="bodySmall" style={[styles.disclaimer, { color: colors.onSurfaceVariant }]}>
              By connecting, you agree to let TrackMe scan your Gmail inbox for subscription receipts.
              You can disconnect at any time.
            </Text>
          </>
        )}
      </View>

      {/* Code Entry Dialog for Android */}
      <Portal>
        <Dialog visible={showCodeDialog} onDismiss={() => {
          setShowCodeDialog(false);
          setAuthCode('');
          setLoading(false);
        }}>
          <Dialog.Title>Enter Authorization Code</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogText}>
              Copy the ENTIRE URL from the browser's address bar and paste it here.
              {'\n\n'}
              It should look like:{'\n'}
              http://127.0.0.1:8080/oauth/callback?code=4/0AanRRrt...
              {'\n\n'}
              Or just paste the code part after "code="
            </Text>
            <TextInput
              label="Paste URL or Code"
              value={authCode}
              onChangeText={setAuthCode}
              mode="outlined"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={4}
              placeholder="http://127.0.0.1:8080/oauth/callback?code=..."
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setShowCodeDialog(false);
              setAuthCode('');
              setLoading(false);
            }}>
              Cancel
            </Button>
            <Button onPress={async () => {
              if (authCode.trim()) {
                setShowCodeDialog(false);
                
                // Extract code if user pasted full URL
                let code = authCode.trim();
                if (code.includes('code=')) {
                  const match = code.match(/code=([^&]+)/);
                  if (match) {
                    code = match[1];
                  }
                }
                
                await exchangeCodeForTokens(code, pendingRedirectUri);
                setAuthCode('');
              } else {
                Alert.alert('Error', 'Please enter the authorization code');
              }
            }}>
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    marginTop: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  card: {
    marginBottom: 16,
  },
  connectedHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  connectedTitle: {
    marginTop: 8,
    fontWeight: 'bold',
  },
  connectedEmail: {
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    gap: 12,
  },
  button: {
    marginVertical: 4,
  },
  connectButton: {
    marginTop: 24,
    marginBottom: 16,
  },
  connectButtonContent: {
    paddingVertical: 8,
  },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  dialogText: {
    marginBottom: 16,
  },
});
