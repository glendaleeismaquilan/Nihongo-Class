// Turns a notification's web path — written by the API's notify() — into
// navigation for the signed-in role, so each role only lands on screens it has.
// Paths the API writes: /call/:id, /s/classes/:id[/live|/materials],
// /t/premium, /a/billing (payments), /t/settings, /a/settings (Google reconnect).
export function navigateFromNotificationLink(navigation, link, role) {
  if (!link || typeof navigation?.navigate !== "function") return false;

  let m = link.match(/^\/call\/([A-Za-z0-9_-]+)/);
  if (m && role !== "content_admin") {
    navigation.navigate("Classes", { screen: "Call", params: { callId: m[1] } });
    return true;
  }

  m = link.match(/^\/(s|t|a)\/classes\/([A-Za-z0-9_-]+)(?:\/([a-z]+))?/);
  if (m) {
    const [, area, classId, tab] = m;
    if (role === "student" && area === "s") {
      navigation.navigate("Classes", { screen: "ClassDetail", params: { classId, tab } });
      return true;
    }
    if ((role === "teacher" && area === "t") || (role === "school_admin" && area === "a")) {
      navigation.navigate("Classes", { screen: "TeacherClassDetail", params: { classId, tab } });
      return true;
    }
    return false;
  }

  if (role === "teacher" && link === "/t/premium") {
    navigation.navigate("Premium", { screen: "PremiumHome" });
    return true;
  }
  if (role === "teacher" && link === "/t/settings") {
    navigation.navigate("Profile", { screen: "GoogleSettings" });
    return true;
  }
  if (role === "school_admin" && link === "/a/billing") {
    navigation.navigate("Billing", { screen: "SchoolBillingHome" });
    return true;
  }
  if (role === "school_admin" && link === "/a/settings") {
    navigation.navigate("Profile", { screen: "SchoolSettings" });
    return true;
  }

  m = link.match(/^\/payments\/([A-Za-z0-9_-]+)/);
  if (m && (role === "teacher" || role === "school_admin")) {
    navigation.navigate(role === "teacher" ? "Premium" : "Billing", { screen: "PaymentPending", params: { paymentId: m[1] } });
    return true;
  }

  return false;
}
