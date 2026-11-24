import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router";
import { FullPageLoading, HomeRedirect, RequireRole } from "./components/layout/Guard";
import { LoginPage } from "./pages/auth/LoginPage";
import { FinishSignupPage, SignupPage } from "./pages/auth/SignupPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { ConsentPage } from "./pages/auth/ConsentPage";
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";

// §14 Performance: split the bundle by role so students never download admin screens.
const StudentApp = lazy(() => import("./roles/student/StudentApp"));
const TeacherApp = lazy(() => import("./roles/teacher/TeacherApp"));
const ContentAdminApp = lazy(() => import("./roles/content/ContentAdminApp"));
const SchoolAdminApp = lazy(() => import("./roles/admin/SchoolAdminApp"));

function JoinRedirect() {
  const { code } = useParams();
  return <Navigate to={`/s/join/${code ?? ""}`} replace />;
}

// Shared by School Admins (teacher slots) and teachers (Premium), and the in-app call page.
const PaymentReturnPage = lazy(() => import("./features/billing/billing").then((m) => ({ default: m.PaymentReturnPage })));
const MockCheckoutPage = lazy(() => import("./features/billing/billing").then((m) => ({ default: m.MockCheckoutPage })));
const CallPage = lazy(() => import("./features/calls/CallPage").then((m) => ({ default: m.CallPage })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullPageLoading />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/finish" element={<FinishSignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/consent" element={<ConsentPage />} />
          <Route path="/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/join/:code" element={<JoinRedirect />} />
          <Route path="/join" element={<Navigate to="/s/join" replace />} />
          <Route
            path="/payments/:id/return"
            element={
              <RequireRole>
                <PaymentReturnPage />
              </RequireRole>
            }
          />
          <Route
            path="/dev/mock-checkout/:paymentId"
            element={
              <RequireRole>
                <MockCheckoutPage />
              </RequireRole>
            }
          />
          <Route
            path="/call/:callId"
            element={
              <RequireRole>
                <CallPage />
              </RequireRole>
            }
          />
          <Route
            path="/s/*"
            element={
              <RequireRole role="student">
                <StudentApp />
              </RequireRole>
            }
          />
          <Route
            path="/t/*"
            element={
              <RequireRole role="teacher">
                <TeacherApp />
              </RequireRole>
            }
          />
          <Route
            path="/c/*"
            element={
              <RequireRole role="content_admin">
                <ContentAdminApp />
              </RequireRole>
            }
          />
          <Route
            path="/a/*"
            element={
              <RequireRole role="school_admin">
                <SchoolAdminApp />
              </RequireRole>
            }
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
