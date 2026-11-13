// Shared colors and spacing matching the web app's palette so the mobile UI feels like Nihongo Class.
export const colors = {
  ai: "#2A4A7F",          // primary brand blue
  aiDark: "#1e3660",
  ink: "#111827",
  ink2: "#4b5563",
  line: "#d1d5db",
  paper: "#ffffff",
  kasumi: "#f3f4f6",      // light backdrop
  shu: "#b91c1c",          // danger red
  matcha: "#15803d",       // success green
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const text = {
  h1: { fontSize: 28, fontWeight: "700", color: colors.ink },
  h2: { fontSize: 20, fontWeight: "600", color: colors.ink },
  body: { fontSize: 16, color: colors.ink },
  bodyMuted: { fontSize: 16, color: colors.ink2 },
  small: { fontSize: 14, color: colors.ink2 },
  button: { fontSize: 16, fontWeight: "600", color: colors.paper },
};
