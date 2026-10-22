import { Link } from "react-router";
import { Badge, ButtonLink, EmptyState, ErrorState, LevelTag, Loading, PageHeader, Panel, levelStripe } from "../../components/ui";
import { useClasses } from "../../features/classes/hooks";

export function ClassesPage() {
  const q = useClasses();
  return (
    <>
      <PageHeader
        title="My classes"
        actions={
          <ButtonLink to="/s/join" icon="plus">
            Join a class
          </ButtonLink>
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState action={<ButtonLink to="/s/join">Join a class</ButtonLink>}>You aren't in a class yet. Enter the code from your teacher to join one, or keep studying in Self-Study.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {q.data.map((c) => (
            <Panel as="li" key={c.id} className={`px-4 py-4 ${levelStripe(c.level)}`}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/s/classes/${c.id}`} className="text-lg font-semibold">
                  {c.name}
                </Link>
                <LevelTag level={c.level} />
              </div>
              <p className="mt-1 text-ink-2">{c.teachers.map((t) => t.name).join(", ")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.status === "archived" ? <Badge>Archived</Badge> : null}
              </div>
            </Panel>
          ))}
        </ul>
      )}
    </>
  );
}
