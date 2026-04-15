import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    await ensureUsersTable();
    const sql = getSql();
    const users = (await sql`
      SELECT id, phone, is_admin FROM app_users WHERE id = ${session.userId} LIMIT 1
    `) as { id: string; phone: string; is_admin: boolean }[];

    const user = users[0];

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: { id: Number(user.id), phone: user.phone, isAdmin: user.is_admin },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
