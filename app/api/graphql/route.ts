import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { buildSchema, graphql } from "graphql";
import {
  clearSessionCookieConfig,
  createSessionToken,
  hashPassword,
  isValidEsewaPhone,
  normalizePhone,
  sessionCookieName,
  sessionCookieConfig,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";
import { ensureUsersTable, getSql } from "@/lib/db";
import { createEsewaPayload, verifyEsewaTransaction } from "@/lib/esewa";

const schema = buildSchema(`
  type User {
    id: ID!
    phone: String!
    isAdmin: Boolean!
    defaultDeliveryAddress: String
    defaultDeliveryLat: Float
    defaultDeliveryLng: Float
  }

  type Order {
    id: ID!
    userId: ID!
    amount: Float!
    paymentStatus: String!
    orderStatus: String!
    esewaTransactionUuid: String!
    deliveryAddress: String!
    deliveryLat: Float!
    deliveryLng: Float!
    deliveryDate: String!
    itemsJson: String!
    customerPhone: String
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    ok: Boolean!
    message: String!
    user: User
  }

  type MutationStatus {
    ok: Boolean!
    message: String!
  }

  type EsewaPaymentInit {
    formUrl: String!
    amount: String!
    tax_amount: String!
    total_amount: String!
    transaction_uuid: String!
    product_code: String!
    product_service_charge: String!
    product_delivery_charge: String!
    success_url: String!
    failure_url: String!
    signed_field_names: String!
    signature: String!
  }

  input CartItemInput {
    id: String!
    name: String!
    quantity: Int!
    price: Float!
  }

  input CreateOrderInput {
    items: [CartItemInput!]!
    deliveryAddress: String!
    deliveryLat: Float!
    deliveryLng: Float!
    deliveryDate: String!
    saveAsDefaultLocation: Boolean!
  }

  type Query {
    me: User
    myOrders: [Order!]!
    ordersByIds(ids: [ID!]!): [Order!]!
    adminOrders: [Order!]!
  }

  type Mutation {
    register(phone: String!, password: String!): AuthPayload!
    login(phone: String!, password: String!): AuthPayload!
    logout: MutationStatus!
    createOrder(input: CreateOrderInput!): Order!
    deleteOrder(orderId: ID!): MutationStatus!
    updateOrderDelivery(
      orderId: ID!
      deliveryAddress: String!
      deliveryLat: Float!
      deliveryLng: Float!
      deliveryDate: String!
      saveAsDefaultLocation: Boolean!
    ): Order!
    createEsewaPayment(orderId: ID!): EsewaPaymentInit!
    confirmOrderPayment(
      orderId: ID!
      payment: String!
      transactionUuid: String
      callbackStatus: String
      callbackTotalAmount: String
    ): MutationStatus!
  }
`);

type DbUser = {
  id: string;
  phone: string;
  password_hash: string;
  is_admin: boolean;
  default_delivery_address: string | null;
  default_delivery_lat: string | null;
  default_delivery_lng: string | null;
};

type DbOrder = {
  id: string;
  user_id: string;
  amount: string;
  payment_status: string;
  order_status: string;
  esewa_transaction_uuid: string;
  delivery_address: string;
  delivery_lat: string;
  delivery_lng: string;
  delivery_date: string;
  items_json: unknown;
  customer_phone?: string;
  created_at: string;
  updated_at: string;
};

type Context = {
  user: DbUser | null;
  setSessionToken?: string;
  clearSession?: boolean;
};

function toUser(user: DbUser | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    phone: user.phone,
    isAdmin: user.is_admin,
    defaultDeliveryAddress: user.default_delivery_address,
    defaultDeliveryLat: user.default_delivery_lat ? Number(user.default_delivery_lat) : null,
    defaultDeliveryLng: user.default_delivery_lng ? Number(user.default_delivery_lng) : null,
  };
}

function toOrder(order: DbOrder) {
  return {
    id: order.id,
    userId: order.user_id,
    amount: Number(order.amount),
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    esewaTransactionUuid: order.esewa_transaction_uuid,
    deliveryAddress: order.delivery_address,
    deliveryLat: Number(order.delivery_lat),
    deliveryLng: Number(order.delivery_lng),
    deliveryDate: order.delivery_date,
    itemsJson: JSON.stringify(order.items_json),
    customerPhone: order.customer_phone || null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function mustBeLoggedIn(context: Context) {
  if (!context.user) {
    throw new Error("Please login first");
  }

  return context.user;
}

function validateDeliveryDate(deliveryDate: string) {
  const parsed = new Date(`${deliveryDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid delivery date");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsed < today) {
    throw new Error("Delivery date cannot be in the past");
  }
}

const root = {
  me: async (_: unknown, context: Context) => toUser(context.user),

  myOrders: async (_: unknown, context: Context) => {
    if (!context.user) {
      return [];
    }
    const user = context.user;
    const sql = getSql();

    const orders = (await sql`
      SELECT
        id,
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json,
        created_at,
        updated_at
      FROM orders
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `) as DbOrder[];

    return orders.map(toOrder);
  },

  ordersByIds: async ({ ids }: { ids: string[] }) => {
    if (!Array.isArray(ids) || !ids.length) {
      return [];
    }

    const numericIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!numericIds.length) {
      return [];
    }

    const sql = getSql();
    const orders = (await sql`
      SELECT
        id,
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json,
        created_at,
        updated_at
      FROM orders
      WHERE id = ANY(${numericIds}::bigint[])
      ORDER BY created_at DESC
    `) as DbOrder[];

    return orders.map(toOrder);
  },

  adminOrders: async (_: unknown, context: Context) => {
    const user = mustBeLoggedIn(context);
    if (!user.is_admin) {
      throw new Error("Admin access required");
    }

    const sql = getSql();
    const orders = (await sql`
      SELECT
        o.id,
        o.user_id,
        o.amount,
        o.payment_status,
        o.order_status,
        o.esewa_transaction_uuid,
        o.delivery_address,
        o.delivery_lat,
        o.delivery_lng,
        o.delivery_date,
        o.items_json,
        o.created_at,
        o.updated_at,
        u.phone AS customer_phone
      FROM orders o
      INNER JOIN app_users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `) as DbOrder[];

    return orders.map(toOrder);
  },

  register: async ({ phone, password }: { phone: string; password: string }, context: Context) => {
    const normalizedPhone = normalizePhone(phone || "");

    if (!isValidEsewaPhone(normalizedPhone)) {
      throw new Error("Enter a valid eSewa registered number");
    }

    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const sql = getSql();
    const existing = (await sql`
      SELECT id FROM app_users WHERE phone = ${normalizedPhone} LIMIT 1
    `) as { id: string }[];

    if (existing.length) {
      throw new Error("Number is already registered");
    }

    const passwordHash = hashPassword(password);
    const inserted = (await sql`
      INSERT INTO app_users (phone, password_hash)
      VALUES (${normalizedPhone}, ${passwordHash})
      RETURNING id, phone, is_admin, default_delivery_address, default_delivery_lat, default_delivery_lng, password_hash
    `) as DbUser[];

    const createdUser = inserted[0];
    context.setSessionToken = createSessionToken(Number(createdUser.id), createdUser.phone);

    return {
      ok: true,
      message: "Registration successful",
      user: toUser(createdUser),
    };
  },

  login: async ({ phone, password }: { phone: string; password: string }, context: Context) => {
    const normalizedPhone = normalizePhone(phone || "");
    if (!isValidEsewaPhone(normalizedPhone)) {
      throw new Error("Invalid phone or password");
    }

    const sql = getSql();
    const users = (await sql`
      SELECT id, phone, password_hash, is_admin, default_delivery_address, default_delivery_lat, default_delivery_lng
      FROM app_users
      WHERE phone = ${normalizedPhone}
      LIMIT 1
    `) as DbUser[];

    const user = users[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid phone or password");
    }

    context.setSessionToken = createSessionToken(Number(user.id), user.phone);

    return {
      ok: true,
      message: "Login successful",
      user: toUser(user),
    };
  },

  logout: async (_: unknown, context: Context) => {
    context.clearSession = true;
    return { ok: true, message: "Logged out" };
  },

  createOrder: async (
    {
      input,
    }: {
      input: {
        items: { id: string; name: string; quantity: number; price: number }[];
        deliveryAddress: string;
        deliveryLat: number;
        deliveryLng: number;
        deliveryDate: string;
        saveAsDefaultLocation: boolean;
      };
    },
    context: Context,
  ) => {
    if (!Array.isArray(input.items) || !input.items.length) {
      throw new Error("Cart is empty");
    }

    const cleanedItems = input.items
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        price: Number(item.price),
      }))
      .filter((item) => item.quantity > 0 && item.price > 0);

    if (!cleanedItems.length) {
      throw new Error("Cart is empty");
    }

    const deliveryAddress = input.deliveryAddress?.trim();
    if (!deliveryAddress) {
      throw new Error("Delivery address is required");
    }

    if (!Number.isFinite(input.deliveryLat) || !Number.isFinite(input.deliveryLng)) {
      throw new Error("Please select delivery location on the map");
    }

    validateDeliveryDate(input.deliveryDate);

    const totalAmount = cleanedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const sql = getSql();
    let ownerId = context.user?.id;

    if (!ownerId) {
      const guestPhone = `guest-${randomUUID()}`;
      const guestPassword = hashPassword(randomUUID());
      const guest = (await sql`
        INSERT INTO app_users (phone, password_hash, is_admin)
        VALUES (${guestPhone}, ${guestPassword}, FALSE)
        RETURNING id
      `) as { id: string }[];
      ownerId = guest[0].id;
    }

    const inserted = (await sql`
      INSERT INTO orders (
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json
      )
      VALUES (
        ${ownerId},
        ${totalAmount.toFixed(2)},
        'PENDING',
        'PENDING_PAYMENT',
        ${randomUUID()},
        ${deliveryAddress},
        ${input.deliveryLat},
        ${input.deliveryLng},
        ${input.deliveryDate},
        ${JSON.stringify(cleanedItems)}::jsonb
      )
      RETURNING
        id,
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json,
        created_at,
        updated_at
    `) as DbOrder[];

    if (input.saveAsDefaultLocation && context.user) {
      await sql`
        UPDATE app_users
        SET
          default_delivery_address = ${deliveryAddress},
          default_delivery_lat = ${input.deliveryLat},
          default_delivery_lng = ${input.deliveryLng}
        WHERE id = ${context.user.id}
      `;
    }

    return toOrder(inserted[0]);
  },

  deleteOrder: async ({ orderId }: { orderId: string }, context: Context) => {
    const numericOrderId = Number(orderId);
    if (!Number.isFinite(numericOrderId) || numericOrderId <= 0) {
      throw new Error("Invalid order");
    }

    const sql = getSql();
    const isAdmin = Boolean(context.user?.is_admin);

    if (context.user && !isAdmin) {
      const deleted = (await sql`
        DELETE FROM orders
        WHERE id = ${numericOrderId}
          AND user_id = ${context.user.id}
          AND payment_status <> 'PAID'
        RETURNING id
      `) as { id: string }[];

      if (!deleted.length) {
        throw new Error("Order cannot be deleted");
      }
      return { ok: true, message: "Order deleted successfully" };
    }

    const deleted = (await sql`
      DELETE FROM orders
      WHERE id = ${numericOrderId}
        AND payment_status <> 'PAID'
      RETURNING id
    `) as { id: string }[];

    if (!deleted.length) {
      throw new Error("Order cannot be deleted");
    }

    return { ok: true, message: "Order deleted successfully" };
  },

  updateOrderDelivery: async (
    {
      orderId,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      deliveryDate,
      saveAsDefaultLocation,
    }: {
      orderId: string;
      deliveryAddress: string;
      deliveryLat: number;
      deliveryLng: number;
      deliveryDate: string;
      saveAsDefaultLocation: boolean;
    },
    context: Context,
  ) => {
    const numericOrderId = Number(orderId);
    if (!Number.isFinite(numericOrderId) || numericOrderId <= 0) {
      throw new Error("Invalid order");
    }

    const trimmedAddress = deliveryAddress?.trim();
    if (!trimmedAddress) {
      throw new Error("Delivery address is required");
    }

    if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
      throw new Error("Please select delivery location on map");
    }

    validateDeliveryDate(deliveryDate);

    const sql = getSql();
    const updated = (await sql`
      UPDATE orders
      SET
        delivery_address = ${trimmedAddress},
        delivery_lat = ${deliveryLat},
        delivery_lng = ${deliveryLng},
        delivery_date = ${deliveryDate},
        updated_at = NOW()
      WHERE id = ${numericOrderId} AND payment_status <> 'PAID'
      RETURNING
        id,
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json,
        created_at,
        updated_at
    `) as DbOrder[];

    if (!updated.length) {
      throw new Error("Order cannot be updated");
    }

    if (saveAsDefaultLocation && context.user) {
      await sql`
        UPDATE app_users
        SET
          default_delivery_address = ${trimmedAddress},
          default_delivery_lat = ${deliveryLat},
          default_delivery_lng = ${deliveryLng}
        WHERE id = ${context.user.id}
      `;
    }

    return toOrder(updated[0]);
  },

  createEsewaPayment: async ({ orderId }: { orderId: string }, context: Context) => {
    const user = mustBeLoggedIn(context);
    const numericOrderId = Number(orderId);

    if (!Number.isFinite(numericOrderId) || numericOrderId <= 0) {
      throw new Error("Invalid order");
    }

    const sql = getSql();
    const orders = (await sql`
      SELECT
        id,
        user_id,
        amount,
        payment_status,
        order_status,
        esewa_transaction_uuid,
        delivery_address,
        delivery_lat,
        delivery_lng,
        delivery_date,
        items_json,
        created_at,
        updated_at
      FROM orders
      WHERE id = ${numericOrderId}
      LIMIT 1
    `) as DbOrder[];

    const order = orders[0];
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.payment_status === "PAID") {
      throw new Error("Order already paid");
    }

    await sql`
      UPDATE orders
      SET user_id = ${user.id}
      WHERE id = ${numericOrderId}
    `;

    const transactionUuid = order.esewa_transaction_uuid || randomUUID();
    if (!order.esewa_transaction_uuid) {
      await sql`
        UPDATE orders
        SET esewa_transaction_uuid = ${transactionUuid}, updated_at = NOW()
        WHERE id = ${numericOrderId}
      `;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const payload = createEsewaPayload({
      totalAmount: Number(order.amount),
      successUrl: `${siteUrl}/orders?payment=success&orderId=${order.id}`,
      failureUrl: `${siteUrl}/orders?payment=failed&orderId=${order.id}`,
      transactionUuid,
    });

    return {
      formUrl: process.env.NEXT_PUBLIC_ESEWA_FORM_URL || "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
      ...payload,
    };
  },

  confirmOrderPayment: async (
    {
      orderId,
      payment,
      transactionUuid,
      callbackStatus,
      callbackTotalAmount,
    }: {
      orderId: string;
      payment: string;
      transactionUuid?: string | null;
      callbackStatus?: string | null;
      callbackTotalAmount?: string | null;
    },
    _context: Context,
  ) => {
    const numericOrderId = Number(orderId);

    if (!Number.isFinite(numericOrderId) || numericOrderId <= 0) {
      throw new Error("Invalid order");
    }

    if (payment !== "success" && payment !== "failed") {
      throw new Error("Invalid payment state");
    }

    const targetPayment = payment === "success" ? "PAID" : "FAILED";
    const targetOrderStatus = payment === "success" ? "CONFIRMED" : "PAYMENT_FAILED";

    const sql = getSql();
    const orders = (await sql`
      SELECT id, esewa_transaction_uuid, payment_status, amount
      FROM orders
      WHERE id = ${numericOrderId}
      LIMIT 1
    `) as Array<{ id: string; esewa_transaction_uuid: string; payment_status: string; amount: string }>;

    const order = orders[0];
    if (!order) {
      throw new Error("Order not found");
    }

    if (payment === "success") {
      if (!transactionUuid) {
        throw new Error("Missing payment transaction reference");
      }

      const incomingUuid = transactionUuid.toLowerCase();
      const storedUuid = (order.esewa_transaction_uuid || "").toLowerCase();
      try {
        await verifyEsewaTransaction({
          transactionUuid,
          totalAmount: Number(order.amount),
        });
      } catch {
        const callbackState = (callbackStatus || "").toUpperCase();
        const callbackAmount = Number(callbackTotalAmount || 0);
        const orderAmount = Number(order.amount);
        const callbackOk =
          (callbackState === "COMPLETE" || callbackState === "SUCCESS") &&
          Number.isFinite(callbackAmount) &&
          Math.abs(callbackAmount - orderAmount) < 0.01;

        if (!callbackOk) {
          throw new Error("Payment verification failed");
        }
      }

      // If callback UUID differs (for example a stale/retried checkout cycle),
      // persist the verified callback UUID and continue.
      if (incomingUuid !== storedUuid) {
        await sql`
          UPDATE orders
          SET esewa_transaction_uuid = ${transactionUuid}, updated_at = NOW()
          WHERE id = ${numericOrderId}
        `;
      }
    }

    const updated = (await sql`
      UPDATE orders
      SET
        payment_status = ${targetPayment},
        order_status = ${targetOrderStatus},
        updated_at = NOW()
      WHERE id = ${numericOrderId} AND payment_status <> 'PAID'
      RETURNING id
    `) as { id: string }[];

    if (!updated.length) {
      throw new Error("Order not found");
    }

    return {
      ok: true,
      message:
        payment === "success"
          ? "Order confirmed and payment received. It will be delivered on time."
          : "Payment not completed. Order is not confirmed.",
    };
  },
};

export async function POST(request: Request) {
  try {
    await ensureUsersTable();

    const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };

    if (!body.query) {
      return Response.json({ errors: [{ message: "Query is required" }] }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    const session = verifySessionToken(token);

    let user: DbUser | null = null;

    if (session) {
      const sql = getSql();
      const users = (await sql`
        SELECT
          id,
          phone,
          password_hash,
          is_admin,
          default_delivery_address,
          default_delivery_lat,
          default_delivery_lng
        FROM app_users
        WHERE id = ${session.userId}
        LIMIT 1
      `) as DbUser[];

      user = users[0] || null;
    }

    const context: Context = { user };

    const result = await graphql({
      schema,
      source: body.query,
      rootValue: root,
      contextValue: context,
      variableValues: body.variables || {},
    });

    const response = Response.json(result, { status: result.errors?.length ? 400 : 200 });

    if (context.setSessionToken) {
      const cfg = sessionCookieConfig(context.setSessionToken);
      response.headers.append(
        "Set-Cookie",
        `${cfg.name}=${cfg.value}; Path=${cfg.path}; Max-Age=${cfg.maxAge}; HttpOnly; SameSite=${cfg.sameSite}${
          cfg.secure ? "; Secure" : ""
        }`,
      );
    }

    if (context.clearSession) {
      const cfg = clearSessionCookieConfig();
      response.headers.append(
        "Set-Cookie",
        `${cfg.name}=; Path=${cfg.path}; Max-Age=0; HttpOnly; SameSite=${cfg.sameSite}${
          cfg.secure ? "; Secure" : ""
        }`,
      );
    }

    return response;
  } catch {
    return Response.json({ errors: [{ message: "GraphQL execution failed" }] }, { status: 500 });
  }
}
