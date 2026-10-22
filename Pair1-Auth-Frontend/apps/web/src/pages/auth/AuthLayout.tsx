import type { ReactNode } from "react";
import { OfflineBanner } from "../../components/layout/OfflineBanner";

export function AuthLayout({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    // The photo fills the screen, positioned so the pagoda sits in the right half.
    <div className="min-h-dvh bg-[#f7efe2] bg-cover bg-[position:70%_center] bg-no-repeat" style={{ backgroundImage: "url(/auth-background.webp)" }}>
      <OfflineBanner />
      <main className="flex min-h-dvh">
        {/* Frosted glass panel: full height on the left from 1024px, full width below. The photo shows
            through, blurred. 80% white keeps every text color above 4.5:1 even over the darkest parts of
            the photo; without backdrop-filter support it falls back to near-solid white. */}
        <div className="flex w-full flex-col justify-center border-white/70 bg-white/80 px-6 py-10 shadow-[8px_0_32px_rgb(28_36_51/0.25)] backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-white/95 sm:px-12 lg:w-[52%] lg:border-r xl:w-[46%]">
          <div className={`mx-auto w-full ${wide ? "max-w-xl" : "max-w-md"}`}>
            <img src="/logo-256.webp" alt="Nihongo Class, 日本語クラス" width={160} height={160} className="mx-auto mb-5" />
            <h1 className="mb-8 text-center text-2xl">{title}</h1>
            {children}
          </div>
        </div>
        {/* The right side is left clear so the photo shows. */}
        <div aria-hidden="true" className="hidden flex-1 lg:block" />
      </main>
    </div>
  );
}

/** RA 10173 privacy notice shown at sign-up and first login (§14 Privacy). */
export function PrivacyNotice() {
  return (
    <div className="rounded-paper border border-line bg-kasumi px-4 py-3 text-sm text-ink">
      <p className="font-medium">Privacy notice</p>
      <p className="mt-1">
        Under the Data Privacy Act of 2012 (RA 10173), we collect your name, email address, study level, time zone, quiz and test results, and class attendance.
        We use them to run your classes and track your progress. Classes are free; for teachers and School Admins we also keep records of Premium and teacher-slot
        payments.
      </p>
      <p className="mt-1">
        We share them only with your school's staff, with PayMongo when a teacher or school pays online, and with Google when a teacher sends calendar invites for
        live classes. In-app video calls go directly between the people in the call and aren't recorded. We don't collect birthdays, home addresses, or ID numbers.
      </p>
    </div>
  );
}
