# 🔐 Android OAuth Client Setup Guide

## **Your App Details:**
- **Package Name**: `com.mobile`
- **Keystore**: `android/app/debug.keystore`

---

## **Step 1: Get SHA-1 Fingerprint**

### **Option A: Using Android Studio (Easiest)**

1. **Open Android Studio**
2. **Open your project**: `c:\TrackMe\mobile\android`
3. **Click Gradle tab** (right side)
4. **Navigate to**: `mobile > Tasks > android > signingReport`
5. **Double-click `signingReport`**
6. **Copy the SHA-1** from the output

### **Option B: Using Command Line**

Open Command Prompt and run:

```cmd
cd c:\TrackMe\mobile\android\app

"%JAVA_HOME%\bin\keytool" -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Or if JAVA_HOME is not set, find Java installation:

```cmd
# Find Java
where java

# Then use full path, example:
"C:\Program Files\Java\jdk-17\bin\keytool" -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android
```

### **Option C: Using Gradle (Recommended)**

```cmd
cd c:\TrackMe\mobile\android
gradlew signingReport
```

Look for output like:
```
Variant: debug
Config: debug
Store: C:\TrackMe\mobile\android\app\debug.keystore
Alias: androiddebugkey
MD5: XX:XX:XX:...
SHA1: AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD
SHA-256: ...
```

**Copy the SHA-1 value** (the one after "SHA1:")

---

## **Step 2: Create Android OAuth Client in Google Cloud**

1. **Go to**: https://console.cloud.google.com/

2. **Select your project**

3. **Navigate to**: APIs & Services > Credentials

4. **Click**: Create Credentials > OAuth 2.0 Client ID

5. **Select Application type**: **Android**

6. **Fill in the form:**
   - **Name**: `TrackMe Android`
   - **Package name**: `com.mobile`
   - **SHA-1 certificate fingerprint**: [Paste your SHA-1 from Step 1]

7. **Click Create**

8. **Copy the Client ID** (looks like: `123456-abc.apps.googleusercontent.com`)

---

## **Step 3: Update Your App**

Update the OAuth configuration in your app:

### **File: `mobile/src/screens/GmailConnectionScreen.tsx`**

Change the client ID to your new Android client ID:

```typescript
// Google OAuth configuration
const clientId = 'YOUR_ANDROID_CLIENT_ID_HERE.apps.googleusercontent.com';
```

**Important for Android OAuth:**
- ❌ No redirect URI needed
- ❌ No deep linking needed
- ✅ Uses package name + SHA-1 for verification
- ✅ Simpler and more secure

---

## **Step 4: Update the OAuth Flow for Android**

Since Android OAuth doesn't use redirect URIs, we need to update the flow:

### **Update `GmailConnectionScreen.tsx`:**

```typescript
const handleConnectGmail = async () => {
  try {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Please sign in first');
      setLoading(false);
      return;
    }

    // Google OAuth configuration for Android
    const clientId = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
    const scope = 'https://www.googleapis.com/auth/gmail.readonly';

    // For Android, we use urn:ietf:wg:oauth:2.0:oob
    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';

    // Build OAuth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    console.log('Opening OAuth URL:', authUrl);

    // Open in-app browser
    if (await InAppBrowser.isAvailable()) {
      const result = await InAppBrowser.openAuth(authUrl, redirectUri, {
        ephemeralWebSession: false,
        showTitle: false,
        enableUrlBarHiding: true,
        enableDefaultShare: false,
      });

      if (result.type === 'success') {
        // User will see the code on screen, we need to prompt them to copy it
        Alert.prompt(
          'Enter Authorization Code',
          'Copy the code from the browser and paste it here:',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Submit',
              onPress: async (code) => {
                if (code) {
                  await exchangeCodeForTokens(code, redirectUri);
                }
              },
            },
          ],
          'plain-text'
        );
      }
    } else {
      Linking.openURL(authUrl);
      Alert.prompt(
        'Enter Authorization Code',
        'After authorizing, copy the code and paste it here:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit',
            onPress: async (code) => {
              if (code) {
                await exchangeCodeForTokens(code, redirectUri);
              }
            },
          },
        ],
        'plain-text'
      );
    }
    setLoading(false);
  } catch (error: any) {
    console.error('OAuth error:', error);
    Alert.alert('Error', error.message || 'Failed to connect Gmail');
    setLoading(false);
  }
};
```

---

## **Step 5: Rebuild and Test**

```bash
cd c:\TrackMe\mobile

# Clean
cd android
gradlew clean
cd ..

# Rebuild
npm run android
```

---

## **Testing Flow:**

1. **Open app** and sign in
2. **Tap Gmail icon**
3. **Tap "Connect Gmail"**
4. **Browser opens** with Google OAuth
5. **Authorize** Gmail access
6. **Google shows authorization code** on screen
7. **Copy the code**
8. **Paste in app prompt**
9. **App exchanges code for tokens**
10. **Success!**

---

## **Alternative: Use Google Sign-In SDK (Better UX)**

For a better user experience, consider using the official Google Sign-In SDK:

```bash
npm install @react-native-google-signin/google-signin
```

This provides:
- ✅ Native Google Sign-In UI
- ✅ No manual code copying
- ✅ Better UX
- ✅ Automatic token management

---

## **Quick Reference:**

### **Your Details:**
- **Package Name**: `com.mobile`
- **Keystore**: `android/app/debug.keystore`
- **Alias**: `androiddebugkey`
- **Password**: `android`

### **Commands:**
```bash
# Get SHA-1
cd c:\TrackMe\mobile\android
gradlew signingReport

# Clean build
gradlew clean

# Run app
cd ..
npm run android
```

---

## **Troubleshooting:**

### **Can't find keytool:**
- Use Android Studio's signingReport
- Or use: `gradlew signingReport`

### **SHA-1 doesn't match:**
- Make sure you're using the debug keystore
- Check the keystore path in build.gradle
- Verify alias is `androiddebugkey`

### **OAuth still not working:**
- Verify package name matches exactly
- Verify SHA-1 is correct
- Wait a few minutes after creating OAuth client
- Try clearing app data and reinstalling

---

**Next Steps:**
1. Get your SHA-1 fingerprint
2. Create Android OAuth client
3. Update app with new client ID
4. Test!

Let me know when you have the SHA-1 and I'll help you update the app! 🚀
