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
    <Card className="border-rose-200/80 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600" />
        <div>
          <CardTitle>{feature} 접근 불가</CardTitle>
          <CardDescription className="mt-1 text-rose-700 dark:text-rose-300">{message}</CardDescription>
        </div>
      </div>
    </Card>
  );
}
