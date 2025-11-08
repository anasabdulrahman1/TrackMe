// src/utils/notificationHandler.ts
import messaging from '@react-native-firebase/messaging';
import { EventRegister } from 'react-native-event-listeners';

/**
 * Request notification permissions (iOS)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('✅ Notification permission granted:', authStatus);
  } else {
    console.log('❌ Notification permission denied');
  }

  return enabled;
}

/**
 * Display notification (foreground only - background handled by FCM automatically)
 */
async function displayNotification(
  title: string,
  body: string,
  data?: { [key: string]: string }
) {
  // Emit event for custom toast notification
  EventRegister.emit('showNotificationToast', {
    title,
    message: body,
    data,
  });
}

/**
 * Handle foreground messages (when app is open)
 */
export function setupForegroundMessageHandler() {
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    console.log('📬 Foreground notification received:', remoteMessage);

    const { notification, data } = remoteMessage;
    
    if (notification) {
      await displayNotification(
        notification.title || 'Subscription Reminder',
        notification.body || '',
        data as { [key: string]: string }
      );
    }
  });

  return unsubscribe;
}

/**
 * Handle background messages (when app is in background/quit)
 * Note: Background notifications are displayed automatically by FCM
 */
export function setupBackgroundMessageHandler() {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('📭 Background notification received:', remoteMessage);
    // FCM handles display automatically for background/quit state
    // This handler is for data-only messages or custom processing
  });
}

/**
 * Handle notification press events
 */
export function setupNotificationPressHandler(
  onNotificationPress?: (data: any) => void
) {
  // Handle notification opened app from quit state
  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (remoteMessage) {
        console.log('🔔 Notification opened app from quit state:', remoteMessage);
        onNotificationPress?.(remoteMessage.data);
      }
    });

  // Handle notification press when app is in background
  messaging().onNotificationOpenedApp((remoteMessage) => {
    console.log('🔔 Notification opened app from background:', remoteMessage);
    onNotificationPress?.(remoteMessage.data);
  });
}

/**
 * Initialize all notification handlers
 */
export async function initializeNotifications(
  onNotificationPress?: (data: any) => void
) {
  console.log('🔔 Initializing notification handlers...');

  // Request permission
  await requestNotificationPermission();

  // Setup handlers
  const unsubscribeForeground = setupForegroundMessageHandler();
  setupBackgroundMessageHandler();
  setupNotificationPressHandler(onNotificationPress);

  console.log('✅ Notification handlers initialized');

  return unsubscribeForeground;
}
