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
    <div className="grid min-h-screen place-items-center bg-zinc-100 p-4 dark:bg-zinc-950">
      <Card className="w-full max-w-md border-4 border-zinc-900 bg-amber-100 p-6 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-700 dark:text-zinc-300">Auth Gateway</p>
        <CardTitle className="mt-1 text-lg font-black uppercase tracking-wide text-zinc-900 dark:text-zinc-100">VisualKanban 로그인</CardTitle>
        <CardDescription className="mt-1 font-medium text-zinc-700 dark:text-zinc-300">
          사내 계정으로 로그인하세요. 초기 비밀번호 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">0000</code> 사용 시
          다음 단계에서 변경이 강제됩니다.
        </CardDescription>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="space-y-1.5 text-sm">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">계정</span>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 rounded-none border-2 border-zinc-900 bg-white pl-9 font-semibold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
                required
              />
            </div>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">비밀번호</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-none border-2 border-zinc-900 bg-white pl-9 font-semibold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
                type="password"
                required
              />
            </div>
          </label>

          {error ? (
            <p className="border-2 border-zinc-900 bg-rose-300 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-rose-950/70 dark:text-zinc-100 dark:shadow-[3px_3px_0_0_#f4f4f5]">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="h-11 w-full rounded-none border-2 border-zinc-900 bg-lime-300 font-black uppercase tracking-[0.14em] text-zinc-900 shadow-[4px_4px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5] dark:hover:shadow-[3px_3px_0_0_#f4f4f5]"
          >
            로그인
          </Button>
        </form>

        <div className="mt-4 border-2 border-zinc-900 bg-white p-3 text-xs font-medium text-zinc-700 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-300">
          테스트 계정: {sampleUsers} / 초기 비밀번호: 0000
        </div>
      </Card>
    </div>
  );
}
