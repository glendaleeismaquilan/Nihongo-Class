// The class workspace screens shared by teachers and School Admins — the mobile
// counterpart of apps/web/src/features/classes/staffRoutes.tsx. TeacherTabs and
// SchoolAdminTabs both register these in their Classes stack (after the shared
// class list, TeacherClassesScreen), so a class opens the same way for both
// roles; each screen adapts to me.role where web does.
import { CreateClassScreen } from "../screens/admin/CreateClassScreen";
import { TeacherClassDetailScreen } from "../screens/teacher/TeacherClassDetailScreen";
import { LessonDetailScreen } from "../screens/teacher/LessonDetailScreen";
import { FlashcardEditorScreen } from "../screens/teacher/editors/FlashcardEditorScreen";
import { QuizEditorScreen } from "../screens/teacher/editors/QuizEditorScreen";
import { ContentImportScreen } from "../screens/teacher/editors/ContentImportScreen";
import { MaterialEditorScreen } from "../screens/teacher/editors/MaterialEditorScreen";
import { MaterialViewsScreen } from "../screens/teacher/MaterialViewsScreen";
import { SessionEditorScreen } from "../screens/teacher/editors/SessionEditorScreen";
import { AttendanceScreen } from "../screens/teacher/AttendanceScreen";
import { CallScreen } from "../screens/common/CallScreen";

export const STAFF_CLASS_SCREENS = [
  // web: Create class dialog on classes/
  { name: "CreateClass", component: CreateClassScreen },
  // web: classes/:classId (+ live, materials, roster, reports, settings tabs) — params { classId, tab? }
  { name: "TeacherClassDetail", component: TeacherClassDetailScreen },
  // web: the selected lesson's flashcards and quizzes — params { classId, lessonId }
  { name: "LessonDetail", component: LessonDetailScreen },
  // web: FlashcardDialog — params { classId, lessonId, card? }
  { name: "FlashcardEditor", component: FlashcardEditorScreen },
  // web: classes/:classId/quizzes/new and quizzes/:quizId — params { classId, quizId?, lessonId? }
  { name: "QuizEditor", component: QuizEditorScreen },
  // web: TeacherImportDialog — params { classId, lessonId, kind: "flashcards" | "quiz" }
  { name: "ContentImport", component: ContentImportScreen },
  // web: classes/:classId/materials/:materialId — params { classId, materialId }
  { name: "MaterialEditor", component: MaterialEditorScreen },
  // web: the materials tab's "Opened by" dialog — params { materialId, title }
  { name: "MaterialViews", component: MaterialViewsScreen },
  // web: SessionDialog — params { classId, session? }
  { name: "SessionEditor", component: SessionEditorScreen },
  // web: classes/:classId/live/:sessionId — params { classId, sessionId }
  { name: "Attendance", component: AttendanceScreen },
  // web: /call/:callId — params { callId }
  { name: "Call", component: CallScreen },
];
