"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function FeatureAccessDenied({
  feature,
  message = "현재 권한으로는 접근할 수 없습니다. 관리자에게 권한을 요청하세요."
}: {
  feature: string;
  message?: string;
}) {
  return (
    <Card className="border-4 border-zinc-900 bg-rose-200 p-4 shadow-[6px_6px_0_0_#18181b] dark:border-zinc-100 dark:bg-rose-950/70 dark:shadow-[6px_6px_0_0_#f4f4f5]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 border-zinc-900 bg-white text-zinc-900 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div>
          <CardTitle className="text-base font-black uppercase tracking-wide text-zinc-900 dark:text-zinc-100">{feature} 접근 불가</CardTitle>
          <CardDescription className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">{message}</CardDescription>
        </div>
      </div>
    </Card>
  );
}
