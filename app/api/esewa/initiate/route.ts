import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sessionCookieName, verifySessionToken } from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";
import { createEsewaPayload } from "@/lib/esewa";

type CartItem = {
  id: string;
  quantity: number;
  price: number;
};

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return NextResponse.json({ error: "Please login to proceed with eSewa checkout" }, { status: 401 });
    }

    await ensureUsersTable();
    const sql = getSql();
    const users = (await sql`
      SELECT id FROM app_users WHERE id = ${session.userId} LIMIT 1
    `) as { id: string }[];

    if (!users.length) {
      return NextResponse.json({ error: "Session is invalid. Please login again." }, { status: 401 });
    }

    const body = (await request.json()) as { items?: CartItem[] };

    if (!body.items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const totalAmount = body.items.reduce((sum, item) => {
      if (!Number.isFinite(item.price) || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        return sum;
      }

      return sum + item.price * item.quantity;
    }, 0);

    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Invalid cart total" }, { status: 400 });
    }

    const transactionUuid = randomUUID();
    const createdOrder = (await sql`
      INSERT INTO orders (user_id, amount, payment_status, esewa_transaction_uuid)
      VALUES (${session.userId}, ${totalAmount.toFixed(2)}, 'PENDING', ${transactionUuid})
      RETURNING id
    `) as { id: string }[];

    const order = createdOrder[0];
    if (!order) {
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const payload = createEsewaPayload({
      totalAmount,
      successUrl: `${siteUrl}/?payment=success&orderId=${order.id}`,
      failureUrl: `${siteUrl}/?payment=failed&orderId=${order.id}`,
      transactionUuid,
    });

    return NextResponse.json({
      formUrl: process.env.NEXT_PUBLIC_ESEWA_FORM_URL || "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
      payload,
    });
  } catch {
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}
