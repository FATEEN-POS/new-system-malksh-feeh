# Building Fateen POS for Android (TWA)

This guide explains how to build an Android APK for Fateen POS as a [Trusted Web Activity (TWA)](https://developer.chrome.com/docs/android/trusted-web-activity/) using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

A TWA wraps your hosted PWA in an Android shell with **no address bar**, full-screen experience, and access to Android features like push notifications and home-screen installation.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Java JDK 17](https://adoptium.net/) (required by Gradle)
- [Android SDK](https://developer.android.com/studio) with `build-tools` and `platform-tools`
- Bubblewrap CLI: `npm install -g @bubblewrap/cli`

---

## Hosted Origin

The TWA points to the GitHub Pages deployment:

```
https://fateen-pos.github.io/test-pos
```

If you use the custom domain (`pos.fateen1.me`), update `TWA_ORIGIN` in `.github/workflows/build-android.yml` accordingly.

> **Important:** The domain used in the TWA must exactly match the `start_url` in `manifest.json` and the origin configured in the [Digital Asset Links](https://developer.android.com/training/app-links/verify-site-associations) file on the server.

---

## Local Build

```bash
# 1. Install Bubblewrap globally
npm install -g @bubblewrap/cli

# 2. Create a working directory for the Android project
mkdir android-twa && cd android-twa

# 3. Initialise the TWA project from the hosted manifest
bubblewrap init --manifest https://fateen-pos.github.io/test-pos/manifest.json

# 4. Build the debug APK
bubblewrap build

# 5. Find the APK
ls app/build/outputs/apk/release/
```

---

## CI / GitHub Actions

The workflow `.github/workflows/build-android.yml` runs automatically on every push to `main` or branches matching `copilot/**`.

You can also trigger it manually via **Actions → Build Android APK (TWA) → Run workflow**.

The debug APK artifact is retained for **30 days**.

---

## Signing a Release APK

The CI build produces a **debug-signed** APK suitable for testing. For a Play Store / production release:

1. Generate a release keystore:
   ```bash
   keytool -genkeypair -v \
     -keystore fateen-release.jks \
     -alias fateen \
     -keyalg RSA -keysize 2048 \
     -validity 10000
   ```

2. Add the following secrets to your GitHub repository:

   | Secret | Description |
   |--------|-------------|
   | `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` keystore file |
   | `ANDROID_KEY_ALIAS` | Key alias (e.g., `fateen`) |
   | `ANDROID_KEY_PASSWORD` | Key password |
   | `ANDROID_STORE_PASSWORD` | Store password |

3. Update the `Build debug APK` step in the workflow to pass signing config:
   ```yaml
   - name: Build release APK
     run: |
       echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > fateen.jks
       cd android-twa
       bubblewrap build \
         --skipPwaValidation \
         --keyPath ../fateen.jks \
         --keyAlias "${{ secrets.ANDROID_KEY_ALIAS }}"
   ```

---

## Digital Asset Links (assetlinks.json)

For the TWA to work correctly, the server must host a Digital Asset Links file at:

```
https://<your-domain>/.well-known/assetlinks.json
```

Content example (replace `SHA256_CERT_FINGERPRINT` with your actual keystore fingerprint):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "me.fateen1.pos",
    "sha256_cert_fingerprints": ["SHA256_CERT_FINGERPRINT"]
  }
}]
```

For GitHub Pages deployments, place `assetlinks.json` in `.well-known/assetlinks.json` in the repository root and ensure GitHub Pages serves it.

---

## Offline Operation

The TWA renders the hosted PWA which uses a Service Worker to cache all static assets. After first load, the app works fully offline. Supabase is contacted only for employee login and periodic licence validation.
