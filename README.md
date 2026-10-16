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

Configure these as Supabase Edge Function secrets before turning on Moolre in Store Settings:

- `MOOLRE_API_USER`
- `MOOLRE_API_PUBKEY`
- `MOOLRE_ACCOUNT_NUMBER`
- `MOOLRE_WEBHOOK_SECRET`

`MOOLRE_BASE_URL` is optional and defaults to `https://api.moolre.com`. Point it at Moolre's sandbox only while testing. Set the Moolre payment callback URL to `https://mndwsmvfcjjrqpanzdkn.supabase.co/functions/v1/moolre-webhook`. Keep Moolre credentials in Supabase secrets; do not add them to this repository or the browser environment.
