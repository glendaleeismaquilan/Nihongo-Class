import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../../components/layout/AppShell";
import { NotificationsPage } from "../../pages/common/NotificationsPage";
import { ProfilePage } from "../../pages/common/ProfilePage";
import { AdminDashboard } from "./AdminDashboard";
import { PeoplePage } from "./PeoplePage";
import { SchoolSettingsPage } from "./SchoolSettingsPage";
import { staffClassRoutes } from "../../features/classes/staffRoutes";
import { SchoolReportsPage } from "./SchoolReportsPage";
import { BillingPage } from "./BillingPage";
import { ReceiptPage } from "../../features/payments/ReceiptPage";

export default function SchoolAdminApp() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<AdminDashboard />} />
        {staffClassRoutes("/a/classes")}
        <Route path="reports" element={<SchoolReportsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/receipts/:id" element={<ReceiptPage backTo="/a/billing" backLabel="Billing" />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="settings" element={<SchoolSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/a" replace />} />
      </Route>
    </Routes>
  );
}
