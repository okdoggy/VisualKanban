import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("vk_user")?.value;

  return NextResponse.json({
    authenticated: Boolean(userId),
    userId: userId ?? null,
    checkedAt: new Date().toISOString()
  });
}
