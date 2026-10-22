import type { Role } from "@nihongo/shared";
import type { IconName } from "../ui/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Shown in the bottom tab bar below 768px (four or five per role). */
  tab?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: "/s", label: "Home", icon: "home", end: true, tab: true },
    { to: "/s/classes", label: "Classes", icon: "classes", tab: true },
    { to: "/s/study", label: "Self-study", icon: "study", tab: true },
    { to: "/s/progress", label: "Progress", icon: "chart", tab: true },
    { to: "/s/notifications", label: "Notifications", icon: "bell" },
    { to: "/s/profile", label: "Profile", icon: "user", tab: true },
  ],
  teacher: [
    { to: "/t", label: "Home", icon: "home", end: true, tab: true },
    { to: "/t/classes", label: "Classes", icon: "classes", tab: true },
    { to: "/t/drive", label: "My Drive", icon: "drive", tab: true },
    { to: "/t/premium", label: "Premium", icon: "star", tab: true },
    { to: "/t/notifications", label: "Notifications", icon: "bell" },
    { to: "/t/settings", label: "Settings", icon: "settings" },
  ],
  content_admin: [
    { to: "/c", label: "Library", icon: "library", end: true, tab: true },
    { to: "/c/flashcards", label: "Flashcards", icon: "study", tab: true },
    { to: "/c/quizzes", label: "Quizzes", icon: "check", tab: true },
    { to: "/c/reading-tests", label: "Reading tests", icon: "reading", tab: true },
    { to: "/c/listening-tests", label: "Listening tests", icon: "headphones" },
    { to: "/c/schools", label: "Schools", icon: "school", tab: true },
    { to: "/c/profile", label: "Profile", icon: "user" },
  ],
  school_admin: [
    { to: "/a", label: "Home", icon: "home", end: true, tab: true },
    { to: "/a/classes", label: "Classes", icon: "classes", tab: true },
    { to: "/a/people", label: "People", icon: "users", tab: true },
    { to: "/a/reports", label: "Reports", icon: "chart" },
    { to: "/a/billing", label: "Billing", icon: "payment", tab: true },
    { to: "/a/notifications", label: "Notifications", icon: "bell" },
    { to: "/a/settings", label: "Settings", icon: "settings", tab: true },
  ],
};
