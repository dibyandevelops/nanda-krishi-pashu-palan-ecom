"use client";

import Link from "next/link";

type SiteNavbarProps = {
  ordersCount?: number;
  isAdmin?: boolean;
  phone?: string | null;
  onLogout?: () => void;
  onLoginRegister?: () => void;
};

export default function SiteNavbar({
  ordersCount,
  isAdmin,
  phone,
  onLogout,
  onLoginRegister,
}: SiteNavbarProps) {
  return (
    <nav className="sticky top-0 z-40 border-b border-[#dcc8a9] bg-[#fff8eb]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#9a6f3f]">Nanda Krishi Tatha Pasupalan</p>
          <h1 className="text-lg font-semibold text-[#4b3118]">Dairy Market</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-semibold text-[#5c4024] hover:bg-[#f2e3cb]">
            Home
          </Link>
          <Link href="/orders" className="rounded-md px-3 py-2 text-sm font-semibold text-[#5c4024] hover:bg-[#f2e3cb]">
            {typeof ordersCount === "number" ? `Orders (${ordersCount})` : "Orders"}
          </Link>
          {isAdmin ? (
            <Link href="/admin" className="rounded-md px-3 py-2 text-sm font-semibold text-[#5c4024] hover:bg-[#f2e3cb]">
              Admin
            </Link>
          ) : null}

          {onLogout && phone ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md bg-[#5e9033] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4f7c2b]"
            >
              Logout ({phone})
            </button>
          ) : null}

          {!phone && onLoginRegister ? (
            <button
              type="button"
              onClick={onLoginRegister}
              className="rounded-md bg-[#5e9033] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4f7c2b]"
            >
              Login / Register
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
