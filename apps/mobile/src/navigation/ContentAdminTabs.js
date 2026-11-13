// Content Admin tabs, mirroring apps/web/src/roles/content/ContentAdminApp.tsx:
// the built-in library (overview, the four lists, editors, Excel import and its
// review), Schools, and Profile. The web app has no notifications page for
// Content Admins, so there is no Notifications tab here either.
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { LibraryOverviewScreen } from "../screens/content/LibraryOverviewScreen";
import { LibraryListScreen } from "../screens/content/LibraryListScreen";
import {
  LibraryFlashcardEditorScreen,
  LibraryQuizEditorScreen,
  LibraryReadingEditorScreen,
  LibraryListeningEditorScreen,
} from "../screens/content/LibraryEditorScreens";
import { LibraryImportScreen } from "../screens/content/LibraryImportScreen";
import { ImportReviewScreen } from "../screens/content/ImportReviewScreen";
import { SchoolsScreen } from "../screens/content/SchoolsScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import { AboutScreen } from "../screens/common/AboutScreen";
import { colors } from "../styles/theme";

const Tab = createBottomTabNavigator();
const LibraryStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const icon = (ch) => ({ focused, color }) => (<Text style={{ fontSize: 22, color, opacity: focused ? 1 : 0.65 }}>{ch}</Text>);

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}

function LibraryStackNav() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="LibraryOverview" component={LibraryOverviewScreen} />
      <LibraryStack.Screen name="LibraryList" component={LibraryListScreen} />
      <LibraryStack.Screen name="LibraryFlashcardEditor" component={LibraryFlashcardEditorScreen} />
      <LibraryStack.Screen name="LibraryQuizEditor" component={LibraryQuizEditorScreen} />
      <LibraryStack.Screen name="LibraryReadingEditor" component={LibraryReadingEditorScreen} />
      <LibraryStack.Screen name="LibraryListeningEditor" component={LibraryListeningEditorScreen} />
      <LibraryStack.Screen name="LibraryImport" component={LibraryImportScreen} />
      <LibraryStack.Screen name="LibraryImportReview" component={ImportReviewScreen} />
    </LibraryStack.Navigator>
  );
}

export function ContentAdminTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ai, tabBarInactiveTintColor: colors.ink2 }}>
      <Tab.Screen name="Library" component={LibraryStackNav} options={{ tabBarIcon: icon("📚") }} />
      <Tab.Screen name="Schools" component={SchoolsScreen} options={{ tabBarIcon: icon("🏫") }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}
