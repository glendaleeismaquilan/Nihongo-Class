// A quiz or test in a list with the student's own progress (mirror of ItemRow in
// apps/web/src/roles/student/study/SelfStudyPage.tsx).
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, text } from "../../styles/theme";
import { Badge, Button, Panel } from "./ui";

/** `back` is "class" or "study": where the activity's back button returns to. */
export function ItemRow({ item, back, navigation }) {
  const passed = item.bestScore !== null && item.bestScore >= item.passingScorePct;
  return (
    <Panel style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={text.small}>
          {item.questionCount} questions, pass at {item.passingScorePct}%{item.attemptCount ? `, best ${item.bestScore}%` : ""}
        </Text>
      </View>
      <View style={styles.right}>
        {passed ? <Badge tone="success">Passed</Badge> : null}
        <Button size="sm" variant={item.attemptCount ? "secondary" : "primary"} onPress={() => navigation.navigate("Quiz", { activityType: item.type, activityId: item.id, back })}>
          {item.attemptCount ? "Try again" : "Start"}
        </Button>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  title: { fontSize: 18, color: colors.ink },
  right: { alignItems: "flex-end", gap: spacing.xs },
});
