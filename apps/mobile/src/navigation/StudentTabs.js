// Bottom tabs for a student. Icons are emoji for now to avoid pulling in @expo/vector-icons.
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { StudentDashboardScreen } from "../screens/student/StudentDashboardScreen";
import { ClassesScreen } from "../screens/student/ClassesScreen";
import { ClassDetailScreen } from "../screens/student/ClassDetailScreen";
import { JoinClassScreen } from "../screens/student/JoinClassScreen";
import { ProgressScreen } from "../screens/student/ProgressScreen";
import { SelfStudyScreen } from "../screens/student/SelfStudyScreen";
import { FlashcardPlayerScreen } from "../screens/student/study/FlashcardPlayerScreen";
import { QuizPlayerScreen } from "../screens/student/study/QuizPlayerScreen";
import { ResultsScreen } from "../screens/student/study/ResultsScreen";
import { PracticeWrongScreen } from "../screens/student/study/PracticeWrongScreen";
import { PomodoroScreen } from "../screens/student/PomodoroScreen";
import { KanaReferenceScreen } from "../screens/student/KanaReferenceScreen";
import { CallScreen } from "../screens/common/CallScreen";
import { AboutScreen } from "../screens/common/AboutScreen";
import { NotificationsScreen } from "../screens/common/NotificationsScreen";
import { ProfileScreen } from "../screens/common/ProfileScreen";
import { api } from "../lib/api";
import { colors } from "../styles/theme";

const Tab = createBottomTabNavigator();
const ClassesStack = createNativeStackNavigator();

// Classes tab with an inner stack so students can navigate from the list into a class.
function ClassesStackNav() {
  return (
    <ClassesStack.Navigator screenOptions={{ headerShown: false }}>
      <ClassesStack.Screen name="ClassesList" component={ClassesScreen} />
      <ClassesStack.Screen name="JoinClass" component={JoinClassScreen} />
      <ClassesStack.Screen name="ClassDetail" component={ClassDetailScreen} />
      <ClassesStack.Screen name="Flashcards" component={FlashcardPlayerScreen} />
      <ClassesStack.Screen name="Quiz" component={QuizPlayerScreen} />
      <ClassesStack.Screen name="Results" component={ResultsScreen} />
      <ClassesStack.Screen name="PracticeWrong" component={PracticeWrongScreen} />
      <ClassesStack.Screen name="Call" component={CallScreen} />
    </ClassesStack.Navigator>
  );
}

// Study tab with an inner stack: Self-Study lists the built-in decks and activities
// (paged in place, like the web), and they open in the same player stack.
const StudyStack = createNativeStackNavigator();
function StudyStackNav() {
  return (
    <StudyStack.Navigator screenOptions={{ headerShown: false }}>
      <StudyStack.Screen name="StudyOverview" component={SelfStudyScreen} />
      <StudyStack.Screen name="Flashcards" component={FlashcardPlayerScreen} />
      <StudyStack.Screen name="Quiz" component={QuizPlayerScreen} />
      <StudyStack.Screen name="Results" component={ResultsScreen} />
      <StudyStack.Screen name="PracticeWrong" component={PracticeWrongScreen} />
      <StudyStack.Screen name="Pomodoro" component={PomodoroScreen} />
      <StudyStack.Screen name="KanaReference" component={KanaReferenceScreen} />
    </StudyStack.Navigator>
  );
}

const ProfileStack = createNativeStackNavigator();
function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}

function useUnreadBadge() {
  const q = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api("/notifications/unread-count"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return q.data?.unread ?? 0;
}

const icon = (ch) => ({ focused, color }) => (
  <Text style={{ fontSize: 22, color, opacity: focused ? 1 : 0.65 }}>{ch}</Text>
);

export function StudentTabs() {
  const unread = useUnreadBadge();
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ai, tabBarInactiveTintColor: colors.ink2 }}>
      <Tab.Screen name="Home" component={StudentDashboardScreen} options={{ tabBarIcon: icon("🏠") }} />
      <Tab.Screen name="Classes" component={ClassesStackNav} options={{ tabBarIcon: icon("📚") }} />
      <Tab.Screen name="Study" component={StudyStackNav} options={{ tabBarIcon: icon("📖") }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarIcon: icon("📊") }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarIcon: icon("🔔"), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tab.Screen name="Profile" component={ProfileStackNav} options={{ tabBarIcon: icon("👤") }} />
    </Tab.Navigator>
  );
}
