import type { User } from "@/lib/types";

export type UserOption = {
  id: string;
  label: string;
  secondaryLabel?: string;
};

export function getKnownParts(users: User[]) {
  return [...new Set(users.map((user) => user.part?.trim()).filter((part): part is string => Boolean(part)))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function getUsersById(users: User[]) {
  return new Map(users.map((user) => [user.id, user]));
}

export function mapUsersToOptions(users: User[]): UserOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.displayName,
    secondaryLabel: `@${user.username}`
  }));
}
