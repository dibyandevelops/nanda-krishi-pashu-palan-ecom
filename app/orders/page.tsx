"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { gqlRequest } from "@/lib/gql-request";
import SiteNavbar from "@/components/site-navbar";
import SiteFooter from "@/components/site-footer";

const LocationPickerMap = dynamic(() => import("@/components/location-picker-map"), { ssr: false });

type User = {
  id: string;
  phone: string;
  isAdmin: boolean;
  defaultDeliveryAddress?: string | null;
  defaultDeliveryLat?: number | null;
  defaultDeliveryLng?: number | null;
};

type Order = {
  id: string;
  amount: number;
  paymentStatus: string;
  orderStatus: string;
  esewaTransactionUuid: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryDate: string;
  itemsJson: string;
  createdAt: string;
};

type CheckoutItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

const storeContactNumber = "9847337394";
const whatsappUrl = "https://wa.me/9779847337394";
const locationUrl =
  "https://www.google.com/maps/place/Nanda+Krishi+Tatha+Pashupalan/@27.6348674,85.3393434,18z/data=!3m1!4b1!4m6!3m5!1s0x39eb17a99c0e99db:0x92507b7ff062fe9e!8m2!3d27.6348674!4d85.3405037!16s%2Fg%2F11rwq86_51?entry=ttu&g_ep=EgoyMDI2MDQxMi4wIKXMDSoASAFQAw%3D%3D";

const CORE_QUERY = `
  query($ids: [ID!]!) {
    me {
      id
      phone
      isAdmin
      defaultDeliveryAddress
      defaultDeliveryLat
      defaultDeliveryLng
    }
    myOrders {
      id
      amount
      paymentStatus
      orderStatus
      esewaTransactionUuid
      deliveryAddress
      deliveryLat
      deliveryLng
      deliveryDate
      itemsJson
      createdAt
    }
    ordersByIds(ids: $ids) {
      id
      amount
      paymentStatus
      orderStatus
      esewaTransactionUuid
      deliveryAddress
      deliveryLat
      deliveryLng
      deliveryDate
      itemsJson
      createdAt
    }
  }
`;

function getDefaultDeliveryDate() {
  return new Date().toISOString().slice(0, 10);
}

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

async function reverseGeocode(lat: number, lng: number) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    );
    if (!response.ok) {
      return `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
    const data = (await response.json()) as { display_name?: string };
    return data.display_name || `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  } catch {
    return `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }
}

function readCheckoutCart() {
  try {
    const raw = localStorage.getItem("checkout_cart");
    if (!raw) {
      return [] as CheckoutItem[];
    }

    return (JSON.parse(raw) as CheckoutItem[]).filter((item) => item.quantity > 0);
  } catch {
    return [];
  }
}

function readGuestOrderIds() {
  try {
    const raw = localStorage.getItem("guest_order_ids");
    if (!raw) {
      return [] as string[];
    }

    const ids = JSON.parse(raw) as string[];
    return ids.filter((id) => Number.isFinite(Number(id)));
  } catch {
    return [];
  }
}

function writeGuestOrderId(id: string) {
  const current = readGuestOrderIds();
  const next = Array.from(new Set([id, ...current]));
  localStorage.setItem("guest_order_ids", JSON.stringify(next));
}

function decodeEsewaData(data: string | null) {
  if (!data) {
    return null;
  }

  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded) as {
      transaction_uuid?: string;
      status?: string;
      total_amount?: string;
    };
  } catch {
    return null;
  }
}

function removeGuestOrderId(id: string) {
  const current = readGuestOrderIds();
  const next = current.filter((orderId) => orderId !== id);
  localStorage.setItem("guest_order_ids", JSON.stringify(next));
}

export default function OrdersPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(getDefaultDeliveryDate());
  const [saveAsDefaultLocation, setSaveAsDefaultLocation] = useState(true);
  const [deliveryLat, setDeliveryLat] = useState(27.6348674);
  const [deliveryLng, setDeliveryLng] = useState(85.3405037);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [showQuickLoginModal, setShowQuickLoginModal] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editDate, setEditDate] = useState(getDefaultDeliveryDate());
  const [editLat, setEditLat] = useState(27.6348674);
  const [editLng, setEditLng] = useState(85.3405037);
  const [isDetectingEditLocation, setIsDetectingEditLocation] = useState(false);
  const [isResolvingEditAddress, setIsResolvingEditAddress] = useState(false);

  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<string | null>(null);
  const [paymentInProgressOrderId, setPaymentInProgressOrderId] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const callbackHandledRef = useRef(false);

  const ordersQuery = useQuery({
    queryKey: ["orders-core"],
    queryFn: async () => {
      const ids = typeof window !== "undefined" ? readGuestOrderIds() : [];
      return gqlRequest<{ me: User | null; myOrders: Order[]; ordersByIds: Order[] }>(CORE_QUERY, { ids });
    },
  });

  const quickLoginMutation = useMutation({
    mutationFn: async () =>
      gqlRequest(
        `
          mutation ($phone: String!, $password: String!) {
            login(phone: $phone, password: $password) {
              ok
              message
            }
          }
        `,
        { phone: loginPhone, password: loginPassword },
      ),
    onSuccess: async () => {
      await ordersQuery.refetch();
      closeQuickLoginModal();
      if (pendingPaymentOrderId) {
        payMutation.mutate(pendingPaymentOrderId);
      }
    },
    onError: (error) => {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () =>
      gqlRequest<{ createOrder: { id: string } }>(
        `
          mutation CreateOrder($input: CreateOrderInput!) {
            createOrder(input: $input) { id }
          }
        `,
        {
          input: {
            items: checkoutItems,
            deliveryAddress,
            deliveryLat,
            deliveryLng,
            deliveryDate,
            saveAsDefaultLocation,
          },
        },
      ),
    onSuccess: async (data) => {
      writeGuestOrderId(data.createOrder.id);
      setNotice(`Order Number #${data.createOrder.id} created.`);
      localStorage.removeItem("checkout_cart");
      closeCheckoutModal();
      await ordersQuery.refetch();
    },
    onError: (error) => {
      setCheckoutError(error instanceof Error ? error.message : "Failed to create order");
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!editingOrder) {
        throw new Error("No order selected");
      }

      return gqlRequest<{ updateOrderDelivery: { id: string } }>(
        `
          mutation UpdateOrder($orderId: ID!, $deliveryAddress: String!, $deliveryLat: Float!, $deliveryLng: Float!, $deliveryDate: String!, $saveAsDefaultLocation: Boolean!) {
            updateOrderDelivery(
              orderId: $orderId
              deliveryAddress: $deliveryAddress
              deliveryLat: $deliveryLat
              deliveryLng: $deliveryLng
              deliveryDate: $deliveryDate
              saveAsDefaultLocation: $saveAsDefaultLocation
            ) {
              id
            }
          }
        `,
        {
          orderId: editingOrder.id,
          deliveryAddress: editAddress,
          deliveryLat: editLat,
          deliveryLng: editLng,
          deliveryDate: editDate,
          saveAsDefaultLocation: false,
        },
      );
    },
    onSuccess: async () => {
      setNotice("Order delivery details updated.");
      closeEditOrderModal();
      await ordersQuery.refetch();
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) =>
      gqlRequest<{ deleteOrder: { ok: boolean; message: string } }>(
        `
          mutation DeleteOrder($orderId: ID!) {
            deleteOrder(orderId: $orderId) {
              ok
              message
            }
          }
        `,
        { orderId },
      ),
    onSuccess: async (data, orderId) => {
      removeGuestOrderId(orderId);
      setNotice(data.deleteOrder.message);
      await ordersQuery.refetch();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Failed to delete order");
    },
  });

  const payMutation = useMutation({
    mutationFn: async (orderId: string) =>
      gqlRequest<{
        createEsewaPayment: {
          formUrl: string;
          amount: string;
          tax_amount: string;
          total_amount: string;
          transaction_uuid: string;
          product_code: string;
          product_service_charge: string;
          product_delivery_charge: string;
          success_url: string;
          failure_url: string;
          signed_field_names: string;
          signature: string;
        };
      }>(
        `
          mutation ($orderId: ID!) {
            createEsewaPayment(orderId: $orderId) {
              formUrl
              amount
              tax_amount
              total_amount
              transaction_uuid
              product_code
              product_service_charge
              product_delivery_charge
              success_url
              failure_url
              signed_field_names
              signature
            }
          }
        `,
        { orderId },
      ),
    onMutate: (orderId) => {
      setPaymentInProgressOrderId(orderId);
    },
    onSuccess: (data) => {
      const payment = data.createEsewaPayment;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = payment.formUrl;

      const payload = { ...payment };
      delete (payload as { formUrl?: string }).formUrl;

      Object.entries(payload).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    },
    onError: () => {
      setPaymentInProgressOrderId(null);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({
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
    }) =>
      gqlRequest<{ confirmOrderPayment: { message: string } }>(
        `
          mutation ($orderId: ID!, $payment: String!, $transactionUuid: String, $callbackStatus: String, $callbackTotalAmount: String) {
            confirmOrderPayment(
              orderId: $orderId
              payment: $payment
              transactionUuid: $transactionUuid
              callbackStatus: $callbackStatus
              callbackTotalAmount: $callbackTotalAmount
            ) {
              message
            }
          }
        `,
        { orderId, payment, transactionUuid, callbackStatus, callbackTotalAmount },
      ),
    onSuccess: async (data) => {
      setNotice(data.confirmOrderPayment.message);
      setPaymentInProgressOrderId(null);
      await ordersQuery.refetch();
      window.history.replaceState({}, "", `${window.location.origin}/orders`);
    },
    onError: (error) => {
      setPaymentInProgressOrderId(null);
      setNotice(error instanceof Error ? error.message : "Payment confirmation failed");
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (callbackHandledRef.current) {
      return;
    }
    callbackHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const rawSearch = window.location.search;
    const checkout = params.get("checkout");
    const payment = params.get("payment");
    const orderId = params.get("orderId");

    let encodedData = params.get("data");
    if (!encodedData) {
      const dataIdx = rawSearch.indexOf("data=");
      if (dataIdx >= 0) {
        encodedData = rawSearch.slice(dataIdx + 5);
      }
    }

    const decoded = decodeEsewaData(encodedData);
    let transactionUuid = params.get("transaction_uuid");
    if (transactionUuid?.includes("?")) {
      transactionUuid = transactionUuid.split("?")[0];
    }
    transactionUuid = transactionUuid || decoded?.transaction_uuid || null;
    const callbackStatus = decoded?.status || null;
    const callbackTotalAmount = decoded?.total_amount || null;

    if (checkout === "1") {
      const items = readCheckoutCart();
      setCheckoutItems(items);
      setShowCheckoutModal(true);
      setCheckoutStep(1);
    }

    if ((payment === "success" || payment === "failed") && orderId) {
      confirmMutation.mutate({
        orderId,
        payment,
        transactionUuid,
        callbackStatus,
        callbackTotalAmount,
      });
    }
  }, [confirmMutation]);

  const mergedOrders = useMemo(() => {
    const own = ordersQuery.data?.myOrders || [];
    const guest = ordersQuery.data?.ordersByIds || [];
    const map = new Map<string, Order>();
    [...own, ...guest].forEach((order) => map.set(order.id, order));
    return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [ordersQuery.data]);

  const checkoutSubtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [checkoutItems],
  );

  function updateCheckoutItem(id: string, quantity: number) {
    setCheckoutItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function goToNextStep() {
    if (checkoutStep === 1) {
      if (!checkoutItems.length) {
        setCheckoutError("Add at least one item in checkout.");
        return;
      }
      setCheckoutError(null);
      setCheckoutStep(2);
      return;
    }

    if (checkoutStep === 2) {
      if (!deliveryAddress.trim()) {
        setCheckoutError("Delivery address is required.");
        return;
      }
      setCheckoutError(null);
      setCheckoutStep(3);
    }
  }

  function goToPreviousStep() {
    if (checkoutStep === 2) {
      setCheckoutStep(1);
      return;
    }
    if (checkoutStep === 3) {
      setCheckoutStep(2);
    }
  }

  function resetCheckoutModalForm() {
    setCheckoutStep(1);
    setCheckoutError(null);
    setCheckoutItems([]);
    setDeliveryAddress("");
    setDeliveryDate(getDefaultDeliveryDate());
    setSaveAsDefaultLocation(true);
    setDeliveryLat(27.6348674);
    setDeliveryLng(85.3405037);
    setIsDetectingLocation(false);
    setIsResolvingAddress(false);
  }

  function closeCheckoutModal() {
    setShowCheckoutModal(false);
    resetCheckoutModalForm();
  }

  function resetQuickLoginForm() {
    setLoginPhone("");
    setLoginPassword("");
    setShowLoginPassword(false);
    setLoginError(null);
  }

  function closeQuickLoginModal() {
    setShowQuickLoginModal(false);
    resetQuickLoginForm();
  }

  function resetEditOrderForm() {
    setEditAddress("");
    setEditDate(getDefaultDeliveryDate());
    setEditLat(27.6348674);
    setEditLng(85.3405037);
    setIsDetectingEditLocation(false);
    setIsResolvingEditAddress(false);
  }

  function closeEditOrderModal() {
    setEditingOrder(null);
    resetEditOrderForm();
  }

  async function placeOrder() {
    await createOrderMutation.mutateAsync();
  }

  async function submitQuickLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    await quickLoginMutation.mutateAsync();
  }

  async function updateDeliveryAddressFromCoords(lat: number, lng: number) {
    setDeliveryLat(lat);
    setDeliveryLng(lng);
    setIsResolvingAddress(true);
    const resolved = await reverseGeocode(lat, lng);
    setDeliveryAddress(resolved);
    setIsResolvingAddress(false);
  }

  async function updateEditAddressFromCoords(lat: number, lng: number) {
    setEditLat(lat);
    setEditLng(lng);
    setIsResolvingEditAddress(true);
    const resolved = await reverseGeocode(lat, lng);
    setEditAddress(resolved);
    setIsResolvingEditAddress(false);
  }

  function useCurrentLocationForCheckout() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setCheckoutError("Location is not supported on this device/browser.");
      return;
    }

    setCheckoutError(null);
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateDeliveryAddressFromCoords(position.coords.latitude, position.coords.longitude);
        setIsDetectingLocation(false);
      },
      (error) => {
        setCheckoutError(error.message || "Could not access current location.");
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function useCurrentLocationForEdit() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setNotice("Location is not supported on this device/browser.");
      return;
    }

    setIsDetectingEditLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateEditAddressFromCoords(position.coords.latitude, position.coords.longitude);
        setIsDetectingEditLocation(false);
      },
      () => {
        setNotice("Could not access current location for edit.");
        setIsDetectingEditLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function printReceipt(order: Order) {
    const items = JSON.parse(order.itemsJson) as Array<{ name: string; quantity: number; price?: number }>;
    const receiptWindow = window.open("", "_blank", "width=800,height=900");
    if (!receiptWindow) {
      setNotice("Please allow popups to print receipt.");
      return;
    }

    const rows = items
      .map(
        (item) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;">${item.name}</td>
            <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${item.quantity}</td>
          </tr>
        `,
      )
      .join("");

    receiptWindow.document.write(`
      <html>
      <head>
        <title>Receipt #${order.id}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>Nanda Krishi Tatha Pasupalan</h2>
        <p><strong>Order Number:</strong> #${order.id}</p>
        <p><strong>Date:</strong> ${formatCreatedAt(order.createdAt)}</p>
        <p><strong>Delivery Date:</strong> ${formatDeliveryDate(order.deliveryDate)}</p>
        <p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>
        <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:2px solid #333;">Item</th>
              <th style="text-align:center;padding:8px;border-bottom:2px solid #333;">Qty</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px;"><strong>Total:</strong> Rs. ${order.amount.toFixed(2)}</p>
      </body>
      </html>
    `);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.print();
  }

  return (
    <main className="min-h-screen bg-[#f8ead2] text-[#3c2c1e] flex flex-col">
      <SiteNavbar isAdmin={ordersQuery.data?.me?.isAdmin} />

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-[#4b3118]">My Orders</h1>
          <div className="flex gap-2">
            <Link href="/" className="rounded-lg bg-[#5e9033] px-4 py-2 text-sm font-semibold text-white">
              Back to Store
            </Link>
          </div>
        </div>

        {notice ? (
          <div className="mb-5 rounded-2xl border border-[#8bc34a] bg-[#ecf9db] p-4 shadow-[0_8px_20px_rgba(73,128,46,0.2)]">
            <p className="text-base font-semibold text-[#2f7d32]">Order Confirmed</p>
            <p className="mt-1 text-sm text-[#3d6f2b]">{notice}</p>
            <p className="mt-2 text-xs text-[#4f7c2b]">Our dairy delivery team has queued your package for on-time dispatch.</p>
          </div>
        ) : null}

        {ordersQuery.isLoading ? <p>Loading orders...</p> : null}

        <div className="grid gap-4">
          {mergedOrders.map((order) => {
            const items = JSON.parse(order.itemsJson) as Array<{ name: string; quantity: number }>;
            return (
              <article key={order.id} className="rounded-2xl border border-[#d9be99] bg-[#fff8eb] p-5 shadow-[0_8px_16px_rgba(78,52,27,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[#4b3118]">Order Number: #{order.id}</h2>
                  <span className="rounded-full bg-[#f0e1c7] px-3 py-1 text-xs font-semibold">
                    {order.paymentStatus} / {order.orderStatus}
                  </span>
                </div>
                <p className="mt-2 text-sm">Delivery Date: {formatDeliveryDate(order.deliveryDate)}</p>
                <p className="text-sm">Address: {order.deliveryAddress}</p>
                <p className="text-sm">Amount: Rs. {order.amount.toFixed(2)}</p>
                <p className="mt-1 text-xs text-[#4f7c2b]">Your requested items will be delivered in due time.</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-[#6d4f30]">
                  {items.map((item, index) => (
                    <li key={`${order.id}-${index}`}>
                      {item.name} x {item.quantity}
                    </li>
                  ))}
                </ul>

                {order.paymentStatus === "PAID" ? (
                  <div className="mt-4">
                    <span className="inline-flex items-center rounded-full bg-[#2f7d32] px-3 py-1 text-xs font-semibold text-white">
                      PAID
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOrder(order);
                        setEditAddress(order.deliveryAddress);
                        setEditDate(order.deliveryDate);
                        setEditLat(order.deliveryLat);
                        setEditLng(order.deliveryLng);
                      }}
                      disabled={paymentInProgressOrderId === order.id}
                      className="rounded-lg border border-[#bfa683] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Edit Address
                    </button>

                    <button
                      type="button"
                      onClick={() => setReceiptOrder(order)}
                      className="rounded-lg border border-[#7b5d3a] px-4 py-2 text-sm font-semibold"
                    >
                      View Receipt
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteOrderMutation.mutate(order.id)}
                      disabled={deleteOrderMutation.isPending || paymentInProgressOrderId === order.id}
                      className="rounded-lg bg-[#b03e2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {deleteOrderMutation.isPending ? "Deleting..." : "Delete Order"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (paymentInProgressOrderId) {
                          return;
                        }
                        if (!ordersQuery.data?.me) {
                          setPendingPaymentOrderId(order.id);
                          resetQuickLoginForm();
                          setShowQuickLoginModal(true);
                          return;
                        }
                        payMutation.mutate(order.id);
                      }}
                      disabled={Boolean(paymentInProgressOrderId)}
                      className="rounded-lg bg-[#69a03a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {paymentInProgressOrderId === order.id ? "Redirecting..." : "Pay & Confirm"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <SiteFooter locationUrl={locationUrl} storeContactNumber={storeContactNumber} whatsappUrl={whatsappUrl} />

      {showCheckoutModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onClick={closeCheckoutModal}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">Create Order - Step {checkoutStep} of 3</h3>
              <button
                type="button"
                onClick={closeCheckoutModal}
                className="rounded-md bg-[#f1e0c3] px-3 py-1 text-sm font-semibold text-[#5c4024]"
              >
                Close
              </button>
            </div>

            {checkoutStep === 1 ? (
              <div>
                <h4 className="text-lg font-semibold">Review Items</h4>
                <div className="mt-3 space-y-2">
                  {checkoutItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#e1cba7] p-3">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm">Rs. {item.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateCheckoutItem(item.id, item.quantity - 1)} className="h-7 w-7 rounded-full bg-[#f2e3cb]">
                          -
                        </button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <button type="button" onClick={() => updateCheckoutItem(item.id, item.quantity + 1)} className="h-7 w-7 rounded-full bg-[#f2e3cb]">
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 font-semibold">Subtotal: Rs. {checkoutSubtotal.toFixed(2)}</p>
              </div>
            ) : null}

            {checkoutStep === 2 ? (
              <div className="space-y-3">
                <h4 className="text-lg font-semibold">Delivery Details</h4>
                <label className="block text-sm font-semibold">1) Delivery Date</label>
                <input
                  type="date"
                  min={getDefaultDeliveryDate()}
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                  className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm"
                />
                <label className="block text-sm font-semibold">2) Full Delivery Address</label>
                <textarea
                  rows={3}
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Example: House No. 12, near temple, Harisiddhi, Lalitpur"
                  className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useCurrentLocationForCheckout}
                    disabled={isDetectingLocation}
                    className="rounded-lg bg-[#4f7c2b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isDetectingLocation ? "Getting your location..." : "Use My Current Location"}
                  </button>
                  {isResolvingAddress ? <p className="text-sm text-[#6d4f30]">Finding address from map pin...</p> : null}
                </div>
                <p className="text-xs text-[#6d4f30]">3) Pick your exact location on map (tap/click on map)</p>
                <LocationPickerMap lat={deliveryLat} lng={deliveryLng} onChange={({ lat, lng }) => updateDeliveryAddressFromCoords(lat, lng)} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold">Latitude</label>
                    <input
                      readOnly
                      value={deliveryLat.toFixed(6)}
                      className="w-full rounded-lg border border-[#ccb08a] bg-[#f9f2e2] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold">Longitude</label>
                    <input
                      readOnly
                      value={deliveryLng.toFixed(6)}
                      className="w-full rounded-lg border border-[#ccb08a] bg-[#f9f2e2] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={saveAsDefaultLocation}
                    onChange={(event) => setSaveAsDefaultLocation(event.target.checked)}
                  />
                  Save as default location
                </label>
              </div>
            ) : null}

            {checkoutStep === 3 ? (
              <div className="space-y-3">
                <h4 className="text-lg font-semibold">Confirm & Place Order</h4>
                <p className="text-sm">Items: {checkoutItems.length}</p>
                <p className="text-sm">Delivery Date: {deliveryDate}</p>
                <p className="text-sm">Delivery Address: {deliveryAddress}</p>
                <p className="text-sm font-semibold">Total: Rs. {checkoutSubtotal.toFixed(2)}</p>
              </div>
            ) : null}

            {checkoutError ? <p className="mt-3 text-sm text-[#b03e2f]">{checkoutError}</p> : null}

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                disabled={checkoutStep === 1}
                onClick={goToPreviousStep}
                className="rounded-lg border border-[#bfa683] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Back
              </button>

              {checkoutStep < 3 ? (
                <button type="button" onClick={goToNextStep} className="rounded-lg bg-[#6f4b2b] px-4 py-2 text-sm font-semibold text-white">
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={createOrderMutation.isPending}
                  className="rounded-lg bg-[#69a03a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createOrderMutation.isPending ? "Creating..." : "Place Order"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editingOrder ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4" onClick={closeEditOrderModal}>
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">Edit Order #{editingOrder.id}</h3>
              <button type="button" onClick={closeEditOrderModal} className="rounded-md bg-[#f1e0c3] px-3 py-1 text-sm font-semibold text-[#5c4024]">
                Close
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold">Delivery Date</label>
              <input
                type="date"
                min={getDefaultDeliveryDate()}
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
                className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm"
              />
              <label className="block text-sm font-semibold">Full Delivery Address</label>
              <textarea
                rows={3}
                value={editAddress}
                onChange={(event) => setEditAddress(event.target.value)}
                placeholder="Example: House No. 12, near temple, Harisiddhi, Lalitpur"
                className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={useCurrentLocationForEdit}
                  disabled={isDetectingEditLocation}
                  className="rounded-lg bg-[#4f7c2b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isDetectingEditLocation ? "Getting your location..." : "Use My Current Location"}
                </button>
                {isResolvingEditAddress ? <p className="text-sm text-[#6d4f30]">Finding address from map pin...</p> : null}
              </div>
              <p className="text-xs text-[#6d4f30]">Pick your exact location on map (tap/click on map)</p>
              <LocationPickerMap lat={editLat} lng={editLng} onChange={({ lat, lng }) => updateEditAddressFromCoords(lat, lng)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold">Latitude</label>
                  <input
                    readOnly
                    value={editLat.toFixed(6)}
                    className="w-full rounded-lg border border-[#ccb08a] bg-[#f9f2e2] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Longitude</label>
                  <input
                    readOnly
                    value={editLng.toFixed(6)}
                    className="w-full rounded-lg border border-[#ccb08a] bg-[#f9f2e2] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateOrderMutation.mutate()}
                disabled={updateOrderMutation.isPending}
                className="w-full rounded-lg bg-[#69a03a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {updateOrderMutation.isPending ? "Updating..." : "Save Delivery Details"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptOrder ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 px-4" onClick={() => setReceiptOrder(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">Receipt #{receiptOrder.id}</h3>
              <button type="button" onClick={() => setReceiptOrder(null)} className="rounded-md bg-[#f1e0c3] px-3 py-1 text-sm font-semibold text-[#5c4024]">
                Close
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="font-semibold">Business:</span> Nanda Krishi Tatha Pasupalan</p>
              <p><span className="font-semibold">Order Number:</span> #{receiptOrder.id}</p>
              <p><span className="font-semibold">Created:</span> {formatCreatedAt(receiptOrder.createdAt)}</p>
              <p><span className="font-semibold">Delivery Date:</span> {formatDeliveryDate(receiptOrder.deliveryDate)}</p>
              <p><span className="font-semibold">Delivery Address:</span> {receiptOrder.deliveryAddress}</p>
              <p><span className="font-semibold">Payment:</span> {receiptOrder.paymentStatus}</p>
              <p><span className="font-semibold">Order Status:</span> {receiptOrder.orderStatus}</p>
              <p><span className="font-semibold">Total:</span> Rs. {receiptOrder.amount.toFixed(2)}</p>
              <div className="rounded-lg border border-[#e1cba7] bg-white p-3">
                <p className="mb-2 font-semibold">Items</p>
                <ul className="list-disc pl-5">
                  {(JSON.parse(receiptOrder.itemsJson) as Array<{ name: string; quantity: number }>).map((item, idx) => (
                    <li key={`${receiptOrder.id}-receipt-${idx}`}>
                      {item.name} x {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => printReceipt(receiptOrder)}
                className="rounded-lg bg-[#2f7d32] px-4 py-2 text-sm font-semibold text-white"
              >
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showQuickLoginModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4" onClick={closeQuickLoginModal}>
          <div
            className="w-full max-w-md rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">Login to Pay</h3>
              <button
                type="button"
                onClick={closeQuickLoginModal}
                className="rounded-md bg-[#f1e0c3] px-3 py-1 text-sm font-semibold text-[#5c4024]"
              >
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={submitQuickLogin}>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#5c4024]">eSewa Number</span>
                <input
                  type="tel"
                  value={loginPhone}
                  onChange={(event) => setLoginPhone(event.target.value)}
                  placeholder="eSewa number"
                  required
                  className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#6f4b2b] focus:ring-2 focus:ring-[#6f4b2b]/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#5c4024]">Password</span>
                <div className="flex items-center gap-2 rounded-lg border border-[#ccb08a] bg-white px-2 py-1">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Password"
                    required
                    className="w-full bg-transparent px-1 py-1 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[#4f7c2b] hover:bg-[#eef7e3]"
                  >
                    {showLoginPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                disabled={quickLoginMutation.isPending}
                className="w-full rounded-lg bg-[#5e9033] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {quickLoginMutation.isPending ? "Please wait..." : "Login and Continue"}
              </button>
              {loginError ? <p className="text-sm text-[#b03e2f]">{loginError}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
