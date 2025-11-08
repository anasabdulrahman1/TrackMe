// src/screens/NotificationSettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  List,
  Switch,
  Text,
  Divider,
  SegmentedButtons,
  Button,
  ActivityIndicator,
} from 'react-native-paper';
import { AppLayout } from '../Components/AppLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface NotificationSettings {
  enabled: boolean;
  reminder_time: string; // '08:00', '09:00', etc.
  default_reminder_days: string; // '1,3,7'
  sound_enabled: boolean;
  vibration_enabled: boolean;
}

export const NotificationSettingsScreen = () => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    reminder_time: '08:00',
    default_reminder_days: '1,3,7',
    sound_enabled: true,
    vibration_enabled: true,
  });

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      
      // Load user preferences from profiles table
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_settings')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      if (data?.notification_settings) {
        setSettings({ ...settings, ...data.notification_settings });
      }
    } catch (error: any) {
      console.error('Error loading settings:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!session?.user?.id) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({ notification_settings: settings })
        .eq('id', session.user.id);

      if (error) throw error;

      Alert.alert('Success', 'Notification settings saved successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout centerContent>
        <ActivityIndicator size="large" />
      </AppLayout>
    );
  }

  return (
    <AppLayout scrollable>
      <ScrollView style={styles.container}>
        <Text variant="headlineSmall" style={styles.header}>
          Notification Preferences
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Customize how and when you receive subscription reminders
        </Text>

        {/* Enable/Disable Notifications */}
        <List.Section>
          <List.Item
            title="Enable Notifications"
            description="Receive reminders for upcoming payments"
            left={(props) => <List.Icon {...props} icon="bell" />}
            right={() => (
              <Switch
                value={settings.enabled}
                onValueChange={(value) =>
                  setSettings({ ...settings, enabled: value })
                }
              />
            )}
          />
        </List.Section>

        <Divider style={styles.divider} />

        {/* Reminder Time */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Reminder Time
          </Text>
          <Text variant="bodySmall" style={styles.sectionDescription}>
            Choose what time you want to receive daily reminders
          </Text>

          <SegmentedButtons
            value={settings.reminder_time}
            onValueChange={(value) =>
              setSettings({ ...settings, reminder_time: value })
            }
            buttons={[
              { value: '08:00', label: '8 AM' },
              { value: '09:00', label: '9 AM' },
              { value: '10:00', label: '10 AM' },
              { value: '12:00', label: '12 PM' },
            ]}
            style={styles.segmented}
          />

          <SegmentedButtons
            value={settings.reminder_time}
            onValueChange={(value) =>
              setSettings({ ...settings, reminder_time: value })
            }
            buttons={[
              { value: '18:00', label: '6 PM' },
              { value: '19:00', label: '7 PM' },
              { value: '20:00', label: '8 PM' },
              { value: '21:00', label: '9 PM' },
            ]}
            style={styles.segmented}
          />
        </View>

        <Divider style={styles.divider} />

        {/* Default Reminder Days */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Default Reminder Days
          </Text>
          <Text variant="bodySmall" style={styles.sectionDescription}>
            How many days before payment to remind you
          </Text>

          <SegmentedButtons
            value={settings.default_reminder_days}
            onValueChange={(value) =>
              setSettings({ ...settings, default_reminder_days: value })
            }
            buttons={[
              { value: '1', label: '1 day' },
              { value: '1,3', label: '1 & 3 days' },
              { value: '1,3,7', label: '1, 3 & 7 days' },
            ]}
            style={styles.segmented}
          />
        </View>

        <Divider style={styles.divider} />

        {/* Sound & Vibration */}
        <List.Section>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Notification Style
          </Text>

          <List.Item
            title="Sound"
            description="Play sound with notifications"
            left={(props) => <List.Icon {...props} icon="volume-high" />}
            right={() => (
              <Switch
                value={settings.sound_enabled}
                onValueChange={(value) =>
                  setSettings({ ...settings, sound_enabled: value })
                }
              />
            )}
          />

          <List.Item
            title="Vibration"
            description="Vibrate when notification arrives"
            left={(props) => <List.Icon {...props} icon="vibrate" />}
            right={() => (
              <Switch
                value={settings.vibration_enabled}
                onValueChange={(value) =>
                  setSettings({ ...settings, vibration_enabled: value })
                }
              />
            )}
          />
        </List.Section>

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={saveSettings}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
          icon="content-save"
        >
          Save Settings
        </Button>

        <View style={styles.spacer} />
      </ScrollView>
    </AppLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    fontWeight: '700',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#1a1a1a',
  },
  sectionDescription: {
    color: '#666',
    marginBottom: 12,
    lineHeight: 18,
  },
  segmented: {
    marginBottom: 12,
  },
  divider: {
    marginVertical: 8,
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 6,
  },
  spacer: {
    height: 40,
  },
});
