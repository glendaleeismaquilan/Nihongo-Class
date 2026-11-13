// Same notice the web app shows (apps/web/src/pages/auth/AuthLayout.tsx PrivacyNotice).
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "../styles/theme";

export function PrivacyNotice() {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Privacy notice</Text>
      <Text style={styles.body}>
        Under the Data Privacy Act of 2012 (RA 10173), we collect your name, email address, study level, time zone, quiz and test results, and class attendance.
        We use them to run your classes and track your progress. Classes are free; for teachers and School Admins we also keep records of Premium and teacher-slot
        payments.
      </Text>
      <Text style={styles.body}>
        We share them only with your school's staff, with PayMongo when a teacher or school pays online, and with Google when a teacher sends calendar invites for
        live classes. In-app video calls go directly between the people in the call and aren't recorded. We don't collect birthdays, home addresses, or ID numbers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.kasumi, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.md },
  title: { fontSize: 14, fontWeight: "600", color: colors.ink },
  body: { fontSize: 14, color: colors.ink, marginTop: spacing.xs, lineHeight: 20 },
});
