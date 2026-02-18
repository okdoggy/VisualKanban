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
        <Card className="w-full max-w-md border-4 border-zinc-900 bg-amber-100 p-6 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]">
          <CardTitle className="font-black uppercase tracking-wide text-zinc-900 dark:text-zinc-100">세션 확인 중...</CardTitle>
          <CardDescription className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">로그인 상태를 확인하고 있습니다.</CardDescription>
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
      <Card className="w-full max-w-md border-4 border-zinc-900 bg-amber-100 p-6 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-700 dark:text-zinc-300">Auth Gateway</p>
        <div className="mb-3 mt-2 inline-flex h-10 w-10 items-center justify-center border-2 border-zinc-900 bg-lime-300 text-zinc-900 dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950">
          <ShieldCheck className="h-5 w-5" />
        </div>

        <CardTitle className="font-black uppercase tracking-wide text-zinc-900 dark:text-zinc-100">초기 비밀번호 변경</CardTitle>
        <CardDescription className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">
          보안을 위해 최초 로그인 후 비밀번호 변경이 필수입니다.
        </CardDescription>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <Input
            type="password"
            placeholder="새 비밀번호 (8자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-none border-2 border-zinc-900 bg-white font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-400"
            required
          />
          <Input
            type="password"
            placeholder="새 비밀번호 확인"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 rounded-none border-2 border-zinc-900 bg-white font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-400"
            required
          />

          <ul className="list-inside list-disc space-y-1 border-2 border-zinc-900 bg-white p-3 text-xs font-medium text-zinc-700 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-300">
            <li>8자 이상 입력</li>
            <li>초기 비밀번호(0000) 재사용 불가 권장</li>
            <li>변경 후 Dashboard로 이동</li>
          </ul>

          {error ? (
            <p className="border-2 border-zinc-900 bg-rose-300 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-rose-950/70 dark:text-zinc-100 dark:shadow-[3px_3px_0_0_#f4f4f5]">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-11 w-full rounded-none border-2 border-zinc-900 bg-lime-300 font-black uppercase tracking-[0.12em] text-zinc-900 shadow-[4px_4px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5] dark:hover:shadow-[3px_3px_0_0_#f4f4f5]"
          >
            변경 후 계속
          </Button>
        </form>
      </Card>
    </div>
  );
}
