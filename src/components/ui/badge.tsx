import { cn } from "@/lib/utils/cn";
import * as React from "react";

const styles = {
  neutral: "bg-zinc-100",
  info: "bg-sky-200",
  success: "bg-lime-200",
  warning: "bg-amber-200",
  danger: "bg-rose-200"
} as const;

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-2 border-zinc-950 px-2.5 py-0.5 text-xs font-bold text-zinc-900 shadow-[2px_2px_0_0_#111827] dark:border-zinc-100 dark:text-zinc-950 dark:shadow-[2px_2px_0_0_rgba(15,23,42,0.95)]",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
