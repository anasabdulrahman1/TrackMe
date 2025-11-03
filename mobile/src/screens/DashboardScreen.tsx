import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '../context/AuthContext'; // <-- Import our new hook

export const DashboardScreen = () => {
  const [loading, setLoading] = useState(false);
  const { signOut } = useAuth(); // <-- Get the signOut function

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await signOut(); // <-- Use the function
    if (error) Alert.alert('Error signing out', error.message);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        TrackMe Dashboard
      </Text>
      <Button
        mode="contained"
        onPress={handleSignOut}
        loading={loading}
        disabled={loading}
        style={styles.button}>
        Sign Out
      </Button>
    </View>
  );
};

// ... your styles StyleSheet ...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    marginBottom: 24,
  },
  button: {
    minWidth: 120,
  }
});