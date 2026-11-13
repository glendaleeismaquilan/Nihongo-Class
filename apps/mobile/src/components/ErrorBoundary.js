// Last-ditch crash catcher: wrap the app root with this so a thrown render error
// becomes a recovery screen instead of a blank white page.
import { Component } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { colors, spacing, text } from "../styles/theme";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Only rendered on the development build's console, but useful during QA.
    // eslint-disable-next-line no-console
    console.error("Unhandled render error", error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>The screen crashed. Tap Reset to try again. If it keeps happening, sign out and back in.</Text>
          <ScrollView style={styles.detail} contentContainerStyle={{ padding: spacing.sm }}>
            <Text style={styles.code}>{String(this.state.error?.message ?? this.state.error)}</Text>
          </ScrollView>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Reset</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.paper, borderRadius: 16, padding: spacing.xl, maxWidth: 500, alignItems: "center" },
  emoji: { fontSize: 48 },
  title: { ...text.h1, color: colors.ink, marginTop: spacing.sm, textAlign: "center" },
  body: { ...text.body, color: colors.ink2, marginTop: spacing.md, textAlign: "center" },
  detail: { marginTop: spacing.md, maxHeight: 160, backgroundColor: colors.kasumi, borderRadius: 8, alignSelf: "stretch" },
  code: { fontFamily: "monospace", fontSize: 12, color: colors.shu },
  btn: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: 10 },
  btnText: { ...text.button },
});
