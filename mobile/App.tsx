import 'react-native-url-polyfill/auto'; // Must be at the top
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext'; 

// --- Import Our Screens ---
import { SignInScreen } from './src/screens/SignInScreen';
import { SignUpScreen } from './src/screens/SignUpScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AddSubscriptionScreen } from './src/screens/AddSubscriptionScreen'; // <-- 1. IMPORT NEW SCREEN

const Stack = createNativeStackNavigator();

// The main navigation logic
const AppNavigator = () => {
  const { session } = useAuth(); 

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {session ? (
          // User is LOGGED IN: Show the main app
          <>
            <Stack.Screen 
              name="Dashboard" 
              component={DashboardScreen} 
              options={{ headerShown: false }} // Hide the default header
            />
            {/* 2. ADD NEW SCREEN TO THE LOGGED-IN STACK */}
            <Stack.Screen 
              name="AddSubscription" 
              component={AddSubscriptionScreen} 
              options={{ title: 'Add New Subscription' }} // Show a header
            />
          </>
        ) : (
          // User is LOGGED OUT: Show the auth flow
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
    </NavigationContainer>
  );
};

// The root component
const App = () => {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default App;