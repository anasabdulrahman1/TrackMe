// mobile/src/screens/DashboardScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native';
import {
  Text,
  Card,
  List,
  FAB,
  Appbar,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AppLayout } from '../Components/AppLayout';

// --- Render Helpers (defined OUTSIDE render to avoid unstable components) ---
const renderLeftIcon = (props: any) => <List.Icon {...props} icon="wallet" />;

const renderRightPrice = (price: number) => (props: any) => (
  <Text {...props} style={styles.priceText}>
    ₹{price.toFixed(2)}
  </Text>
);

// --- SubscriptionItem Component ---
export type Subscription = {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  next_payment_date: string;
};

const SubscriptionItem = React.memo(({ item }: { item: Subscription }) => (
  <List.Item
    title={item.name}
    description={`Next payment: ${item.next_payment_date}`}
    left={renderLeftIcon}
    right={renderRightPrice(item.price)}
    onPress={() => console.log('Tapped on', item.name)}
  />
));

// --- DashboardScreen ---
export const DashboardScreen = () => {
  const { session, signOut } = useAuth();
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- Fetch Subscriptions ---
  const fetchSubscriptions = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, name, price, billing_cycle, next_payment_date')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .order('next_payment_date', { ascending: true });

      if (error) throw error;

      const subs = data ?? [];
      setSubscriptions(subs);

      // Normalize different billing cycles to monthly equivalent
      const total = subs.reduce((acc, sub) => {
        const price = Number(sub.price) || 0;
        switch (sub.billing_cycle) {
          case 'monthly':
            return acc + price;
          case 'quarterly':
            return acc + price / 3;
          case 'yearly':
            return acc + price / 12;
          case 'trial':
          default:
            return acc; // trials or unknown cycles not counted
        }
      }, 0);
      setTotalSpend(total);
    } catch (error: any) {
      console.error('❌ Error fetching subscriptions:', error.message);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // --- Refresh Control ---
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSubscriptions();
    setRefreshing(false);
  }, [fetchSubscriptions]);

  // --- Auto Fetch on Focus ---
  useFocusEffect(
    useCallback(() => {
      fetchSubscriptions();
    }, [fetchSubscriptions])
  );

  // --- Logout ---
  const handleLogout = async () => {
    try {
      await signOut();
      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
    }
  };

  return (
    <AppLayout>
      {/* --- AppBar --- */}
      <Appbar.Header mode="small" style={styles.appBar}>
        <Appbar.Content title="Your Dashboard" titleStyle={styles.appTitle} />
        <Appbar.Action 
          icon="gmail" 
          onPress={() => navigation.navigate('GmailConnection' as never)} 
        />
        <Appbar.Action 
          icon="inbox" 
          onPress={() => navigation.navigate('SuggestionInbox' as never)} 
        />
        <Appbar.Action 
          icon="bell-outline" 
          onPress={() => navigation.navigate('NotificationHistory' as never)} 
        />
        <Appbar.Action 
          icon="cog-outline" 
          onPress={() => navigation.navigate('NotificationSettings' as never)} 
        />
        <Appbar.Action icon="logout" onPress={handleLogout} />
      </Appbar.Header>

      {/* --- Main Content --- */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator animating size="large" />
          <Text style={styles.loadingText}>Loading your subscriptions...</Text>
        </View>
      ) : (
        <>
          <Card style={styles.summaryCard} mode="elevated">
            <Card.Title title="Total Monthly Spend" />
            <Card.Content>
              <Text variant="headlineLarge">₹{totalSpend.toFixed(2)}</Text>
              <Text variant="bodyMedium">
                Based on {subscriptions.length} active subscriptions
              </Text>
            </Card.Content>
          </Card>

          <Text variant="titleMedium" style={styles.listHeader}>
            Active Subscriptions
          </Text>

          <FlatList
            data={subscriptions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SubscriptionItem item={item} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.flatListContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Image
                  source={{
                    uri: 'https://cdn-icons-png.flaticon.com/512/4072/4072142.png',
                  }}
                  style={styles.emptyImage}
                />
                <Text style={styles.emptyText}>
                  You have no active subscriptions yet.
                </Text>
                <Text style={styles.emptySubText}>
                  Tap the “+” button below to add one!
                </Text>
              </View>
            }
          />
        </>
      )}

      {/* --- FAB --- */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddSubscription')}
      />

      {/* --- Snackbar --- */}
      <Snackbar
        visible={!!errorMsg}
        onDismiss={() => setErrorMsg('')}
        action={{
          label: 'Retry',
          onPress: fetchSubscriptions,
        }}>
        {errorMsg}
      </Snackbar>
    </AppLayout>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  appBar: {
    backgroundColor: '#6c47ff',
  },
  appTitle: {
    color: '#fff',
    fontWeight: '700',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    elevation: 3,
  },
  listHeader: {
    marginLeft: 16,
    marginTop: 8,
    marginBottom: 8,
    color: '#333',
    fontWeight: '600',
  },
  priceText: {
    alignSelf: 'center',
    marginRight: 16,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  flatListContent: {
    paddingBottom: 120, // ✅ fixed from inline style
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#6c47ff',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyImage: {
    width: 120,
    height: 120,
    marginBottom: 16,
    opacity: 0.85,
  },
  emptyText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginTop: 6,
  },
});

