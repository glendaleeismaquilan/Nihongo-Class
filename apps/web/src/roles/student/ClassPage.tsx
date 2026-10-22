import { Link, Outlet, useOutletContext, useParams } from "react-router";
import type { ClassDto } from "@nihongo/shared";
import { Alert, ErrorState, Icon, LevelTag, Loading, RouteTabs } from "../../components/ui";
import { useClass } from "../../features/classes/hooks";
import { ActiveCallBanner } from "../../features/calls/ActiveCallBanner";

export interface StudentClassContext {
  cls: ClassDto;
}

export const useStudentClass = () => useOutletContext<StudentClassContext>();

export function ClassPage() {
  const { classId = "" } = useParams();
  const q = useClass(classId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const cls = q.data;
  const base = `/s/classes/${cls.id}`;
  return (
    <>
      <Link to="/s/classes" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        My classes
      </Link>
      <header className="mb-4">
        <h1 className="text-2xl">{cls.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-ink-2">
          <LevelTag level={cls.level} />
          <span>{cls.teachers.map((t) => t.name).join(", ")}</span>
        </div>
      </header>
      {cls.status === "archived" ? (
        <div className="mb-4">
          <Alert>This class is archived. You can still review its lessons and materials.</Alert>
        </div>
      ) : null}
      <RouteTabs
        label="Class sections"
        items={[
          { to: base, label: "Lessons", end: true },
          { to: `${base}/live`, label: "Live classes" },
          { to: `${base}/materials`, label: "Materials" },
        ]}
      />
      {cls.status !== "archived" ? <ActiveCallBanner classId={cls.id} /> : null}
      <Outlet context={{ cls } satisfies StudentClassContext} />
    </>
  );
}
