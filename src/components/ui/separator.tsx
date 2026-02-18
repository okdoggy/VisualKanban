import { cn } from "@/lib/utils/cn";

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-[3px] w-full rounded-full bg-zinc-900/90 dark:bg-zinc-100", className)} />;
}
