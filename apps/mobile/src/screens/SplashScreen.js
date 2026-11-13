import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../styles/theme";

export function SplashScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.paper} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ai, justifyContent: "center", alignItems: "center" },
});
