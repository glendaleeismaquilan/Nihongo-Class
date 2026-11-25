// Top-level navigation, in the same order as the web app's route guard
// (apps/web/src/components/layout/Guard.tsx): signed out → auth screens;
// profile missing → finish sign-up; any other /me error → error with retry and
// sign out; no privacy consent yet → consent; student without a level → choose
// level; otherwise the role's tabs.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { SignupScreen } from "../screens/auth/SignupScreen";
import { FinishSignupScreen } from "../screens/auth/FinishSignupScreen";
import { ConsentScreen } from "../screens/auth/ConsentScreen";
import { ResetPasswordScreen } from "../screens/auth/ResetPasswordScreen";
import { ChooseLevelScreen } from "../screens/auth/ChooseLevelScreen";
import { VerifyEmailScreen, needsEmailVerification } from "../screens/auth/VerifyEmailScreen";
import { SplashScreen } from "../screens/SplashScreen";
import { usePushNotifications } from "../lib/push";
import { StudentTabs } from "./StudentTabs";
import { TeacherTabs } from "./TeacherTabs";
import { SchoolAdminTabs } from "./SchoolAdminTabs";
import { ContentAdminTabs } from "./ContentAdminTabs";
import { errorMessage } from "../lib/api";
import { colors, spacing, text } from "../styles/theme";

const Stack = createNativeStackNavigator();

function RoleTabs() {
  const { me } = useAuth();
  if (me?.role === "teacher") return <TeacherTabs />;
  if (me?.role === "school_admin") return <SchoolAdminTabs />;
  if (me?.role === "content_admin") return <ContentAdminTabs />;
  if (me?.role === "student") return <StudentTabs />;
  return null;
}

function MeError() {
  const { meError, refreshMe, signOut } = useAuth();
  return (
    <View style={errStyles.wrap}>
      <Text style={errStyles.title}>Couldn't load your account</Text>
      <Text style={errStyles.body} accessibilityRole="alert">{errorMessage(meError ?? new Error("Couldn't load your account."))}</Text>
      <Pressable style={errStyles.primary} onPress={() => void refreshMe()} accessibilityRole="button"><Text style={errStyles.primaryText}>Try again</Text></Pressable>
      <Pressable style={errStyles.secondary} onPress={() => void signOut()} accessibilityRole="button"><Text style={errStyles.secondaryText}>Sign out</Text></Pressable>
    </View>
  );
}

const errStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.kasumi, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  title: { ...text.h1, color: colors.ink, textAlign: "center" },
  body: { ...text.body, color: colors.shu, marginTop: spacing.md, textAlign: "center" },
  primary: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: 10, minHeight: 44, justifyContent: "center" },
  primaryText: { ...text.button },
  secondary: { marginTop: spacing.md, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  secondaryText: { color: colors.ai, fontWeight: "600" },
});

const navigationRef = createNavigationContainerRef();

export function AppNavigator() {
  const { firebaseUser, initializing, registering, meLoading, me, meError } = useAuth();
  // Phone notifications start once the person is fully signed in (verified, consented).
  const signedIn = !!firebaseUser && !needsEmailVerification(firebaseUser) && !!me?.privacyConsentAt;
  usePushNotifications(signedIn ? me : null, navigationRef);

  let screens;
  if (initializing) {
    screens = <Stack.Screen name="Splash" component={SplashScreen} />;
  } else if (!firebaseUser || (registering && !meError)) {
    // While sign-up registers the profile, stay on the sign-up form.
    screens = (
      <>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </>
    );
  } else if (needsEmailVerification(firebaseUser)) {
    screens = <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />;
  } else if (meLoading) {
    screens = <Stack.Screen name="Splash" component={SplashScreen} />;
  } else if (meError?.code === "profile_missing") {
    screens = <Stack.Screen name="FinishSignup" component={FinishSignupScreen} />;
  } else if (meError || !me) {
    screens = <Stack.Screen name="MeError" component={MeError} />;
  } else if (!me.privacyConsentAt) {
    screens = <Stack.Screen name="Consent" component={ConsentScreen} />;
  } else if (me.role === "student" && !me.studyLevel) {
    screens = <Stack.Screen name="ChooseLevel" component={ChooseLevelScreen} />;
  } else {
    screens = <Stack.Screen name="App" component={RoleTabs} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>{screens}</Stack.Navigator>
    </NavigationContainer>
  );
}
