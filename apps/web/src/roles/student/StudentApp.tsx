import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../../components/layout/AppShell";
import { useMe } from "../../lib/auth";
import { NotificationsPage } from "../../pages/common/NotificationsPage";
import { ProfilePage } from "../../pages/common/ProfilePage";
import { ChooseLevelPage } from "./ChooseLevelPage";
import { StudentDashboard } from "./StudentDashboard";
import { JoinClassPage } from "./JoinClassPage";
import { ClassesPage } from "./ClassesPage";
import { ClassPage } from "./ClassPage";
import { ClassLessonsTab } from "./ClassLessonsTab";
import { SelfStudyPage } from "./study/SelfStudyPage";
import { ClassDeckPage, LibraryDeckPage } from "./study/DeckPages";
import { ActivityPage } from "./study/ActivityPage";
import { ProgressPage } from "./ProgressPage";
import { ClassMaterialsTab } from "./ClassMaterialsTab";
import { ClassLiveTab } from "./ClassLiveTab";

export default function StudentApp() {
  const me = useMe();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={me.studyLevel ? <StudentDashboard /> : <Navigate to="choose-level" replace />} />
        <Route path="choose-level" element={<ChooseLevelPage />} />
        <Route path="join" element={<JoinClassPage />} />
        <Route path="join/:code" element={<JoinClassPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="classes/:classId" element={<ClassPage />}>
          <Route index element={<ClassLessonsTab />} />
          <Route path="live" element={<ClassLiveTab />} />
          <Route path="materials" element={<ClassMaterialsTab />} />
        </Route>
        <Route path="study" element={<SelfStudyPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/s" replace />} />
      </Route>
      {/* §13 focus mode: study screens hide the navigation. */}
      <Route path="study/flashcards" element={<LibraryDeckPage />} />
      <Route path="classes/:classId/lessons/:lessonId/flashcards" element={<ClassDeckPage />} />
      <Route path="activities/:type/:id" element={<ActivityPage />} />
    </Routes>
  );
}
