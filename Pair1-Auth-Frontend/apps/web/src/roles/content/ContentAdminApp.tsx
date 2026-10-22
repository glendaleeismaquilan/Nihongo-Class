import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../../components/layout/AppShell";
import { ProfilePage } from "../../pages/common/ProfilePage";
import { LibraryOverviewPage } from "./LibraryOverviewPage";
import { LibraryListPage } from "./LibraryListPage";
import { BuiltinFlashcardEditor, BuiltinQuizEditor, ListeningTestEditor, ReadingTestEditor } from "./LibraryEditors";
import { ImportReviewPage } from "./ImportReviewPage";
import { SchoolsPage } from "./SchoolsPage";

export default function ContentAdminApp() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LibraryOverviewPage />} />
        <Route path="flashcards" element={<LibraryListPage key="flashcards" type="flashcards" />} />
        <Route path="flashcards/new" element={<BuiltinFlashcardEditor key="new" />} />
        <Route path="flashcards/:id" element={<BuiltinFlashcardEditor />} />
        <Route path="quizzes" element={<LibraryListPage key="quizzes" type="quizzes" />} />
        <Route path="quizzes/new" element={<BuiltinQuizEditor key="new" />} />
        <Route path="quizzes/:id" element={<BuiltinQuizEditor />} />
        <Route path="reading-tests" element={<LibraryListPage key="reading" type="reading-tests" />} />
        <Route path="reading-tests/new" element={<ReadingTestEditor key="new" />} />
        <Route path="reading-tests/:id" element={<ReadingTestEditor />} />
        <Route path="listening-tests" element={<LibraryListPage key="listening" type="listening-tests" />} />
        <Route path="listening-tests/new" element={<ListeningTestEditor key="new" />} />
        <Route path="listening-tests/:id" element={<ListeningTestEditor />} />
        <Route path="imports/:type/:batchId" element={<ImportReviewPage />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/c" replace />} />
      </Route>
    </Routes>
  );
}
