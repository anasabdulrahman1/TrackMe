// src/screens/NotificationHistoryScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import {
  List,
  Text,
  Chip,
  Divider,
  ActivityIndicator,
  FAB,
  Searchbar,
} from 'react-native-paper';
import { AppLayout } from '../Components/AppLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface NotificationEvent {
  id: string;
  subscription_id: string;
  scheduled_for: string;
  sent_at: string | null;
  offset_days: number;
  status: 'sent' | 'failed' | 'queued';
  error: string | null;
  created_at: string;
  subscription_name?: string;
}

export const NotificationHistoryScreen = () => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all');

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadNotifications = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);

      let query = supabase
        .from('notification_events')
        .select(`
          id,
          subscription_id,
          scheduled_for,
          sent_at,
          offset_days,
          status,
          error,
          created_at,
          subscriptions!inner(name)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData = (data || []).map((item: any) => ({
        ...item,
        subscription_name: item.subscriptions?.name || 'Unknown',
      }));

      setNotifications(formattedData);
    } catch (error: any) {
      console.error('Error loading notifications:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      case 'queued':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return 'check-circle';
      case 'failed':
        return 'alert-circle';
      case 'queued':
        return 'clock';
      default:
        return 'bell';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy • h:mm a');
    } catch {
      return dateString;
    }
  };

  const filteredNotifications = notifications.filter((notif) =>
    notif.subscription_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderNotification = ({ item }: { item: NotificationEvent }) => (
    <View>
      <List.Item
        title={item.subscription_name}
        description={`${item.offset_days} day${item.offset_days === 1 ? '' : 's'} before payment`}
        left={(props) => (
          <List.Icon
            {...props}
            icon={getStatusIcon(item.status)}
            color={getStatusColor(item.status)}
          />
        )}
        right={() => (
          <View style={styles.rightContainer}>
            <Chip
              mode="flat"
              textStyle={styles.chipText}
              style={[
                styles.statusChip,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            >
              {item.status.toUpperCase()}
            </Chip>
            <Text variant="bodySmall" style={styles.dateText}>
              {formatDate(item.sent_at || item.scheduled_for)}
            </Text>
          </View>
        )}
      />
      {item.error && (
        <View style={styles.errorContainer}>
          <Text variant="bodySmall" style={styles.errorText}>
            Error: {item.error}
          </Text>
        </View>
      )}
      <Divider />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <List.Icon icon="bell-off" color="#ccc" style={styles.emptyIcon} />
      <Text variant="titleMedium" style={styles.emptyTitle}>
        No Notifications Yet
      </Text>
      <Text variant="bodyMedium" style={styles.emptyText}>
        Your notification history will appear here
      </Text>
    </View>
  );

  if (loading) {
    return (
      <AppLayout centerContent>
        <ActivityIndicator size="large" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <View style={styles.container}>
        {/* Search Bar */}
        <Searchbar
          placeholder="Search notifications..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />

        {/* Filter Chips */}
        <View style={styles.filterContainer}>
          <Chip
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
            style={styles.filterChip}
          >
            All
          </Chip>
          <Chip
            selected={filter === 'sent'}
            onPress={() => setFilter('sent')}
            style={styles.filterChip}
            icon="check-circle"
          >
            Sent
          </Chip>
          <Chip
            selected={filter === 'failed'}
            onPress={() => setFilter('failed')}
            style={styles.filterChip}
            icon="alert-circle"
          >
            Failed
          </Chip>
        </View>

        {/* Notification List */}
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={
            filteredNotifications.length === 0 ? styles.emptyList : undefined
          }
        />

        {/* Refresh FAB */}
        <FAB
          icon="refresh"
          style={styles.fab}
          onPress={onRefresh}
          size="small"
        />
      </View>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    margin: 16,
    marginBottom: 12,
    elevation: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  rightContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  statusChip: {
    height: 24,
    marginBottom: 4,
  },
  chipText: {
    fontSize: 11,
    color: '#fff',
  },
  dateText: {
    color: '#666',
    fontSize: 11,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#dc2626',
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  emptyTitle: {
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#6c47ff',
  },
});
