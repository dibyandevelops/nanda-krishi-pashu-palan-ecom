"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/gql-request";
import SiteNavbar from "@/components/site-navbar";

type AdminOrder = {
  id: string;
  amount: number;
  paymentStatus: string;
  orderStatus: string;
  esewaTransactionUuid: string;
  deliveryDate: string;
  deliveryAddress: string;
  customerPhone: string | null;
  createdAt: string;
};

const ADMIN_ORDERS_QUERY = `
  query {
    me { id isAdmin }
    adminOrders {
      id
      amount
      paymentStatus
      orderStatus
      esewaTransactionUuid
      deliveryDate
      deliveryAddress
      customerPhone
      createdAt
    }
  }
`;

function formatDeliveryDate(value: string) {
  if (!value) {
    return "-";
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const asMs = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
    const numericDate = new Date(asMs);
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toLocaleDateString("en-NP", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
  }

  const isoDate = new Date(value);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toLocaleDateString("en-NP", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return value;
  }

  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-NP", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatCreatedAt(value: string) {
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const asMs = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
    const numericDate = new Date(asMs);
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toLocaleString("en-NP", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-NP", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const query = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => gqlRequest<{ me: { isAdmin: boolean } | null; adminOrders: AdminOrder[] }>(ADMIN_ORDERS_QUERY),
  });

  const isAdmin = query.data?.me?.isAdmin;
  const orders = query.data?.adminOrders || [];

  return (
    <main className="min-h-screen bg-[#f8ead2] text-[#3c2c1e]">
      <SiteNavbar isAdmin={isAdmin} />

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-[#4b3118]">Admin Panel</h1>
          <Link href="/" className="rounded-lg bg-[#5e9033] px-4 py-2 text-sm font-semibold text-white">
            Back to Store
          </Link>
        </div>

        {query.isLoading ? <p>Loading orders...</p> : null}
        {query.error ? <p className="text-[#b03e2f]">Unable to load admin data.</p> : null}
        {!query.isLoading && !query.error && !isAdmin ? <p className="text-[#b03e2f]">Admin access required.</p> : null}

        {!query.isLoading && !query.error && isAdmin ? (
          <div className="overflow-x-auto rounded-2xl border border-[#d9be99] bg-[#fff8eb] p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4cfac] text-left">
                  <th className="px-3 py-2">Order ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Delivery Date</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Txn UUID</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[#f1e3ca]">
                    <td className="px-3 py-2">{order.id}</td>
                    <td className="px-3 py-2">{order.customerPhone || "-"}</td>
                    <td className="px-3 py-2">Rs. {order.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 font-semibold">{order.paymentStatus}</td>
                    <td className="px-3 py-2 font-semibold">{order.orderStatus}</td>
                    <td className="px-3 py-2">{formatDeliveryDate(order.deliveryDate)}</td>
                    <td className="px-3 py-2">{order.deliveryAddress}</td>
                    <td className="px-3 py-2">{order.esewaTransactionUuid}</td>
                    <td className="px-3 py-2">{formatCreatedAt(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
