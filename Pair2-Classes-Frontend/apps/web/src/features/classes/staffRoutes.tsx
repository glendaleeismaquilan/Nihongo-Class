import { Route } from "react-router";
import { ClassListPage } from "./ClassListPage";
import { ClassWorkspace } from "./ClassWorkspace";
import { LessonsTab } from "./LessonsTab";
import { QuizEditorPage } from "./QuizEditorPage";
import { RosterTab } from "./RosterTab";
import { ClassSettingsTab } from "./ClassSettingsTab";
import { ReportsTab } from "./ReportsTab";
import { StaffMaterialsTab } from "../materials/StaffMaterialsTab";
import { MaterialEditorPage } from "../materials/MaterialEditorPage";
import { StaffLiveTab } from "../live/StaffLiveTab";
import { AttendancePage } from "../live/AttendancePage";

/** Class screens shared by Teachers (own classes) and School Admins (their school). */
export function staffClassRoutes(basePath: string) {
  return (
    <>
      <Route path="classes" element={<ClassListPage basePath={basePath} />} />
      <Route path="classes/:classId" element={<ClassWorkspace basePath={basePath} />}>
        <Route index element={<LessonsTab />} />
        <Route path="quizzes/new" element={<QuizEditorPage />} />
        <Route path="quizzes/:quizId" element={<QuizEditorPage />} />
        <Route path="roster" element={<RosterTab />} />
        <Route path="settings" element={<ClassSettingsTab />} />
        <Route path="live" element={<StaffLiveTab />} />
        <Route path="live/:sessionId" element={<AttendancePage />} />
        <Route path="materials" element={<StaffMaterialsTab />} />
        <Route path="materials/:materialId" element={<MaterialEditorPage />} />
        <Route path="reports" element={<ReportsTab />} />
      </Route>
    </>
  );
}
