import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  role,
  actions
}: {
  title: string;
  description?: string;
  role?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {role ? <Badge variant="info">Role: {role}</Badge> : null}
        </div>
        {description ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}
