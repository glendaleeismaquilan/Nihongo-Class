import { ProfilePage } from "../../pages/common/ProfilePage";
import { GoogleConnectionCard } from "../../features/live/GoogleConnectionCard";

export function TeacherSettingsPage() {
  return (
    <ProfilePage>
      <GoogleConnectionCard />
    </ProfilePage>
  );
}
