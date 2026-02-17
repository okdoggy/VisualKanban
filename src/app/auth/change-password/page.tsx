"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const { users, currentUserId, changePassword } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    changePassword: state.changePassword
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  useEffect(() => {
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (!currentUser.mustChangePassword) {
      router.replace("/app/dashboard");
    }
  }, [currentUser, router]);

  if (!currentUser || !currentUser.mustChangePassword) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-100 p-4 dark:bg-zinc-950">
        <Card className="w-full max-w-md p-6">
          <CardTitle>세션 확인 중...</CardTitle>
          <CardDescription className="mt-1">로그인 상태를 확인하고 있습니다.</CardDescription>
        </Card>
      </div>
    );
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const result = changePassword(password);
    if (!result.ok) {
      setError(result.reason ?? "비밀번호 변경에 실패했습니다.");
      return;
    }

    router.push("/app/dashboard");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-100 p-4 dark:bg-zinc-950">
      <Card className="w-full max-w-md p-6">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </div>

        <CardTitle>초기 비밀번호 변경</CardTitle>
        <CardDescription className="mt-1">보안을 위해 최초 로그인 후 비밀번호 변경이 필수입니다.</CardDescription>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <Input type="password" placeholder="새 비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input
            type="password"
            placeholder="새 비밀번호 확인"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <ul className="list-inside list-disc space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <li>8자 이상 입력</li>
            <li>초기 비밀번호(0000) 재사용 불가 권장</li>
            <li>변경 후 Dashboard로 이동</li>
          </ul>

          {error ? <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}

          <Button type="submit" className="w-full">
            변경 후 계속
          </Button>
        </form>
      </Card>
    </div>
  );
}
