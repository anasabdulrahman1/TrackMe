import React, { useState, useCallback } from 'react';
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

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      loadSuggestions();
    }, [loadSuggestions])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadSuggestions();
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
              {item.currency} {item.price.toFixed(2)}
            </Text>
            <Chip icon="calendar-repeat" mode="outlined">
              {item.billing_cycle}
            </Chip>
          </View>

          <View style={styles.detailRow}>
            <Icon name="calendar-clock" size={16} color={colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}>
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
            <Icon name="inbox-outline" size={64} color={colors.onSurfaceVariant} />
            <Text variant="titleMedium" style={[styles.emptyTitle, { color: colors.onSurfaceVariant }]}>
              {filter === 'pending' ? 'No pending suggestions' : 'No suggestions found'}
            </Text>
            <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              {filter === 'pending' 
                ? "Connect Gmail to discover subscriptions"
                : "Try changing the filter or search query"}
            </Text>
            {filter === 'pending' && (
              <Button
                mode="contained"
                onPress={() => navigation.navigate('GmailConnection')}
                icon="google"
                style={styles.connectButton}
              >
                Connect Gmail
              </Button>
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
          onPress={() => navigation.navigate('GmailConnection')}
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
