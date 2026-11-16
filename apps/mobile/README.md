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

## Google sign-in

"Sign in with Google" (login) and "Sign up with Google" (create account) end in the same Firebase
sign-in as the web app's popup. On Android, `modules/google-sign-in` (a local Expo module) shows
Android's Google account picker through Credential Manager. It asks for an ID token for the Firebase
project's **web** client (`expo.extra.googleWebClientId` in `app.json`, the client ID shown under
Firebase → Authentication → Sign-in method → Google → Web SDK configuration), and
`src/lib/googleSignIn.js` signs in to Firebase with it.

Google only answers an app whose package name and signing certificate are registered in the same
Firebase project. Otherwise the app shows "Google sign-in didn't work: … Developer console is not set
up correctly". Register each certificate that signs an APK:

1. Get its SHA-1. For an EAS build, run `npx eas-cli credentials -p android` and read "SHA1 Fingerprint", or read it
   from an APK with `apksigner verify --print-certs app.apk`. A Play Store build is re-signed by Google:
   use the "App signing key" SHA-1 from Play Console as well.
2. Firebase console → Project settings → General → Your apps → the Android app
   `com.nihongoclass.mobile` (add it if it isn't there) → Add fingerprint → paste the SHA-1.

Firebase creates the Android OAuth client for that certificate itself. The browser build uses
`signInWithPopup`, like the web app. The app isn't built for iOS, so iOS shows no Google button. iOS
would need its own OAuth client and a native sign-in.

## App icon

`assets/icon.png` and `assets/adaptive-icon.png` are the Nihongo Class logo, made from
`apps/web/brand/logo-source.webp` at 1024 × 1024. `icon.png` is framed like the web's `pwa-512.png`
(logo 83% of the width, on white). The adaptive foreground is transparent, and the logo's whole outline
fits Android's 66 dp safe zone (61% of the width), so no launcher shape cuts it; its background is white.

## Shared code

`src/shared/` is a copy of `packages/shared`: constants, money and time helpers. An EAS build uploads
only `apps/mobile`, so the app can't import the package. `packages/shared/test/mobile-mirror.test.ts`
fails if a copy gives a different answer.
