// School Admins pick a class's teachers from the school's active teachers —
// web: TeacherPicker in features/classes/ClassListPage.tsx
// (GET /schools/:schoolId/users?role=teacher, disabled teachers left out).
import { View, Text, StyleSheet } from "react-native";
import { Loading, ErrorState } from "../../components/QueryState";
import { useSchoolTeachers } from "./classHooks";
import { Check } from "./ui";
import { colors, spacing } from "../../styles/theme";

export function TeacherPicker({ schoolId, value, onChange, error, disabled }) {
  const teachers = useSchoolTeachers(schoolId);
  if (teachers.isPending) return <Loading label="Loading teachers" />;
  if (teachers.isError) return <ErrorState error={teachers.error} retry={() => teachers.refetch()} />;
  const list = (teachers.data ?? []).filter((t) => !t.disabled);
  return (
    <View style={s.wrap} accessibilityRole="none" accessibilityLabel="Teachers">
      <Text style={s.legend}>Teachers</Text>
      {list.length === 0 ? (
        <Text style={s.muted}>No teachers yet. Add them in People.</Text>
      ) : (
        list.map((t) => (
          <Check
            key={t.uid}
            label={t.name}
            hint={t.email}
            checked={value.includes(t.uid)}
            disabled={disabled}
            onChange={(on) => onChange(on ? [...value, t.uid] : value.filter((v) => v !== t.uid))}
          />
        ))
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  legend: { fontSize: 14, fontWeight: "500", color: colors.ink, marginBottom: spacing.xs },
  muted: { fontSize: 14, color: colors.ink2 },
  error: { color: colors.shu, fontSize: 13, marginTop: spacing.xs },
});
