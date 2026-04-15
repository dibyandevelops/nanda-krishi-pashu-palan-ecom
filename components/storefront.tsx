"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { gqlRequest } from "@/lib/gql-request";
import { products } from "@/lib/products";
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

type CheckoutItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

const locationUrl =
  "https://www.google.com/maps/place/Nanda+Krishi+Tatha+Pashupalan/@27.6348674,85.3393434,18z/data=!3m1!4b1!4m6!3m5!1s0x39eb17a99c0e99db:0x92507b7ff062fe9e!8m2!3d27.6348674!4d85.3405037!16s%2Fg%2F11rwq86_51?entry=ttu&g_ep=EgoyMDI2MDQxMi4wIKXMDSoASAFQAw%3D%3D";
const storeContactNumber = "9847337394";
const whatsappUrl = "https://wa.me/9779847337394";

const ME_QUERY = `
  query {
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
    }
  }
`;

function currency(amount: number) {
  return `Rs. ${amount.toFixed(2)}`;
}

function getDefaultDeliveryDate() {
  return new Date().toISOString().slice(0, 10);
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

export default function Storefront() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [showCartModal, setShowCartModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(getDefaultDeliveryDate());
  const [saveAsDefaultLocation, setSaveAsDefaultLocation] = useState(true);
  const [deliveryLat, setDeliveryLat] = useState(27.6348674);
  const [deliveryLng, setDeliveryLng] = useState(85.3405037);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [guestOrdersCount, setGuestOrdersCount] = useState(0);
  const [guestOrderIds, setGuestOrderIds] = useState<string[]>([]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      return gqlRequest<{ me: User | null; myOrders: Array<{ id: string }> }>(ME_QUERY, undefined, {
        operationName: "me",
      });
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateGuestOrderCount = () => {
      const ids = readGuestOrderIds();
      setGuestOrdersCount(ids.length);
      setGuestOrderIds(ids);
    };

    updateGuestOrderCount();
    window.addEventListener("storage", updateGuestOrderCount);
    return () => window.removeEventListener("storage", updateGuestOrderCount);
  }, []);

  useEffect(() => {
    if (!showCartModal) {
      return;
    }

    const user = meQuery.data?.me;
    if (user?.defaultDeliveryAddress) {
      setDeliveryAddress(user.defaultDeliveryAddress);
    }
    if (typeof user?.defaultDeliveryLat === "number") {
      setDeliveryLat(user.defaultDeliveryLat);
    }
    if (typeof user?.defaultDeliveryLng === "number") {
      setDeliveryLng(user.defaultDeliveryLng);
    }
  }, [showCartModal, meQuery.data]);

  const authMutation = useMutation({
    mutationFn: async (mode: "login" | "register") => {
      const mutation =
        mode === "login"
          ? `
            mutation ($phone: String!, $password: String!) {
              login(phone: $phone, password: $password) {
                ok
                user { id phone isAdmin }
              }
            }
          `
          : `
            mutation ($name: String!, $phone: String!, $password: String!) {
              register(name: $name, phone: $phone, password: $password) {
                ok
                user { id phone isAdmin }
              }
            }
          `;

      const variables =
        mode === "register"
          ? { name: authName, phone: authPhone, password: authPassword }
          : { phone: authPhone, password: authPassword };

      return gqlRequest(mutation, variables, { operationName: mode });
    },
    onSuccess: async () => {
      await meQuery.refetch();
      closeAuthModal();
      setMessage("Logged in successfully.");
    },
    onError: (error) => {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () =>
      gqlRequest(
        `
          mutation {
            logout { ok message }
          }
        `,
        undefined,
        { operationName: "logout" },
      ),
    onSuccess: async () => {
      await meQuery.refetch();
      setMessage("Logged out successfully.");
    },
  });

  const cartItems = useMemo(() => {
    return products
      .filter((product) => cart[product.id] > 0)
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: cart[product.id],
      }));
  }, [cart]);

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);
  const totalOrdersCount = useMemo(() => {
    const myOrderIds = new Set((meQuery.data?.myOrders || []).map((order) => order.id));
    const dedupGuestCount = guestOrderIds.filter((id) => !myOrderIds.has(id)).length;
    return myOrderIds.size + dedupGuestCount;
  }, [guestOrderIds, meQuery.data?.myOrders]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const items = cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));

      return gqlRequest<{ createOrder: { id: string } }>(
        `
          mutation CreateOrder($input: CreateOrderInput!) {
            createOrder(input: $input) { id }
          }
        `,
        {
          input: {
            items,
            deliveryAddress,
            deliveryLat,
            deliveryLng,
            deliveryDate,
            saveAsDefaultLocation,
          },
        },
        { operationName: "createOrder" },
      );
    },
    onSuccess: async (data) => {
      writeGuestOrderId(data.createOrder.id);
      setMessage(`Order Number #${data.createOrder.id} created successfully.`);
      setCart({});
      closeCheckoutModal();
      localStorage.removeItem("checkout_cart");
      await meQuery.refetch();
      const ids = readGuestOrderIds();
      setGuestOrdersCount(ids.length);
      setGuestOrderIds(ids);
    },
    onError: (error) => {
      setCheckoutError(error instanceof Error ? error.message : "Failed to create order");
    },
  });

  function updateCart(productId: string, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: quantity };
    });
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    if (authMode === "register" && authName.trim().length < 2) {
      setAuthError("Please enter your full name");
      return;
    }
    await authMutation.mutateAsync(authMode);
  }

  function resetAuthForm() {
    setAuthMode("login");
    setAuthName("");
    setAuthPhone("");
    setAuthPassword("");
    setShowAuthPassword(false);
    setAuthError(null);
  }

  function closeAuthModal() {
    setShowAuthModal(false);
    resetAuthForm();
  }

  function openAuthModal() {
    resetAuthForm();
    setShowAuthModal(true);
  }

  function resetCheckoutModalForm() {
    setCheckoutStep(1);
    setCheckoutError(null);
    setDeliveryAddress("");
    setDeliveryDate(getDefaultDeliveryDate());
    setSaveAsDefaultLocation(true);
    setDeliveryLat(27.6348674);
    setDeliveryLng(85.3405037);
    setIsDetectingLocation(false);
    setIsResolvingAddress(false);
  }

  function closeCheckoutModal() {
    setShowCartModal(false);
    resetCheckoutModalForm();
  }

  function openCartCheckout() {
    if (!cartItems.length) {
      setMessage("Add at least one product to continue checkout.");
      return;
    }

    const payload: CheckoutItem[] = cartItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }));
    localStorage.setItem("checkout_cart", JSON.stringify(payload));

    setCheckoutError(null);
    setCheckoutStep(1);
    setShowCartModal(true);
  }

  function goToNextStep() {
    if (checkoutStep === 1) {
      if (!cartItems.length) {
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

  async function placeOrder() {
    await createOrderMutation.mutateAsync();
  }

  async function updateAddressFromCoords(lat: number, lng: number) {
    setDeliveryLat(lat);
    setDeliveryLng(lng);
    setIsResolvingAddress(true);
    const resolved = await reverseGeocode(lat, lng);
    setDeliveryAddress(resolved);
    setIsResolvingAddress(false);
  }

  function useCurrentLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setCheckoutError("Location is not supported on this device/browser.");
      return;
    }

    setCheckoutError(null);
    setIsDetectingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateAddressFromCoords(position.coords.latitude, position.coords.longitude);
        setIsDetectingLocation(false);
      },
      (error) => {
        setCheckoutError(error.message || "Could not access current location.");
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fdf9ef,_#f5ead6_40%,_#efe1c6)] text-[#3c2c1e]">
      <SiteNavbar
        ordersCount={totalOrdersCount}
        isAdmin={meQuery.data?.me?.isAdmin}
        phone={meQuery.data?.me?.phone || null}
        onLogout={() => logoutMutation.mutate()}
        onLoginRegister={openAuthModal}
      />

      <section className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-[#dcc8a9] bg-[#fff8eb] p-8 shadow-[0_10px_30px_rgba(78,52,27,0.08)]">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9a6f3f]">Farm Fresh Dairy Market</p>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-[#4b3118] sm:text-5xl">Nanda Krishi Tatha Pasupalan</h2>
          <p className="mt-4 max-w-2xl text-base text-[#65492c] sm:text-lg">
            Add your dairy items and use the sticky cart button for quick checkout.
          </p>
          {message ? <p className="mt-2 text-sm text-[#b03e2f]">{message}</p> : null}
        </header>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const quantity = cart[product.id] || 0;
            return (
              <article
                key={product.id}
                className="group rounded-2xl border border-[#dcc8a9] bg-[#fffdf8] p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="inline-block rounded-full bg-[#f4e6d0] px-3 py-1 text-xs font-semibold text-[#8c6239]">{product.badge}</p>
                    <h3 className="mt-3 text-xl font-semibold text-[#4e341d]">{product.name}</h3>
                    <p className="mt-1 text-sm text-[#6d4f30]">{product.description}</p>
                  </div>
                  <span className="text-4xl" aria-hidden>
                    {product.image}
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#825a33]">{product.unit}</p>
                    <p className="text-lg font-bold text-[#3c2613]">{currency(product.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-[#d4bc99] bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => updateCart(product.id, quantity - 1)}
                      className="h-7 w-7 rounded-full bg-[#f2e3cb] text-lg font-bold text-[#6b4a2a]"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCart(product.id, quantity + 1)}
                      className="h-7 w-7 rounded-full bg-[#f2e3cb] text-lg font-bold text-[#6b4a2a]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={openCartCheckout}
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5a3a1f] to-[#7d552f] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(66,44,26,0.35)] transition hover:scale-[1.02]"
        aria-label="Open checkout cart"
      >
        <span className="text-lg" aria-hidden>
          🧺
        </span>
        <span>Checkout</span>
        {cartCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-[#5e9033] px-2 py-0.5 text-xs font-semibold text-white">
            {cartCount}
          </span>
        ) : null}
      </button>

      <SiteFooter locationUrl={locationUrl} storeContactNumber={storeContactNumber} whatsappUrl={whatsappUrl} />

      {showCartModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4" onClick={closeCheckoutModal}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">Checkout - Step {checkoutStep} of 3</h3>
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
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#e1cba7] p-3">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm">Rs. {item.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateCart(item.id, item.quantity - 1)} className="h-7 w-7 rounded-full bg-[#f2e3cb]">
                          -
                        </button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <button type="button" onClick={() => updateCart(item.id, item.quantity + 1)} className="h-7 w-7 rounded-full bg-[#f2e3cb]">
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 font-semibold">Subtotal: Rs. {subtotal.toFixed(2)}</p>
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
                    onClick={useCurrentLocation}
                    disabled={isDetectingLocation}
                    className="rounded-lg bg-[#4f7c2b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isDetectingLocation ? "Getting your location..." : "Use My Current Location"}
                  </button>
                  {isResolvingAddress ? <p className="text-sm text-[#6d4f30]">Finding address from map pin...</p> : null}
                </div>
                <p className="text-xs text-[#6d4f30]">3) Pick your exact location on map (tap/click on map)</p>
                <LocationPickerMap
                  lat={deliveryLat}
                  lng={deliveryLng}
                  onChange={({ lat, lng }) => updateAddressFromCoords(lat, lng)}
                />
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
                <p className="text-sm">Items: {cartItems.length}</p>
                <p className="text-sm">Delivery Date: {deliveryDate}</p>
                <p className="text-sm">Delivery Address: {deliveryAddress}</p>
                <p className="text-sm font-semibold">Total: Rs. {subtotal.toFixed(2)}</p>
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

      {showAuthModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onClick={closeAuthModal}>
          <div
            className="w-full max-w-md rounded-2xl border border-[#dcc8a9] bg-[#fff8eb] p-6 shadow-2xl transition-all duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[#4b3118]">{authMode === "login" ? "Login" : "Register"}</h3>
              <button
                type="button"
                onClick={closeAuthModal}
                className="rounded-md bg-[#f1e0c3] px-3 py-1 text-sm font-semibold text-[#5c4024]"
              >
                Close
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 rounded-xl border border-[#d8c09f] bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  authMode === "login" ? "bg-[#6f4b2b] text-white" : "text-[#6f4b2b] hover:bg-[#f6ead5]"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  authMode === "register" ? "bg-[#6f4b2b] text-white" : "text-[#6f4b2b] hover:bg-[#f6ead5]"
                }`}
              >
                Register
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleAuthSubmit}>
              {authMode === "register" ? (
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#5c4024]">Full Name</span>
                  <input
                    type="text"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="Your full name"
                    required={authMode === "register"}
                    className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#6f4b2b] focus:ring-2 focus:ring-[#6f4b2b]/20"
                  />
                </label>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#5c4024]">eSewa Number</span>
                <input
                  type="tel"
                  value={authPhone}
                  onChange={(event) => setAuthPhone(event.target.value)}
                  placeholder="98XXXXXXXX"
                  required
                  className="w-full rounded-lg border border-[#ccb08a] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#6f4b2b] focus:ring-2 focus:ring-[#6f4b2b]/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#5c4024]">Password</span>
                <div className="flex items-center gap-2 rounded-lg border border-[#ccb08a] bg-white px-2 py-1">
                  <input
                    type={showAuthPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Password"
                    minLength={6}
                    required
                    className="w-full bg-transparent px-1 py-1 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((prev) => !prev)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[#4f7c2b] hover:bg-[#eef7e3]"
                  >
                    {showAuthPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                disabled={authMutation.isPending}
                className="w-full rounded-lg bg-[#5e9033] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {authMutation.isPending ? "Please wait..." : authMode === "login" ? "Login" : "Register"}
              </button>
              {authError ? <p className="text-sm text-[#b03e2f]">{authError}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
