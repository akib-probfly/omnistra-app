# Omnistra Mobile

React Native and Expo mobile app for the Omnistra omnichannel inbox.

## Android APK builds with EAS

This project is configured for Expo EAS Build with `eas.json`.

Build profiles:

- `development`: internal development-client build.
- `preview`: internal installable Android APK for QA/testing.
- `production-apk`: production-mode installable Android APK for sharing with testers.
- `production`: Android App Bundle (`.aab`) for Google Play submission.

Android settings live in `app.json`:

- `android.package`: `com.omnistra.mobile`
- `android.versionCode`: `1`
- adaptive icon assets under `assets/`

### One-time setup

Install dependencies:

```powershell
npm install
```

Log in to Expo:

```powershell
npx eas login
```

If this is the first EAS build for the project, initialize/link the EAS project:

```powershell
npx eas build:configure --platform android
```

### Validate before building

Run these checks before creating a production APK:

```powershell
npm run validate:android
```

If local Android build tooling is not installed, use the hosted EAS builder instead:

```powershell
npm run build:android:apk
```

### Create a shareable APK

Generate the installable Android APK:

```powershell
npm run build:android:apk
```

After the build completes, EAS prints a build details URL and the APK artifact URL. Share the APK URL with Android testers, or download it from the EAS dashboard.

For Play Store release builds, use:

```powershell
npm run build:android:aab
```
