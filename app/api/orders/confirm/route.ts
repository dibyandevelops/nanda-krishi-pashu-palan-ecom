import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";

type ConfirmBody = {
  orderId?: number;
  payment?: "success" | "failed";
};

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ConfirmBody;
    const orderId = Number(body.orderId);
    const payment = body.payment;

    if (!Number.isFinite(orderId) || orderId <= 0 || (payment !== "success" && payment !== "failed")) {
      return NextResponse.json({ error: "Invalid payment confirmation" }, { status: 400 });
    }

    await ensureUsersTable();
    const sql = getSql();

    const targetStatus = payment === "success" ? "PAID" : "FAILED";
    const updated = (await sql`
      UPDATE orders
      SET payment_status = ${targetStatus}, updated_at = NOW()
      WHERE id = ${orderId} AND user_id = ${session.userId}
      RETURNING id, payment_status
    `) as { id: string; payment_status: string }[];

    if (!updated.length) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order: updated[0] });
  } catch {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
}
