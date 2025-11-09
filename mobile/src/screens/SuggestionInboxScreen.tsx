import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { Text, Card, Button, Chip, useTheme, FAB, Searchbar, SegmentedButtons } from 'react-native-paper';
import { AppLayout } from '../Components/AppLayout';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

interface Suggestion {
  id: string;
  service_name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  next_payment_date: string;
  confidence_score: number;
  status: string;
  email_subject: string;
  email_from: string;
  created_at: string;
}

export const SuggestionInboxScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [_loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    scanning: number;
    parsing: number;
    ingesting: number;
  } | null>(null);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if Gmail is connected
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('status')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      setIsGmailConnected(integration?.status === 'active');

      // Check if scanning is in progress and get detailed progress
      const { data: scanJobs } = await supabase
        .from('queue_scan')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .limit(1);

      const isCurrentlyScanning = !!(scanJobs && scanJobs.length > 0);
      setIsScanning(isCurrentlyScanning);

      // Get detailed pipeline progress if scanning
      if (isCurrentlyScanning) {
        const [scanCount, parseCount, ingestCount] = await Promise.all([
          supabase
            .from('queue_scan')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['pending', 'processing']),
          supabase
            .from('queue_parse')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['pending', 'processing']),
          supabase
            .from('queue_ingest')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['pending', 'processing']),
        ]);

        setScanProgress({
          scanning: scanCount.count || 0,
          parsing: parseCount.count || 0,
          ingesting: ingestCount.count || 0,
        });
      } else {
        setScanProgress(null);
      }

      let query = supabase
        .from('subscription_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSuggestions(data || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      Alert.alert('Error', 'Failed to load suggestions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSuggestions();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])
  );

  // Auto-refresh while scanning
  useEffect(() => {
    if (!isScanning) return;

    const intervalId = setInterval(() => {
      console.log('Auto-refreshing scan progress...');
      loadSuggestions();
    }, 10000); // Refresh every 10 seconds

    return () => {
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSuggestions();
  };

  const handleRescan = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if Gmail is connected
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('status')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (!integration || integration.status !== 'active') {
        Alert.alert(
          'Gmail Not Connected',
          'Please connect your Gmail account first',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Connect Gmail', onPress: () => navigation.navigate('GmailConnection') }
          ]
        );
        return;
      }

      // Check if scan is already in progress
      const { data: existingScan } = await supabase
        .from('queue_scan')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (existingScan) {
        Alert.alert('Scan In Progress', 'A scan is already running. Please wait for it to complete.');
        return;
      }

      // Create new scan job
      const { error } = await supabase
        .from('queue_scan')
        .insert({
          user_id: user.id,
          scan_type: 'manual',
          status: 'pending',
        });

      if (error) throw error;

      Alert.alert(
        '✅ Scan Started',
        'Your inbox is being scanned for subscriptions. This usually takes 3-7 minutes. Pull down to refresh.',
        [{ text: 'OK' }]
      );

      // Refresh to show scanning state
      loadSuggestions();
    } catch (error) {
      console.error('Error starting rescan:', error);
      Alert.alert('Error', 'Failed to start scan. Please try again.');
    }
  };

  const handleApprove = async (suggestion: Suggestion) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create subscription from suggestion
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          name: suggestion.service_name,
          price: suggestion.price,
          currency: suggestion.currency,
          billing_cycle: suggestion.billing_cycle,
          next_payment_date: suggestion.next_payment_date,
          status: 'active',
          reminder_period: '7,3,1',
        });

      if (insertError) throw insertError;

      // Update suggestion status
      const { error: updateError } = await supabase
        .from('subscription_suggestions')
        .update({ status: 'approved' })
        .eq('id', suggestion.id);

      if (updateError) throw updateError;

      Alert.alert('✅ Added!', `${suggestion.service_name} has been added to your subscriptions`);
      loadSuggestions();
    } catch (error) {
      console.error('Error approving suggestion:', error);
      Alert.alert('Error', 'Failed to add subscription');
    }
  };

  const handleReject = async (suggestionId: string) => {
    try {
      const { error } = await supabase
        .from('subscription_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestionId);

      if (error) throw error;

      Alert.alert('Rejected', 'Suggestion has been rejected');
      loadSuggestions();
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
      Alert.alert('Error', 'Failed to reject suggestion');
    }
  };

  const filteredSuggestions = suggestions.filter(s =>
    s.service_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSuggestion = ({ item }: { item: Suggestion }) => {
    const confidenceColor = item.confidence_score >= 0.8 ? '#4CAF50' : 
                           item.confidence_score >= 0.6 ? '#FF9800' : '#F44336';

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.serviceInfo}>
              <Text variant="titleLarge" style={styles.serviceName}>
                {item.service_name}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                From: {item.email_from}
              </Text>
            </View>
            <Chip
              icon="chart-line"
              style={[styles.confidenceChip, { backgroundColor: confidenceColor + '20' }]}
              textStyle={{ color: confidenceColor }}
            >
              {Math.round(item.confidence_score * 100)}%
            </Chip>
          </View>

          <View style={styles.priceRow}>
            <Text variant="headlineMedium" style={styles.price}>
              {item.price !== null ? `${item.currency || ''} ${item.price.toFixed(2)}` : 'Price not found'}
            </Text>
            {item.billing_cycle && (
              <Chip icon="calendar-repeat" mode="outlined">
                {item.billing_cycle}
              </Chip>
            )}
          </View>

          <View style={styles.detailRow}>
            <Icon name="calendar-clock" size={16} color={colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={[styles.detailText, { color: colors.onSurfaceVariant }]}>
              Next payment: {new Date(item.next_payment_date).toLocaleDateString()}
            </Text>
          </View>

          {item.status === 'pending' && (
            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={() => handleApprove(item)}
                icon="check"
                style={styles.approveButton}
              >
                Add to Subscriptions
              </Button>
              <Button
                mode="outlined"
                onPress={() => handleReject(item.id)}
                icon="close"
                textColor={colors.error}
              >
                Reject
              </Button>
            </View>
          )}

          {item.status === 'approved' && (
            <Chip icon="check-circle" style={styles.statusChip}>
              Added to Subscriptions
            </Chip>
          )}

          {item.status === 'rejected' && (
            <Chip icon="close-circle" style={styles.statusChip}>
              Rejected
            </Chip>
          )}
        </Card.Content>
      </Card>
    );
  };

  const pendingCount = suggestions.filter(s => s.status === 'pending').length;

  return (
    <AppLayout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            Subscription Suggestions
          </Text>
          {pendingCount > 0 && (
            <Chip icon="inbox" style={styles.countChip}>
              {pendingCount} pending
            </Chip>
          )}
        </View>

        <Searchbar
          placeholder="Search suggestions..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          buttons={[
            { value: 'pending', label: 'Pending', icon: 'inbox' },
            { value: 'approved', label: 'Approved', icon: 'check' },
            { value: 'rejected', label: 'Rejected', icon: 'close' },
            { value: 'all', label: 'All' },
          ]}
          style={styles.segmentedButtons}
        />

        {filteredSuggestions.length === 0 ? (
          <View style={styles.emptyState}>
            {!isGmailConnected ? (
              // Not connected state
              <>
                <Icon name="email-off-outline" size={80} color={colors.onSurfaceVariant} />
                <Text variant="headlineSmall" style={[styles.emptyTitle, { color: colors.onSurface }]}>
                  Gmail Not Connected
                </Text>
                <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                  Connect your Gmail account to automatically discover and track your subscriptions
                </Text>
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('GmailConnection')}
                  icon="google"
                  style={styles.connectButton}
                  contentStyle={styles.connectButtonContent}
                >
                  Connect Gmail
                </Button>
              </>
            ) : isScanning ? (
              // Scanning in progress
              <>
                <Icon name="email-search" size={80} color={colors.primary} />
                <Text variant="headlineSmall" style={[styles.emptyTitle, { color: colors.onSurface }]}>
                  Scanning Your Inbox
                </Text>
                <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                  We're analyzing your emails to find subscriptions. This usually takes 3-7 minutes.
                </Text>
                
                {scanProgress && (
                  <View style={styles.progressContainer}>
                    {scanProgress.scanning > 0 && (
                      <View style={styles.progressRow}>
                        <Icon name="email-search-outline" size={20} color={colors.primary} />
                        <Text variant="bodyMedium" style={[styles.progressText, { color: colors.onSurface }]}>
                          Scanning emails: {scanProgress.scanning} in progress
                        </Text>
                      </View>
                    )}
                    {scanProgress.parsing > 0 && (
                      <View style={styles.progressRow}>
                        <Icon name="file-document-outline" size={20} color={colors.primary} />
                        <Text variant="bodyMedium" style={[styles.progressText, { color: colors.onSurface }]}>
                          Analyzing content: {scanProgress.parsing} emails
                        </Text>
                      </View>
                    )}
                    {scanProgress.ingesting > 0 && (
                      <View style={styles.progressRow}>
                        <Icon name="database-import-outline" size={20} color={colors.primary} />
                        <Text variant="bodyMedium" style={[styles.progressText, { color: colors.onSurface }]}>
                          Creating suggestions: {scanProgress.ingesting} items
                        </Text>
                      </View>
                    )}
                    {scanProgress.scanning === 0 && scanProgress.parsing === 0 && scanProgress.ingesting === 0 && (
                      <View style={styles.progressRow}>
                        <Icon name="check-circle-outline" size={20} color={colors.primary} />
                        <Text variant="bodyMedium" style={[styles.progressText, { color: colors.onSurface }]}>
                          Almost done! Finalizing results...
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                
                <Button
                  mode="outlined"
                  onPress={handleRefresh}
                  icon="refresh"
                  style={styles.connectButton}
                  loading={refreshing}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Progress'}
                </Button>
              </>
            ) : (
              // No suggestions found
              <>
                <Icon name="inbox-outline" size={80} color={colors.onSurfaceVariant} />
                <Text variant="headlineSmall" style={[styles.emptyTitle, { color: colors.onSurface }]}>
                  {filter === 'pending' ? 'No Pending Suggestions' : 'No Suggestions Found'}
                </Text>
                <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                  {filter === 'pending' 
                    ? "No subscription emails found yet. Try scanning again or check other filters."
                    : "Try changing the filter or search query"}
                </Text>
                {filter === 'pending' && (
                  <Button
                    mode="contained"
                    onPress={handleRescan}
                    icon="refresh"
                    style={styles.connectButton}
                  >
                    Scan Again
                  </Button>
                )}
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredSuggestions}
            renderItem={renderSuggestion}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />
        )}

        <FAB
          icon="refresh"
          style={styles.fab}
          onPress={handleRescan}
          label="Scan Again"
        />
      </View>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontWeight: 'bold',
  },
  countChip: {
    marginLeft: 8,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  segmentedButtons: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  serviceInfo: {
    flex: 1,
    marginRight: 8,
  },
  serviceName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  confidenceChip: {
    height: 28,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailText: {
    marginLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontWeight: 'bold',
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
  },
  connectButton: {
    marginTop: 24,
  },
  connectButtonContent: {
    paddingVertical: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  progressContainer: {
    marginTop: 24,
    marginBottom: 8,
    width: '100%',
    paddingHorizontal: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(103, 80, 164, 0.08)',
    borderRadius: 8,
  },
  progressText: {
    marginLeft: 12,
    flex: 1,
  },
});
