// About: the app version, who is signed in, which server the app talks to, and
// the same privacy notice the web app shows (apps/web/src/pages/auth/AuthLayout.tsx).
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";
import { API_URL } from "../../lib/api";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { colors, spacing, text } from "../../styles/theme";

// Same labels as ROLE_LABEL in apps/web/src/lib/auth.tsx.
const ROLE_LABEL = { student: "Student", teacher: "Teacher", content_admin: "Content admin", school_admin: "School admin" };

export function AboutScreen({ navigation }) {
  const { me, signOut } = useAuth();
  const version = Constants.expoConfig?.version;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>About</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.card}>
          <Text style={styles.heroTitle}>Nihongo Class</Text>
          {version ? <Text style={text.small}>Version {version}</Text> : null}
        </View>

        <View style={styles.card}>
          <Row label="Signed in as" value={me?.email ?? ""} />
          <Row label="Role" value={ROLE_LABEL[me?.role] ?? ""} />
          {me?.school ? <Row label="School" value={me.school.name} /> : null}
          <Row label="Server" value={API_URL} small />
        </View>

        <PrivacyNotice />

        <Pressable style={styles.danger} onPress={() => void signOut()} accessibilityRole="button">
          <Text style={styles.dangerText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, small }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, small && { fontSize: 12 }]} numberOfLines={small ? 2 : 1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { padding: spacing.lg, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { color: colors.ai, fontSize: 15, minHeight: 32 },
  title: { ...text.h1, color: colors.ink, marginTop: spacing.xs, fontSize: 22 },
  card: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm },
  heroTitle: { ...text.h1, color: colors.ai, fontSize: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  rowLabel: { ...text.small, color: colors.ink2 },
  rowValue: { ...text.body, flex: 1, textAlign: "right", marginLeft: spacing.md },
  danger: { marginTop: spacing.lg, backgroundColor: colors.shu, paddingVertical: 14, borderRadius: 10, alignItems: "center", minHeight: 48, justifyContent: "center" },
  dangerText: { ...text.button },
});
