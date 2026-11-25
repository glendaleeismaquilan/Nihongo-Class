// Phone push notifications. After sign-in the app asks for permission and
// registers this phone with the API (POST /me/push-tokens); from then on every
// in-app notification also appears in Android's notification tray, even when the
// app is closed (the API sends it through Firebase Cloud Messaging, lib/push.ts).
// Tapping one opens its screen, the same way the Notifications tab does.
// Android only: the app isn't built for iOS, and the browser build skips it.
import { useEffect } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { api } from "./api";
import { navigateFromNotificationLink } from "./notificationLink";

export const pushSupported = Platform.OS === "android";

let currentToken = null;
let handledResponseId = null;

if (pushSupported) {
  // While the app is open, a new notification still shows as a banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Asks for permission (Android 13+ shows the prompt once) and registers this phone. */
export async function registerForPush() {
  if (!pushSupported) return null;
  // The API sends to this channel; it must exist before Android 13 shows the permission prompt.
  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#C23B22",
  });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  if (!token) return null;
  await api("/me/push-tokens", { method: "POST", body: { token, platform: "android" } });
  currentToken = token;
  return token;
}

/** Called before signing out, while the API still accepts this user's token. */
export async function unregisterFromPush() {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  await api("/me/push-tokens", { method: "DELETE", body: { token } }).catch(() => undefined);
}

// A system-shown notification carries the API's data in the FCM message; one shown
// while the app was open carries it in the notification's content.
function linkOf(response) {
  const request = response?.notification?.request;
  return request?.content?.data?.link || request?.trigger?.remoteMessage?.data?.link || null;
}

/** Registers the signed-in user's phone and opens tapped notifications. */
export function usePushNotifications(me, navigationRef) {
  const qc = useQueryClient();
  const uid = me?.uid ?? null;
  const role = me?.role ?? null;

  useEffect(() => {
    if (!pushSupported || !uid) return undefined;
    registerForPush().catch(() => undefined);

    const open = (response) => {
      const id = response?.notification?.request?.identifier ?? null;
      if (id && id === handledResponseId) return;
      handledResponseId = id;
      const link = linkOf(response);
      if (!link) return;
      const go = (tries) => {
        if (navigationRef.isReady()) navigateFromNotificationLink(navigationRef, link, role);
        else if (tries > 0) setTimeout(() => go(tries - 1), 300);
      };
      go(10);
    };

    const subs = [
      Notifications.addPushTokenListener(() => registerForPush().catch(() => undefined)),
      // Keep the Notifications tab's badge in step when one arrives while the app is open.
      Notifications.addNotificationReceivedListener(() => qc.invalidateQueries({ queryKey: ["notifications"] })),
      Notifications.addNotificationResponseReceivedListener(open),
    ];
    // The app was opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && open(r))
      .catch(() => undefined);
    return () => subs.forEach((s) => s.remove());
  }, [uid, role, qc, navigationRef]);
}
