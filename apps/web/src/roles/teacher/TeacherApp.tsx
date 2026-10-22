import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../../components/layout/AppShell";
import { NotificationsPage } from "../../pages/common/NotificationsPage";
import { TeacherDashboard } from "./TeacherDashboard";
import { TeacherSettingsPage } from "./TeacherSettingsPage";
import { staffClassRoutes } from "../../features/classes/staffRoutes";
import { ReceiptPage } from "../../features/payments/ReceiptPage";
import { DrivePage } from "./DrivePage";
import { PremiumPage } from "./PremiumPage";

export default function TeacherApp() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TeacherDashboard />} />
        {staffClassRoutes("/t/classes")}
        <Route path="drive" element={<DrivePage />} />
        <Route path="premium" element={<PremiumPage />} />
        <Route path="premium/receipts/:id" element={<ReceiptPage backTo="/t/premium" backLabel="Premium" />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<TeacherSettingsPage />} />
        <Route path="*" element={<Navigate to="/t" replace />} />
      </Route>
    </Routes>
  );
}
