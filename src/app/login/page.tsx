"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("0000");
  const [error, setError] = useState("");

  const { login, users } = useVisualKanbanStore(useShallow((state) => ({
    login: state.login,
    users: state.users
  })));

  const sampleUsers = useMemo(() => users.map((user) => user.username).join(", "), [users]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = login(username, password);
    if (!result.ok) {
      setError(result.reason ?? "로그인에 실패했습니다.");
      return;
    }

    if (result.reason === "MUST_CHANGE_PASSWORD") {
      router.push("/auth/change-password");
      return;
    }
    router.push("/app/dashboard");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-zinc-100 via-white to-zinc-200 p-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <Card className="w-full max-w-md border-zinc-300/70 p-6 shadow-xl dark:border-zinc-800">
        <CardTitle className="text-lg">VisualKanban 로그인</CardTitle>
        <CardDescription className="mt-1">
          사내 계정으로 로그인하세요. 초기 비밀번호 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">0000</code> 사용 시
          다음 단계에서 변경이 강제됩니다.
        </CardDescription>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="space-y-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">계정</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input value={username} onChange={(e) => setUsername(e.target.value)} className="pl-8" required />
            </div>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">비밀번호</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="pl-8" type="password" required />
            </div>
          </label>

          {error ? <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}

          <Button type="submit" className="w-full">
            로그인
          </Button>
        </form>

        <div className="mt-4 rounded-md border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          테스트 계정: {sampleUsers} / 초기 비밀번호: 0000
        </div>
      </Card>
    </div>
  );
}
