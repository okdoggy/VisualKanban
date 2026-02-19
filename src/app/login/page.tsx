"use client";

import { useId, useMemo, useState } from "react";
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
  const [registrationCandidate, setRegistrationCandidate] = useState<{ username: string; password: string } | null>(null);
  const [showPartModal, setShowPartModal] = useState(false);
  const [partDraft, setPartDraft] = useState("");
  const [partError, setPartError] = useState("");
  const partSuggestionsId = useId();

  const { login, registerUserFromLogin, users } = useVisualKanbanStore(
    useShallow((state) => ({
      login: state.login,
      registerUserFromLogin: state.registerUserFromLogin,
      users: state.users
    }))
  );

  const knownParts = useMemo(
    () =>
      [...new Set(users.map((user) => user.part?.trim()).filter((part): part is string => Boolean(part)))]
        .sort((left, right) => left.localeCompare(right)),
    [users]
  );

  const handleSuccessRedirect = (reason?: string) => {
    if (reason === "MUST_CHANGE_PASSWORD") {
      router.push("/auth/change-password");
      return;
    }
    router.push("/app/dashboard");
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = login(username, password);
    if (!result.ok) {
      const normalizedUsername = username.trim();
      const accountExists = users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase());
      const shouldOfferSignup = normalizedUsername.length > 0 && password === "0000" && !accountExists;
      if (shouldOfferSignup) {
        setError("");
        setPartDraft("");
        setPartError("");
        setShowPartModal(false);
        setRegistrationCandidate({ username: normalizedUsername, password });
        return;
      }

      setRegistrationCandidate(null);
      setShowPartModal(false);
      setError(result.reason ?? "로그인에 실패했습니다.");
      return;
    }

    setError("");
    setRegistrationCandidate(null);
    setShowPartModal(false);
    handleSuccessRedirect(result.reason);
  };

  const openPartModal = () => {
    setPartDraft("");
    setPartError("");
    setShowPartModal(true);
  };

  const closeRegistrationFlow = () => {
    setRegistrationCandidate(null);
    setShowPartModal(false);
    setPartDraft("");
    setPartError("");
  };

  const handleCreateAccount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!registrationCandidate) return;

    const normalizedPart = partDraft.trim();
    if (!normalizedPart) {
      setPartError("파트를 입력해 주세요.");
      return;
    }

    const result = registerUserFromLogin({
      username: registrationCandidate.username,
      password: registrationCandidate.password,
      part: normalizedPart
    });
    if (!result.ok) {
      setPartError(result.reason ?? "계정을 생성하지 못했습니다.");
      return;
    }

    closeRegistrationFlow();
    setError("");
    handleSuccessRedirect(result.reason);
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
      </Card>

      {registrationCandidate && !showPartModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/55 px-4 pt-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeRegistrationFlow();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="self-register-confirm-title"
            className="w-full max-w-md border-4 border-zinc-900 bg-amber-100 p-4 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]"
          >
            <h2 id="self-register-confirm-title" className="text-sm font-black uppercase tracking-[0.16em] text-zinc-900 dark:text-zinc-100">
              신규 계정 생성
            </h2>
            <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span className="font-black text-zinc-900 dark:text-zinc-100">@{registrationCandidate.username}</span> 계정이 없습니다. 새 계정을
              생성할까요?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeRegistrationFlow}
                className="h-10 rounded-none border-2 border-zinc-900 text-xs font-black uppercase tracking-[0.1em] dark:border-zinc-100"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={openPartModal}
                className="h-10 rounded-none border-2 border-zinc-900 bg-lime-300 text-xs font-black uppercase tracking-[0.1em] text-zinc-900 shadow-[4px_4px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5] dark:hover:shadow-[3px_3px_0_0_#f4f4f5]"
              >
                생성하기
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {registrationCandidate && showPartModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/55 px-4 pt-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeRegistrationFlow();
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="self-register-part-title"
            className="w-full max-w-md border-4 border-zinc-900 bg-amber-100 p-4 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]"
            onSubmit={handleCreateAccount}
          >
            <h2 id="self-register-part-title" className="text-sm font-black uppercase tracking-[0.16em] text-zinc-900 dark:text-zinc-100">
              파트 입력
            </h2>
            <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              계정 생성 전 소속 파트를 입력해 주세요. (예: 제품개발팀, 디자인셀)
            </p>

            <label className="mt-4 block space-y-1.5 text-sm">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">파트</span>
              <Input
                list={partSuggestionsId}
                value={partDraft}
                onChange={(event) => {
                  setPartDraft(event.target.value);
                  if (partError) {
                    setPartError("");
                  }
                }}
                className="h-11 rounded-none border-2 border-zinc-900 bg-white font-semibold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="소속 파트를 입력해 주세요"
                autoFocus
              />
              <datalist id={partSuggestionsId}>
                {knownParts.map((part) => (
                  <option key={part} value={part} />
                ))}
              </datalist>
            </label>

            {partError ? (
              <p className="mt-3 border-2 border-zinc-900 bg-rose-300 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-rose-950/70 dark:text-zinc-100 dark:shadow-[3px_3px_0_0_#f4f4f5]">
                {partError}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeRegistrationFlow}
                className="h-10 rounded-none border-2 border-zinc-900 text-xs font-black uppercase tracking-[0.1em] dark:border-zinc-100"
              >
                취소
              </Button>
              <Button
                type="submit"
                className="h-10 rounded-none border-2 border-zinc-900 bg-lime-300 text-xs font-black uppercase tracking-[0.1em] text-zinc-900 shadow-[4px_4px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5] dark:hover:shadow-[3px_3px_0_0_#f4f4f5]"
              >
                계정 생성
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
