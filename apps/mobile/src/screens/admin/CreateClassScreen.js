// Create a class — web: CreateClassDialog in features/classes/ClassListPage.tsx.
// Teachers create their own classes; a School Admin also picks the teachers
// (any of the school's active teachers, or none yet). The new class opens next.
import { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../lib/api";
import { JLPT_LEVELS } from "../../shared/constants";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { classKeys } from "../teacher/classHooks";
import { TeacherPicker } from "../teacher/TeacherPicker";
import { Button, Field, Header, InlineAlert, Picker, ui } from "../teacher/ui";
import { spacing, text } from "../../styles/theme";

export function CreateClassScreen({ navigation }) {
  const { me } = useAuth();
  const isAdmin = me?.role === "school_admin";
  const [name, setName] = useState("");
  const [level, setLevel] = useState("N5");
  const [teacherIds, setTeacherIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  async function submit() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const cls = await api("/classes", { body: { name, level, ...(isAdmin ? { teacherIds } : {}) } });
      await qc.invalidateQueries({ queryKey: classKeys.all });
      toast.success("Class created");
      navigation.replace("TeacherClassDetail", { classId: cls.id });
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title="Create class" onBack={() => navigation.goBack()} backLabel="Classes" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
          <Field label="Class name" placeholder="N5 Saturday Class" value={name} onChangeText={setName} error={errors.name} returnKeyType="done" />
          <Picker label="JLPT level" value={level} onChange={setLevel} options={JLPT_LEVELS.map((l) => ({ value: l, label: l }))} error={errors.level} />
          {isAdmin ? <TeacherPicker schoolId={me.schoolId} value={teacherIds} onChange={setTeacherIds} error={errors.teacherIds} /> : null}
          <Text style={[text.small, { marginTop: spacing.lg }]}>Classes are free for students. They join with the class code shown after you create it.</Text>
          <View style={s.actions}>
            <Button variant="secondary" onPress={() => navigation.goBack()} disabled={busy}>Cancel</Button>
            <Button onPress={submit} loading={busy}>Create class</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xl },
});
