package com.nihongoclass.googlesignin

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * "Sign in with Google" through Android's Credential Manager. It shows Google's account
 * picker and returns the chosen account's Google ID token, issued for the Firebase
 * project's web client. The app signs in to Firebase with that token, the same sign-in
 * the web app gets from signInWithPopup.
 */
class GoogleSignInModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NihongoGoogleSignIn")

    AsyncFunction("signIn") Coroutine { webClientId: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val request = GetCredentialRequest.Builder()
        .addCredentialOption(GetSignInWithGoogleOption.Builder(webClientId).build())
        .build()

      val response = try {
        withContext(Dispatchers.Main) {
          CredentialManager.create(activity).getCredential(activity, request)
        }
      } catch (e: GetCredentialCancellationException) {
        throw CodedException("ERR_CANCELED", "Google sign-in was cancelled.", e)
      } catch (e: GetCredentialException) {
        throw CodedException("ERR_GOOGLE_SIGN_IN", e.message ?: e.type, e)
      }

      val credential = response.credential
      if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        throw CodedException("ERR_GOOGLE_SIGN_IN", "Google returned a ${credential.type} credential, not an ID token.", null)
      }
      val google = try {
        GoogleIdTokenCredential.createFrom(credential.data)
      } catch (e: GoogleIdTokenParsingException) {
        throw CodedException("ERR_GOOGLE_SIGN_IN", "Couldn't read the ID token Google returned.", e)
      }
      mapOf("idToken" to google.idToken, "email" to google.id)
    }
  }
}
