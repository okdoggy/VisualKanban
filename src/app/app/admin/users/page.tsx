"use client";

import { useMemo, useState } from "react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoControl =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

function roleVariant(role: "admin" | "editor" | "viewer") {
  if (role === "admin") return "danger";
  if (role === "editor") return "info";
  return "neutral";
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");

  const { users, currentUserId } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(normalized) ||
        user.displayName.toLowerCase().includes(normalized) ||
        user.baseRole.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  if (!currentUser || currentUser.baseRole !== "admin") {
    return <FeatureAccessDenied feature="Admin Users" message="관리자만 사용자 계정 목록을 확인할 수 있습니다." />;
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Admin · Users"
        description="계정 상태를 검토하고 초기 비밀번호 정책 준수 여부를 빠르게 점검하세요."
        role={currentUser.baseRole}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className={neoCard}>
          <CardTitle>Total Accounts</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{users.length}</p>
        </Card>
        <Card className={neoCard}>
          <CardTitle>Must Change Password</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{users.filter((user) => user.mustChangePassword).length}</p>
        </Card>
        <Card className={neoCard}>
          <CardTitle>Admin Accounts</CardTitle>
          <p className="mt-2 text-2xl font-semibold">{users.filter((user) => user.baseRole === "admin").length}</p>
        </Card>
      </div>

      <Card className={neoCard}>
        <CardTitle>Initial Password Policy Hints</CardTitle>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
          <li>초기 비밀번호는 임시값으로만 사용하고 첫 로그인 직후 즉시 변경</li>
          <li>8자 이상 + 추측 어려운 조합 권장 (숫자/문자 혼합)</li>
          <li>공용 채널에 비밀번호 공유 금지, 개별 안전 채널로 전달</li>
        </ul>
      </Card>

      <Card className={`${neoCard} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Account List</CardTitle>
          <div className="w-full max-w-sm">
            <Input className={neoControl} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름/아이디/권한 검색" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Name</th>
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Username</th>
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Role</th>
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Password State</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id} className="odd:bg-zinc-100/70 dark:odd:bg-zinc-800/40">
                  <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">{user.displayName}</td>
                  <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">{user.username}</td>
                  <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">
                    <Badge variant={roleVariant(user.baseRole)}>{user.baseRole.toUpperCase()}</Badge>
                  </td>
                  <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">
                    <Badge variant={user.mustChangePassword ? "warning" : "success"}>
                      {user.mustChangePassword ? "NEEDS RESET" : "UPDATED"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleUsers.length === 0 ? <p className="p-3 text-sm text-zinc-500">검색 결과가 없습니다.</p> : null}
        </div>
      </Card>
    </section>
  );
}
