import { NextResponse } from "next/server";
import {
  createSessionToken,
  hashPassword,
  isValidEsewaPhone,
  normalizePhone,
  sessionCookieConfig,
} from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";

type RegisterBody = {
  phone?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;
    const phone = normalizePhone(body.phone || "");
    const password = body.password || "";

    if (!isValidEsewaPhone(phone)) {
      return NextResponse.json({ error: "Enter a valid eSewa registered number" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await ensureUsersTable();
    const sql = getSql();

    const existing = (await sql`
      SELECT id FROM app_users WHERE phone = ${phone} LIMIT 1
    `) as { id: string }[];

    if (existing.length) {
      return NextResponse.json({ error: "Number is already registered" }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const inserted = (await sql`
      INSERT INTO app_users (phone, password_hash)
      VALUES (${phone}, ${passwordHash})
      RETURNING id, phone, is_admin
    `) as { id: string; phone: string; is_admin: boolean }[];

    const user = inserted[0];
    const token = createSessionToken(Number(user.id), user.phone);

    const response = NextResponse.json({
      user: { id: Number(user.id), phone: user.phone, isAdmin: user.is_admin },
    });
    response.cookies.set(sessionCookieConfig(token));

    return response;
  } catch {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
