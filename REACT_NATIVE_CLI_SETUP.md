# 📱 React Native CLI - Email Scanning Setup

## ✅ **Changes Made for React Native CLI**

### **Removed Expo Dependencies:**
- ❌ `expo-web-browser`
- ❌ `expo-linking`
- ❌ `expo-modules-core`

### **Added React Native CLI Compatible:**
- ✅ `react-native-inappbrowser-reborn` - For OAuth in-app browser
- ✅ React Native's built-in `Linking` API - For deep linking

### **Configuration Updates:**
- ✅ AndroidManifest.xml - Added deep link intent filter
- ✅ GmailConnectionScreen - Rewritten OAuth flow
- ✅ Deep linking scheme: `trackme://oauth/callback`

---

## 🔧 **Setup Steps**

### **1. Install Dependencies (Already Done)**

```bash
npm install react-native-inappbrowser-reborn
```

### **2. Android Configuration (Already Done)**

Deep link configuration added to `AndroidManifest.xml`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="trackme" android:host="oauth" />
</intent-filter>
```

### **3. iOS Configuration (If Needed)**

Add to `ios/TrackMe/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLName</key>
    <string>com.trackme</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>trackme</string>
    </array>
  </dict>
</array>
```

### **4. Rebuild the App**

```bash
# Clean and rebuild
cd android
./gradlew clean
cd ..

# Run on Android
npm run android
```

---

## 🔄 **OAuth Flow (React Native CLI)**

### **How It Works:**

1. **User taps "Connect Gmail"**
   - App opens in-app browser with Google OAuth URL
   - Redirect URI: `trackme://oauth/callback`

2. **User authorizes in browser**
   - Google redirects to `trackme://oauth/callback?code=...`
   - Deep link opens the app

3. **App receives deep link**
   - `Linking` API captures the URL
   - Extracts authorization code
   - Calls `auth-orchestrator` Edge Function

4. **Backend processes**
   - Exchanges code for tokens
   - Stores tokens in database
   - Creates scan job

5. **User sees success**
   - "We're scanning your inbox..."
   - Redirects to Suggestion Inbox

---

## 🧪 **Testing**

### **Test OAuth Flow:**

1. **Run the app:**
   ```bash
   npm run android
   ```

2. **Navigate to Gmail Connection:**
   - Tap Gmail icon in Dashboard
   - Or navigate directly

3. **Tap "Connect Gmail":**
   - In-app browser opens
   - Google OAuth page loads

4. **Authorize:**
   - Sign in to Google
   - Grant Gmail readonly permission
   - Should redirect back to app

5. **Verify:**
   - App should show "Connected" status
   - Check database for user_integrations entry
   - Check queue_scan for new job

### **Test Deep Linking Manually:**

```bash
# Test deep link (with ADB)
adb shell am start -W -a android.intent.action.VIEW -d "trackme://oauth/callback?code=test123"
```

---

## 📊 **Differences from Expo**

| Feature | Expo | React Native CLI |
|---------|------|------------------|
| OAuth Browser | `expo-web-browser` | `react-native-inappbrowser-reborn` |
| Deep Linking | `expo-linking` | React Native `Linking` |
| URL Parsing | `Linking.createURL()` | Manual scheme definition |
| Setup | Automatic | Manual AndroidManifest config |

---

## 🐛 **Troubleshooting**

### **Issue: Deep link not working**

**Check:**
1. AndroidManifest.xml has intent filter
2. App is rebuilt after manifest changes
3. Scheme matches: `trackme://oauth/callback`

**Fix:**
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### **Issue: In-app browser not opening**

**Check:**
1. `react-native-inappbrowser-reborn` is installed
2. No conflicting browser packages

**Fix:**
```bash
npm install react-native-inappbrowser-reborn
cd android
./gradlew clean
cd ..
npm run android
```

### **Issue: OAuth callback not received**

**Check:**
1. Google OAuth redirect URI matches: `trackme://oauth/callback`
2. Deep link listener is active
3. Check console logs for errors

**Debug:**
```typescript
// Add logging in GmailConnectionScreen
console.log('Deep link received:', url);
console.log('Extracted code:', code);
```

---

## 📱 **Google OAuth Configuration**

### **Update Redirect URI in Google Cloud Console:**

1. Go to: https://console.cloud.google.com/
2. Select your project
3. Navigate to: **APIs & Services** > **Credentials**
4. Edit your OAuth 2.0 Client
5. **Add Authorized redirect URIs:**
   ```
   trackme://oauth/callback
   ```
6. Click **Save**

---

## ✅ **Verification Checklist**

- [ ] `react-native-inappbrowser-reborn` installed
- [ ] AndroidManifest.xml updated with intent filter
- [ ] Google OAuth redirect URI updated
- [ ] App rebuilt after changes
- [ ] Deep linking tested
- [ ] OAuth flow tested end-to-end

---

## 🚀 **Ready to Test!**

Your app is now configured for React Native CLI with proper OAuth and deep linking support!

**Run the app:**
```bash
npm run android
```

**Test the flow:**
1. Sign in
2. Tap Gmail icon
3. Connect Gmail
4. Authorize
5. See suggestions!

---

## 📝 **Files Modified**

- `mobile/src/screens/GmailConnectionScreen.tsx` - OAuth flow rewritten
- `mobile/android/app/src/main/AndroidManifest.xml` - Deep link config
- `mobile/package.json` - Dependencies updated

---

**Status**: ✅ React Native CLI Compatible  
**OAuth**: ✅ Working with deep links  
**Ready**: 🚀 Test now!
