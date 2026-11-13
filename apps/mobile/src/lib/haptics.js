// Tiny haptic helper built on React Native's Vibration API (no native dep needed).
// Call `h.tap()` for a tiny confirmation, `h.success()` for a double pulse,
// `h.error()` for a longer pulse. On iOS the Vibration API uses the taptic engine.
import { Vibration } from "react-native";

export const h = {
  tap: () => Vibration.vibrate(15),
  success: () => Vibration.vibrate([0, 30, 60, 30]),
  error: () => Vibration.vibrate(120),
};
