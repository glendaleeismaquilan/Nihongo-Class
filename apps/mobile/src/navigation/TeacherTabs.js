import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { TeacherDashboardScreen } from "../screens/teacher/TeacherDashboardScreen";
import { TeacherClassesScreen } from "../screens/teacher/TeacherClassesScreen";
import { STAFF_CLASS_SCREENS } from "./staffClassRoutes";
import { MyDriveScreen } from "../screens/teacher/MyDriveScreen";
import { PremiumScreen } from "../screens/teacher/PremiumScreen";
import { GoogleSettingsScreen } from "../screens/teacher/GoogleSettingsScreen";
import { AboutScreen } from "../screens/common/AboutScreen";
import { PaymentPendingScreen } from "../screens/common/PaymentPendingScreen";
import { MockCheckoutScreen } from "../screens/common/MockCheckoutScreen";
import { ReceiptScreen } from "../screens/common/ReceiptScreen";
import { NotificationsScreen } from "../screens/common/NotificationsScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { colors } from "../styles/theme";

const Tab = createBottomTabNavigator();
const ClassesStack = createNativeStackNavigator();
const BillingStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="GoogleSettings" component={GoogleSettingsScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}
const icon = (ch) => ({ focused, color }) => (<Text style={{ fontSize: 22, color, opacity: focused ? 1 : 0.65 }}>{ch}</Text>);

function ClassesStackNav() {
  return (
    <ClassesStack.Navigator screenOptions={{ headerShown: false }}>
      <ClassesStack.Screen name="TeacherClassesList" component={TeacherClassesScreen} />
      {STAFF_CLASS_SCREENS.map((s) => <ClassesStack.Screen key={s.name} name={s.name} component={s.component} />)}
    </ClassesStack.Navigator>
  );
}

function BillingStackNav() {
  return (
    <BillingStack.Navigator screenOptions={{ headerShown: false }}>
      <BillingStack.Screen name="PremiumHome" component={PremiumScreen} />
      <BillingStack.Screen name="PaymentPending" component={PaymentPendingScreen} />
      <BillingStack.Screen name="MockCheckout" component={MockCheckoutScreen} />
      <BillingStack.Screen name="Receipt" component={ReceiptScreen} />
    </BillingStack.Navigator>
  );
}

function useUnreadBadge() {
  const q = useQuery({ queryKey: ["notifications", "unread"], queryFn: () => api("/notifications/unread-count"), refetchInterval: 60_000, staleTime: 30_000 });
  return q.data?.unread ?? 0;
}

export function TeacherTabs() {
  const unread = useUnreadBadge();
  const { me } = useAuth();
  const premium = !!me?.plan?.premium;
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: premium ? "#b45309" : colors.ai, tabBarInactiveTintColor: colors.ink2 }}>
      <Tab.Screen name="Home" component={TeacherDashboardScreen} options={{ tabBarIcon: icon("🏠") }} />
      <Tab.Screen name="Classes" component={ClassesStackNav} options={{ tabBarIcon: icon("📚") }} />
      <Tab.Screen name="Drive" component={MyDriveScreen} options={{ tabBarIcon: icon("💾") }} />
      <Tab.Screen name="Premium" component={BillingStackNav} options={{ tabBarIcon: icon(premium ? "🌟" : "⭐"), tabBarLabel: premium ? "Premium ✓" : "Premium" }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarIcon: icon("🔔"), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}
