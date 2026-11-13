// School Admin navigation, mirroring the web app's /a/* routes: Home (with
// Reports, like the dashboard's "All reports" link), Classes (the class
// workspace shared with teachers — web: staffRoutes), People, Billing,
// Notifications and Profile (with school settings and Google).
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SchoolAdminDashboardScreen } from "../screens/admin/SchoolAdminDashboardScreen";
import { ReportsScreen } from "../screens/admin/ReportsScreen";
import { PeopleScreen } from "../screens/admin/PeopleScreen";
import { SchoolBillingScreen } from "../screens/admin/SchoolBillingScreen";
import { SchoolSettingsScreen } from "../screens/admin/SchoolSettingsScreen";
import { TeacherClassesScreen } from "../screens/teacher/TeacherClassesScreen";
import { GoogleSettingsScreen } from "../screens/teacher/GoogleSettingsScreen";
import { STAFF_CLASS_SCREENS } from "./staffClassRoutes";
import { AboutScreen } from "../screens/common/AboutScreen";
import { PaymentPendingScreen } from "../screens/common/PaymentPendingScreen";
import { MockCheckoutScreen } from "../screens/common/MockCheckoutScreen";
import { ReceiptScreen } from "../screens/common/ReceiptScreen";
import { NotificationsScreen } from "../screens/common/NotificationsScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import { api } from "../lib/api";
import { colors } from "../styles/theme";

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const ClassesStack = createNativeStackNavigator();
const BillingStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const icon = (ch) => ({ focused, color }) => (<Text style={{ fontSize: 22, color, opacity: focused ? 1 : 0.65 }}>{ch}</Text>);

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="AdminHome" component={SchoolAdminDashboardScreen} />
      <HomeStack.Screen name="Reports" component={ReportsScreen} />
    </HomeStack.Navigator>
  );
}

function ClassesStackNav() {
  return (
    <ClassesStack.Navigator screenOptions={{ headerShown: false }}>
      <ClassesStack.Screen name="SchoolClassesList" component={TeacherClassesScreen} />
      {STAFF_CLASS_SCREENS.map((s) => <ClassesStack.Screen key={s.name} name={s.name} component={s.component} />)}
    </ClassesStack.Navigator>
  );
}

function BillingStackNav() {
  return (
    <BillingStack.Navigator screenOptions={{ headerShown: false }}>
      <BillingStack.Screen name="SchoolBillingHome" component={SchoolBillingScreen} />
      <BillingStack.Screen name="PaymentPending" component={PaymentPendingScreen} />
      <BillingStack.Screen name="MockCheckout" component={MockCheckoutScreen} />
      <BillingStack.Screen name="Receipt" component={ReceiptScreen} />
    </BillingStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="SchoolSettings" component={SchoolSettingsScreen} />
      <ProfileStack.Screen name="GoogleSettings" component={GoogleSettingsScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}

function useUnreadBadge() {
  const q = useQuery({ queryKey: ["notifications", "unread"], queryFn: () => api("/notifications/unread-count"), refetchInterval: 60_000, staleTime: 30_000 });
  return q.data?.unread ?? 0;
}

export function SchoolAdminTabs() {
  const unread = useUnreadBadge();
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ai, tabBarInactiveTintColor: colors.ink2 }}>
      <Tab.Screen name="Home" component={HomeStackNav} options={{ tabBarIcon: icon("🏠") }} />
      <Tab.Screen name="Classes" component={ClassesStackNav} options={{ tabBarIcon: icon("📚") }} />
      <Tab.Screen name="People" component={PeopleScreen} options={{ tabBarIcon: icon("👥") }} />
      <Tab.Screen name="Billing" component={BillingStackNav} options={{ tabBarIcon: icon("💳") }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarIcon: icon("🔔"), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}
