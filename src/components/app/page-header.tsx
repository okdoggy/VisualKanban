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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-4 border-zinc-900 bg-lime-200 px-4 py-3 shadow-[6px_6px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[6px_6px_0_0_#f4f4f5]">
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 dark:text-zinc-300">Section</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-black uppercase tracking-wide text-zinc-900 dark:text-zinc-100">{title}</h1>
          {role ? (
            <Badge
              variant="info"
              className="rounded-none border-2 border-zinc-900 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
            >
              Role: {role}
            </Badge>
          ) : null}
        </div>
        {description ? <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div> : null}
    </header>
  );
}
