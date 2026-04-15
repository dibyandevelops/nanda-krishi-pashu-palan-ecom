# Nanda Krishi Tatha Pasupalan E-Commerce

Single-page dairy products e-commerce web app built with Next.js, TypeScript, and Tailwind CSS.

## Features

- Market-style single-page storefront UI
- Dairy products catalog with cart interactions
- Neon PostgreSQL-backed phone/password auth (eSewa number based)
- Navbar with modal-based login/register
- React Query + GraphQL integration for frontend API calls
- Map-based delivery location picker (OpenStreetMap) and default location saving
- Delivery date validation for dairy freshness (only next 3 days)
- Structured checkout flow:
  - Home page: add items + proceed to checkout
  - Orders page: create-order modal (3-step flow)
  - Final step: quick-login modal if not authenticated
- Orders page with payment actions moved to order list
- eSewa payment integration per order
- Order confirmed only after successful payment
- Convincing in-app confirmation alert after paid order
- Admin panel for all orders and payment statuses
- Mobile-friendly responsive layout

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Setup environment:

```bash
cp .env.example .env.local
```

3. In `.env.local`, set:

- `DATABASE_URL` to your Neon Postgres connection string
- `AUTH_SECRET` to a long random string
- eSewa credentials (`ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`)

4. Run locally:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Auth + Checkout Flow

- Register/login via navbar modal using eSewa number + password.
- Create order from Orders page checkout modal with:
  - selected cart items
  - delivery address
  - map-selected location
  - delivery date
  - optional “save default location”
- If unauthenticated at final step, quick-login modal appears and continues checkout.
- Payment is done from `/orders` page per order (not directly from cart).
- Orders are marked `CONFIRMED` only when payment is `PAID`.

## Admin Login

- Phone: `9847337394`
- Password: `1Nanda@123`
- Login from navbar modal, then open `Admin Panel` from navbar.

## Project Structure

- `app/page.tsx`: single-page storefront
- `components/storefront.tsx`: product/cart/auth/order-creation UI
- `components/storefront.tsx`: product/cart/checkout handoff UI
- `components/location-picker-map.tsx`: map-based location picker
- `app/orders/page.tsx`: customer orders, checkout modal, payment page
- `lib/products.ts`: shared product catalog
- `app/admin/page.tsx`: admin panel UI
- `app/api/graphql/route.ts`: GraphQL endpoint (auth/orders/admin/payment)
- `lib/db.ts`: Neon DB client and schema bootstrap
- `lib/auth.ts`: password and session helpers
- `lib/esewa.ts`: signing and payload helpers
- `app/providers.tsx`: TanStack React Query provider
