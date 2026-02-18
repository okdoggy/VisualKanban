"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "neo-pressable inline-flex items-center justify-center gap-2 rounded-[0.8rem] border-[3px] border-zinc-950 text-sm font-semibold text-zinc-950 shadow-[4px_4px_0_0_#111827] transition-[transform,box-shadow,background-color,border-color,color] duration-100 ease-out hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_#111827] disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-100 dark:text-zinc-100 dark:shadow-[4px_4px_0_0_rgba(15,23,42,0.92)] dark:hover:shadow-[5px_5px_0_0_rgba(15,23,42,0.96)] dark:focus-visible:ring-cyan-400 dark:focus-visible:ring-offset-zinc-950",
  {
    variants: {
      variant: {
        default: "bg-yellow-300 hover:bg-yellow-200 dark:bg-yellow-300 dark:text-zinc-950 dark:hover:bg-yellow-200",
        secondary: "bg-sky-300 hover:bg-sky-200 dark:bg-sky-300 dark:text-zinc-950 dark:hover:bg-sky-200",
        outline: "bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        ghost:
          "border-transparent bg-transparent text-zinc-800 shadow-none hover:border-zinc-950 hover:bg-lime-200 hover:shadow-[3px_3px_0_0_#111827] dark:text-zinc-100 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 dark:hover:shadow-[3px_3px_0_0_rgba(15,23,42,0.95)]",
        danger: "bg-rose-400 hover:bg-rose-300 dark:bg-rose-400 dark:text-zinc-950 dark:hover:bg-rose-300"
      },
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-11 px-5 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
