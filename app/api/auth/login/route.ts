import { NextResponse } from "next/server";
import {
  createSessionToken,
  isValidEsewaPhone,
  normalizePhone,
  sessionCookieConfig,
  verifyPassword,
} from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";

type LoginBody = {
  phone?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const phone = normalizePhone(body.phone || "");
    const password = body.password || "";

    if (!isValidEsewaPhone(phone) || !password) {
      return NextResponse.json({ error: "Invalid phone or password" }, { status: 400 });
    }

    await ensureUsersTable();
    const sql = getSql();

    const users = (await sql`
      SELECT id, phone, password_hash, is_admin
      FROM app_users
      WHERE phone = ${phone}
      LIMIT 1
    `) as { id: string; phone: string; password_hash: string; is_admin: boolean }[];

    const user = users[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid phone or password" }, { status: 401 });
    }

    const token = createSessionToken(Number(user.id), user.phone);
    const response = NextResponse.json({
      user: { id: Number(user.id), phone: user.phone, isAdmin: user.is_admin },
    });
    response.cookies.set(sessionCookieConfig(token));

    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
