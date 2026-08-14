# Mobile Plan C — React Native Android

This is the native Android client for the AI Trading Assistant.

## Architecture

- React Native + TypeScript for the mobile UI.
- Android `MediaProjection` foreground service for system-wide screen capture.
- Captures a JPEG frame every 15/30/60 seconds into a bounded 20-frame rolling cache.
- User manually taps **Run AI Analysis**; there are no automatic AI calls.
- The mobile client sends the same `/api/analyze` contract used by the existing Next.js application.
- The previous AI analysis is retained and supplied as context for the next manual analysis.
- Changing symbol, timeframe, duration, strategies, indicators, provider, model, or platform resets the observation/analysis session.

## Android permissions

The app requires:

- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PROJECTION`
- `POST_NOTIFICATIONS` on Android versions that require notification permission

Android shows the system MediaProjection consent dialog before capture begins. A foreground service keeps capture alive while the user switches to the trading application.

## Vercel

Vercel can host the existing Next.js web application and `/api/analyze` backend. It does **not** deploy a React Native Android APK. The native app must be built with the Android toolchain (or a CI/EAS-style Android build service) and installed/distributed separately.

The Android app intentionally points at the existing deployed API so the AI providers, universal request/response contract, and database remain shared.

## Local Android setup

From `mobile/`:

```bash
npm install
npx react-native start
npx react-native run-android
```

The Android SDK/NDK/JDK and a physical Android device or emulator are required.
