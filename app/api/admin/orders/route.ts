import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";

type OrderRow = {
  id: string;
  amount: string;
  payment_status: string;
  esewa_transaction_uuid: string;
  created_at: string;
  updated_at: string;
  customer_phone: string;
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUsersTable();
    const sql = getSql();

    const admin = (await sql`
      SELECT id FROM app_users WHERE id = ${session.userId} AND is_admin = TRUE LIMIT 1
    `) as { id: string }[];

    if (!admin.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orders = (await sql`
      SELECT
        o.id,
        o.amount,
        o.payment_status,
        o.esewa_transaction_uuid,
        o.created_at,
        o.updated_at,
        u.phone AS customer_phone
      FROM orders o
      INNER JOIN app_users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `) as OrderRow[];

    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
