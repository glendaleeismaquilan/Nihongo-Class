// Google sign-in, ending in the same Firebase sign-in as the web app's
// signInWithPopup (LoginPage.tsx, SignupPage.tsx). On Android, Credential Manager's
// "Sign in with Google" (modules/google-sign-in) shows Google's account picker and
// returns an ID token issued for the Firebase project's web client
// (app.json → extra.googleWebClientId); Firebase signs in with that token. The
// browser build uses signInWithPopup, like the web app.
import { Platform } from "react-native";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
// signInWithPopup exists only in Firebase's browser build, and only the browser build calls it.
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth } from "../config/firebase";

const nativeGoogle = Platform.OS === "android" ? requireOptionalNativeModule("NihongoGoogleSignIn") : null;
const webClientId = Constants.expoConfig?.extra?.googleWebClientId || null;

// iOS would need an iOS OAuth client and its own native sign-in; the app isn't built for iOS.
export const googleSignInSupported = Platform.OS === "android" || Platform.OS === "web";

/** Signs in to Firebase with the Google account the person picks. Resolves to the Firebase user. */
export async function signInWithGoogle() {
  if (Platform.OS === "web") {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return (await signInWithPopup(auth, provider)).user;
  }
  if (!nativeGoogle) throw codedError("ERR_NOT_IN_BUILD", "this build of the app doesn't include it.");
  if (!webClientId) throw codedError("ERR_NOT_CONFIGURED", "this build has no Google client ID (app.json → extra.googleWebClientId).");
  const { idToken } = await nativeGoogle.signIn(webClientId);
  return (await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))).user;
}

/** The person closed Google's account picker. The screens say nothing, as the web app does. */
export function isGoogleSignInCancel(err) {
  return err?.code === "ERR_CANCELED" || err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request";
}

/** A specific reason a Google sign-in failed, or null when the screen's general message fits. */
export function googleSignInProblem(err) {
  switch (err?.code) {
    case "auth/account-exists-with-different-credential":
      return "This email is already registered with a password. Sign in with your password first.";
    case "auth/user-disabled":
      return "This account is disabled. Contact your school.";
    case "auth/network-request-failed":
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    case "ERR_GOOGLE_SIGN_IN":
    case "ERR_NOT_CONFIGURED":
    case "ERR_NOT_IN_BUILD":
      return `Google sign-in didn't work: ${err.message}`;
    default:
      return null;
  }
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}
