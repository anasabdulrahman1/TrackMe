// mobile/src/screens/AddSubscriptionScreen.tsx

import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, TextInput, Text, SegmentedButtons, Switch } from 'react-native-paper';

// --- 1. IMPORT SUPABASE AND AUTH ---
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const AddSubscriptionScreen = ({ navigation }: any) => {
  // --- 2. GET THE CURRENT SESSION ---
  const { session } = useAuth(); // We need the user's ID from the session

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isTrial, setIsTrial] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- 3. UPDATE THE SAVE FUNCTION ---
  const handleSave = async () => {
    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to save a subscription.');
      return;
    }
    setLoading(true);

    const subscriptionData = {
      user_id: session.user.id,
      name: name,
      price: parseFloat(price || '0'),
      billing_cycle: isTrial ? 'trial' : billingCycle,
      next_payment_date: firstPaymentDate,
      status: 'active', // Set the status as 'active'
      // category: '...' // We can add this field later
    };

    try {
      const { error } = await supabase
        .from('subscriptions') // Our table name
        .insert(subscriptionData); // Insert the data

      if (error) {
        throw error;
      }

      Alert.alert('Success!', `${name} has been added to your tracker.`);
      navigation.goBack(); // Go back to the dashboard
    } catch (error: any) {
      Alert.alert('Error Saving', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        label="Subscription Name (e.g., Netflix)"
        value={name}
        onChangeText={setName}
        style={styles.input}
        mode="outlined"
      />
      <TextInput
        label="Price"
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
        style={styles.input}
        mode="outlined"
        disabled={isTrial}
      />
      <TextInput
        label={isTrial ? "Trial End Date (YYYY-MM-DD)" : "First Payment Date (YYYY-MM-DD)"}
        value={firstPaymentDate}
        onChangeText={setFirstPaymentDate}
        style={styles.input}
        mode="outlined"
      />

      <View style={styles.switchContainer}>
        <Text variant="bodyLarge">Is this a Free Trial?</Text>
        <Switch value={isTrial} onValueChange={setIsTrial} />
      </View>

      {!isTrial && (
        <SegmentedButtons
          value={billingCycle}
          onValueChange={setBillingCycle}
          style={styles.input}
          buttons={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
            { value: 'quarterly', label: 'Quarterly' },
          ]}
        />
      )}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={loading} // Add loading state
        style={styles.button}
        disabled={loading || !name || (!isTrial && !price)}>
        Save Subscription
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 16,
    paddingVertical: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});