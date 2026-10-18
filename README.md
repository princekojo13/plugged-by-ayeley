# Plugged by Ayeley

Plugged by Ayeley is a Ghanaian e-commerce store for UK-sourced products, including snacks, toiletries, beauty products, hair care, supplements, perfumes, and personal-care products.

The application is built with React, Vite, Tailwind CSS, and Supabase.

## Features

- Responsive online store and product search
- Shopping cart and guest checkout
- Moolre Mobile Money payment requests
- Pay on Delivery for eligible Greater Accra orders
- Free OpenStreetMap delivery pin selection and order tracking
- Product reviews and customer inquiries
- Secure administrator dashboard for products, orders, and store settings
- Supabase Row Level Security and Edge Functions

## Local development

Install packages with `npm install`, then start the development server with `npm run dev`.

## Service configuration

The delivery map uses OpenStreetMap tiles through Leaflet and does not require a Google Maps API key or billing. Keep the visible OpenStreetMap attribution in the map UI. The public OpenStreetMap tile service is community operated, so map tile availability is subject to its usage policy.

Moolre checkout is implemented server-side. Before turning it on in Store Settings, configure all four values as Supabase Edge Function secrets:

- `MOOLRE_API_USER`
- `MOOLRE_API_PUBKEY`
- `MOOLRE_ACCOUNT_NUMBER`
- `MOOLRE_WEBHOOK_SECRET`

`MOOLRE_BASE_URL` is optional and defaults to `https://api.moolre.com`. Point it at Moolre's sandbox only while testing. Set the Moolre payment callback URL to `https://mndwsmvfcjjrqpanzdkn.supabase.co/functions/v1/moolre-webhook`. Keep Moolre credentials in Supabase secrets; do not add them to this repository or the browser environment.

The public API key alone is not enough to process payments: the API username and wallet account number are also required. The webhook secret is required to verify Moolre callbacks. The checkout stays unavailable until Moolre is enabled in Store Settings, and the server returns a configuration error if any required secret is missing. Apply `supabase/sql/switch_online_payments_to_moolre.sql` and deploy the `create-order`, `moolre-payment`, and `moolre-webhook` Edge Functions before enabling online payments.

Out-of-stock active products remain visible and offer a pre-order option. The server rechecks live stock at checkout, enforces stock limits for in-stock products, and caps each out-of-stock pre-order at five units.
