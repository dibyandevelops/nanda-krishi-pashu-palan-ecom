import { neon } from "@neondatabase/serverless";
import { hashPassword } from "@/lib/auth";

let schemaReady: Promise<void> | null = null;
const ADMIN_PHONE = "9847337394";
const ADMIN_PASSWORD = "1Nanda@123";

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing");
  }

  return neon(databaseUrl);
}

export async function ensureUsersTable() {
  if (!schemaReady) {
    const sql = getSqlClient();

    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS app_users (
          id BIGSERIAL PRIMARY KEY,
          phone TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          default_delivery_address TEXT,
          default_delivery_lat NUMERIC(10, 7),
          default_delivery_lng NUMERIC(10, 7),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
      `;

      await sql`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS default_delivery_address TEXT
      `;

      await sql`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS default_delivery_lat NUMERIC(10, 7)
      `;

      await sql`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS default_delivery_lng NUMERIC(10, 7)
      `;

      await sql`
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS full_name TEXT
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS orders (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          amount NUMERIC(10, 2) NOT NULL,
          payment_status TEXT NOT NULL DEFAULT 'PENDING',
          order_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
          esewa_transaction_uuid TEXT NOT NULL,
          delivery_address TEXT NOT NULL,
          delivery_lat NUMERIC(10, 7) NOT NULL,
          delivery_lng NUMERIC(10, 7) NOT NULL,
          delivery_date DATE NOT NULL,
          items_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_address TEXT
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10, 7)
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10, 7)
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_date DATE
      `;

      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS items_json JSONB
      `;

      await sql`
        UPDATE orders
        SET
          delivery_address = COALESCE(delivery_address, 'Address pending'),
          delivery_lat = COALESCE(delivery_lat, 27.6348674),
          delivery_lng = COALESCE(delivery_lng, 85.3405037),
          delivery_date = COALESCE(delivery_date, CURRENT_DATE),
          items_json = COALESCE(items_json, '[]'::jsonb)
        WHERE
          delivery_address IS NULL
          OR delivery_lat IS NULL
          OR delivery_lng IS NULL
          OR delivery_date IS NULL
          OR items_json IS NULL
      `;

      const existingAdmin = (await sql`
        SELECT id FROM app_users WHERE phone = ${ADMIN_PHONE} LIMIT 1
      `) as { id: string }[];

      if (!existingAdmin.length) {
        const adminHash = hashPassword(ADMIN_PASSWORD);
        await sql`
          INSERT INTO app_users (phone, password_hash, is_admin, full_name)
          VALUES (${ADMIN_PHONE}, ${adminHash}, TRUE, 'Admin User')
        `;
      }
    })();
  }

  await schemaReady;
}

export function getSql() {
  return getSqlClient();
}
