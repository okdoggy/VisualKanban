import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "neo-inset h-11 w-full px-3 text-sm font-medium text-zinc-900 outline-none transition-[transform,box-shadow,border-color,background-color] duration-100 ease-out placeholder:text-zinc-500 focus-visible:ring-4 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus-visible:ring-cyan-400 dark:focus-visible:ring-offset-zinc-950",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
