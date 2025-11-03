// mobile/src/screens/DashboardScreen.tsx

import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
// 1. We have REMOVED the unused 'Button' import
import { Text, Card, List, FAB, Appbar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';

// Mock data for now
const MOCK_SUBSCRIPTIONS = [
  { id: '1', name: 'Netflix', price: 15.99, billingCycle: 'monthly', next_payment_date: '2025-11-15' },
  { id: '2', name: 'Spotify', price: 9.99, billingCycle: 'monthly', next_payment_date: '2025-11-20' },
  { id: '3', name: 'Adobe Creative Cloud', price: 59.99, billingCycle: 'monthly', next_payment_date: '2025-11-28' },
];

// --- SOLUTION FOR ERROR 2 & 3 ---
// We create a new, separate component for our list item.
// This prevents defining components inside the render function.

type SubscriptionItemProps = {
  item: typeof MOCK_SUBSCRIPTIONS[0];
};

const SubscriptionItem = React.memo(({ item }: SubscriptionItemProps) => {
  // These functions are now stable as they are part of a component's definition,
  // not created on-the-fly during a render.
  const renderLeftIcon = (props: any) => <List.Icon {...props} icon="wallet" />;
  
  const renderRightPrice = (props: any) => (
    <Text {...props} style={styles.priceText}>
      ₹{item.price}
    </Text>
  );

  return (
    <List.Item
      title={item.name}
      description={`Next payment: ${item.next_payment_date}`}
      left={renderLeftIcon}
      right={renderRightPrice}
      onPress={() => console.log('Tapped on', item.name)}
    />
  );
});
// --- END OF SOLUTION ---


export const DashboardScreen = ({ navigation }: any) => {
  const { signOut } = useAuth();

  // We also define the renderItem function outside the return statement
  const renderSubscriptionItem = ({ item }: { item: typeof MOCK_SUBSCRIPTIONS[0] }) => (
    <SubscriptionItem item={item} />
  );

  return (
    <View style={styles.container}>
      {/* 1. The App Bar (Header) */}
      <Appbar.Header>
        <Appbar.Content title="Your Dashboard" />
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      {/* 2. The Summary Card */}
      <Card style={styles.summaryCard} mode="elevated">
        <Card.Title title="Total Monthly Spend" />
        <Card.Content>
          {/* TODO: Add live currency conversion */}
          <Text variant="displayMedium">₹86.97</Text>
          <Text variant="bodyMedium">Based on 3 active subscriptions</Text>
        </Card.Content>
      </Card>

      {/* 3. The "Upcoming" and "All" Lists */}
      <Text variant="headlineSmall" style={styles.listHeader}>
        Upcoming Payments
      </Text>
      
      <FlatList
        data={MOCK_SUBSCRIPTIONS}
        keyExtractor={(item) => item.id}
        renderItem={renderSubscriptionItem} // <-- Use the stable function
        style={styles.list}
      />

      {/* 4. The Floating Action Button (FAB) */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddSubscription')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff', // Or your theme's background
  },
  summaryCard: {
    margin: 16,
  },
  listHeader: {
    marginLeft: 16,
    marginTop: 16,
  },
  list: {
    flex: 1,
  },
  priceText: {
    alignSelf: 'center',
    marginRight: 16,
    fontSize: 16,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});