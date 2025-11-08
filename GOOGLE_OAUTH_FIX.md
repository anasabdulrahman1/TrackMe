# 🔧 Google OAuth Configuration Fix

## **Problem:**
Google OAuth doesn't accept custom URI schemes (`trackme://`) for web applications.

## **Solution: Use Localhost (Quick Testing)**

### **✅ Already Done:**
- Updated app to use `http://localhost:3000/oauth/callback`
- This works with your existing Web OAuth client

### **📝 What You Need to Do:**

**In Google Cloud Console:**
1. Keep the redirect URI as: `http://localhost:3000/oauth/callback`
2. **Remove** the `trackme://oauth/callback` URI (it's invalid)
3. Click **Save**

**That's it!** The app is now configured to use localhost.

---

## **🧪 Testing:**

1. **Rebuild the app:**
   ```bash
   cd c:\TrackMe\mobile
   cd android
   gradlew clean
   cd ..
   npm run android
   ```

2. **Test OAuth:**
   - Sign in to app
   - Tap Gmail icon
   - Tap "Connect Gmail"
   - In-app browser opens
   - Authorize Gmail
   - Browser redirects to localhost
   - App captures the redirect
   - Success!

---

## **🚀 For Production (Later):**

For production, you should create an **Android OAuth Client**:

### **Steps:**

1. **Get SHA-1 fingerprint:**
   ```bash
   cd c:\TrackMe\mobile\android
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```

2. **Create Android OAuth Client:**
   - Go to Google Cloud Console
   - Create Credentials > OAuth 2.0 Client ID
   - Type: **Android**
   - Package name: `com.trackme`
   - SHA-1: Paste from step 1

3. **Update app to use Android client:**
   - Use the new Android client ID
   - No redirect URI needed for Android
   - Uses package name + SHA-1 for verification

---

## **📊 Comparison:**

| Method | Pros | Cons |
|--------|------|------|
| **Localhost (Current)** | ✅ Quick setup<br>✅ Works with web client<br>✅ Good for testing | ⚠️ Not for production<br>⚠️ Requires localhost redirect |
| **Android Client (Production)** | ✅ Proper mobile OAuth<br>✅ No redirect URI needed<br>✅ More secure | ⏳ Requires SHA-1 setup<br>⏳ Need separate client |

---

## **✅ Current Status:**

- ✅ App configured for localhost OAuth
- ✅ Works with existing web client
- ✅ Ready to test
- ⏳ Remove `trackme://` URI from Google Console
- ⏳ Rebuild and test

---

**Next:** Remove the invalid URI from Google Console and test!
