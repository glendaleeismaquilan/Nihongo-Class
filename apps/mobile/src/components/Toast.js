// A tiny toast system. ToastProvider renders a single bottom toast queue;
// useToast().show(msg, variant) adds one that fades in, sits for 2.8s, fades out.
// Variants: "success" (green), "error" (red), "info" (neutral).
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet, Platform } from "react-native";
import { colors, spacing } from "../styles/theme";

const ToastContext = createContext({ show: () => {}, success: () => {}, error: () => {}, info: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  function show(message, variant = "info") {
    if (!message) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, variant });
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToast(null);
      });
    }, 2800);
  }

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  const value = useRef({
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  }).current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, VARIANT[toast.variant]?.bg]}>
            <Text style={styles.icon}>{VARIANT[toast.variant]?.icon}</Text>
            <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const VARIANT = {
  success: { icon: "✓", bg: { backgroundColor: "#15803d" } },
  error: { icon: "!", bg: { backgroundColor: colors.shu } },
  info: { icon: "i", bg: { backgroundColor: colors.ai } },
};

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: Platform.OS === "ios" ? 90 : 70, alignItems: "center", paddingHorizontal: spacing.lg },
  toast: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 999, maxWidth: "95%", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, gap: spacing.sm },
  icon: { color: "#fff", fontSize: 14, fontWeight: "900", width: 20, height: 20, textAlign: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", lineHeight: 20 },
  text: { color: "#fff", flex: 1, fontSize: 14, fontWeight: "500" },
});
