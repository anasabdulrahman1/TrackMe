// App.tsx
import 'react-native-url-polyfill/auto'; // Must stay at the very top
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme as NavDefaultTheme,
  Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator } from 'react-native-paper';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { initializeNotifications } from './src/utils/notificationHandler';
import { NotificationToast } from './src/Components/NotificationToast';
import { EventRegister } from 'react-native-event-listeners';


// --- Screens ---
import { SignInScreen } from './src/screens/SignInScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AddSubscriptionScreen } from './src/screens/AddSubscriptionScreen';
import { NotificationSettingsScreen } from './src/screens/NotificationSettingsScreen';
import { NotificationHistoryScreen } from './src/screens/NotificationHistoryScreen';
import { GmailConnectionScreen } from './src/screens/GmailConnectionScreen';
import { SuggestionInboxScreen } from './src/screens/SuggestionInboxScreen';

// --- Stack Navigator ---
const Stack = createNativeStackNavigator();

/**
 * 🎨 Paper Theme (Material Design 3)
 * Source of truth for all colors across the app.
 */
const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6c47ff',
    background: '#fafafa',
    surface: '#ffffff',
    primaryContainer: '#e9e0ff',
    secondary: '#8b6cff',
    outline: '#e6e1f7',
    onSurface: '#000000',
  },
};

/**
 * 🧭 Navigation Theme
 * Keeps react-navigation visually consistent with Paper theme.
 */
const navTheme: NavTheme = {
  ...NavDefaultTheme,
  colors: {
    ...NavDefaultTheme.colors,
    primary: paperTheme.colors.primary,
    background: paperTheme.colors.background,
    card: paperTheme.colors.surface,
    text: paperTheme.colors.onSurface,
    border: paperTheme.colors.outline,
    notification: paperTheme.colors.secondary,
  },
};

/**
 * 🚀 RootNavigator
 * Handles the entire navigation logic for authenticated / unauthenticated users.
 */
function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={paperTheme.colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
      {session ? (
        <>
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddSubscription"
            component={AddSubscriptionScreen}
            options={{ title: 'Add New Subscription' }}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={NotificationSettingsScreen}
            options={{ title: 'Notification Settings' }}
          />
          <Stack.Screen
            name="NotificationHistory"
            component={NotificationHistoryScreen}
            options={{ title: 'Notification History' }}
          />
          <Stack.Screen
            name="GmailConnection"
            component={GmailConnectionScreen}
            options={{ title: 'Gmail Connection' }}
          />
          <Stack.Screen
            name="SuggestionInbox"
            component={SuggestionInboxScreen}
            options={{ title: 'Subscription Suggestions' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="SignIn"
            component={SignInScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SignUp"
            component={SignUpScreen}
            options={{ title: 'Create Account' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

/**
 * 🏁 App Entry
 * Wraps everything inside Paper, SafeArea, and Auth context.
 */
export default function App() {
  const [toast, setToast] = useState<{
    title: string;
    message: string;
    data?: any;
  } | null>(null);

  useEffect(() => {
    // Initialize notification handlers
    let unsubscribe: (() => void) | undefined;
    
    initializeNotifications((data) => {
      console.log('Notification pressed with data:', data);
      // Handle navigation based on notification data if needed
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    // Listen for toast notifications
    const toastListener = EventRegister.addEventListener(
      'showNotificationToast',
      (data: any) => {
        setToast(data);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setToast(null), 5000);
      }
    );

    return () => {
      unsubscribe?.();
      if (typeof toastListener === 'string') {
        EventRegister.removeEventListener(toastListener);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
            
            {/* Notification Toast Overlay */}
            {toast && (
              <View style={styles.toastContainer}>
                <NotificationToast
                  title={toast.title}
                  message={toast.message}
                  onPress={() => {
                    console.log('Toast pressed:', toast.data);
                    setToast(null);
                  }}
                  onDismiss={() => setToast(null)}
                  type="reminder"
                />
              </View>
            )}
          </NavigationContainer>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

/**
 * 💅 Styles
 */
const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
});
