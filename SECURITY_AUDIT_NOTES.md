# Plugged by Ayeley — Security Audit Notes

This cleaned project archive intentionally excludes `.env.local`, `.env.loacl`, `.git`, `node_modules`, and `dist`.

Keep the real `.env.local` only on the developer machine. Never put Supabase service-role keys, Moolre API credentials, OpenAI API keys, or other server secrets in Vite `VITE_*` variables.

Admin authorization must continue to rely on Supabase Auth and database RLS. The frontend admin route is only a UI guard.

The application-level two-hour admin timer is a client-side convenience timeout, not the security boundary.

The following server-side Edge Functions still need their deployed source reviewed separately before the whole system can be certified secure:
- admin-login
- create-order
- moolre-payment
- moolre-webhook
- ai-assistant
- create-review
- create-contact
- track-order
- create-wholesale-inquiry
