# Nihongo Class mobile app

React Native + Expo (SDK 51) app for students, teachers, School Admins, and Content Admins.
It works exactly like the web app (Decision 17): Firebase is used for sign-in only, and every
read and write goes through the Nihongo Class API, so both apps show the same data with the
same rules. See `docs/PARITY.md` for the web ↔ mobile mapping.

## Install

`apps/mobile` is a standalone project (not an npm workspace member): it needs React 18 for
React Native 0.74, while the web app uses React 19. Install it on its own:

```bash
cd apps/mobile
npm install
```

## Point it at the API

`app.json` → `expo.extra.apiUrl` is the API the app calls (plus the Firebase settings).

- **Same Wi-Fi as the laptop:** `http://<laptop LAN IP>:3000`. Android release builds block
  plain HTTP, so `plugins/withApiNetworkSecurity.js` allows it for that one host only. On
  Windows, the laptop also needs an inbound firewall rule for port 3000.
- **Any network:** host the API and put its `https://` URL here — no cleartext exception is added.

Change `apiUrl` → rebuild the APK.

## Build an APK (EAS)

```bash
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

## Run it in a browser while developing

The app's own screens also run on react-native-web (video calls excepted). The web packages aren't
dependencies (the app ships for phones only), so add them first without saving them; the next
`npm install` removes them again:

```bash
npm install --no-save react-native-web@~0.19.10 react-dom@18.2.0 @expo/metro-runtime@~3.2.3
```

Point it at any API and, optionally, the Firebase Auth emulator with the same kind of overrides the
web app's `VITE_*` variables give (read by `app.config.js`; EAS builds set none of them):

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --web
# against the emulators: EXPO_PUBLIC_USE_EMULATORS=true EXPO_PUBLIC_FIREBASE_PROJECT_ID=nihongo-class-dev
```

The API must allow the Expo web origin: set `CORS_EXTRA_ORIGINS=http://localhost:8081` in `apps/api/.env`.

Expo Go can't run this app (it uses `react-native-webrtc`); use an EAS build on a phone.

A browser build doesn't prove the phone build works. The browser supplies its own `URL`, `Intl` and
DOM APIs, and React Native doesn't. On a phone, React Native's `URL` class throws on `host`,
`pathname` and `URLSearchParams.set`, so build and read URLs with `src/lib/url.js`, never `new URL()`.
Before a release, also check that the Android bundle compiles:

```bash
npx expo export --platform android --output-dir <a scratch folder>
```

## Shared code

`src/shared/` is a copy of `packages/shared`: constants, money and time helpers. An EAS build uploads
only `apps/mobile`, so the app can't import the package. `packages/shared/test/mobile-mirror.test.ts`
fails if a copy gives a different answer.
