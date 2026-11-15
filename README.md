# GMF Productions Website

Official website for **GMF Productions** — music, merch, and live integrations powered by Stripe, Supabase, and Netlify.

## Stack

| Service | Purpose |
|---------|---------|
| **Netlify** | Hosting, serverless functions, CI/CD |
| **Stripe** | Secure merch checkout |
| **Supabase** | Newsletter, contact, booking, order storage |
| **YouTube Data API** | Live video feed (optional) |

## Quick Start

```bash
npm install
cp .env.example .env   # fill in your keys locally
npm run dev            # netlify dev — functions + site at :8888
```

## Deploy to Netlify

1. Push this repo to GitHub
2. [Connect the repo in Netlify](https://app.netlify.com)
3. Add environment variables from `.env.example` in **Site settings → Environment variables**
4. Run `supabase/schema.sql` in your Supabase SQL editor
5. Deploy — build command: `npm run build`, publish directory: `gmf-site`

## Environment Variables

See `.env.example` for the full list. Required for live features:

- `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` — checkout
- `STRIPE_WEBHOOK_SECRET` — order confirmation webhook (`/.netlify/functions/stripe-webhook`)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — forms & orders
- `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID` — auto-pull latest videos (optional)

## Stripe Webhook

In Stripe Dashboard → Webhooks, add endpoint:

```
https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
```

Events: `checkout.session.completed`

## Media Personalization

Edit `gmf-site/content/media.json` to update:

- Spotify track IDs
- YouTube video IDs or search fallbacks
- Social profile URLs
- Hero imagery

When `YOUTUBE_API_KEY` is set, the `/youtube-feed` function overrides video list with live channel data.

## Project Structure

```
├── netlify/functions/     # Stripe, Supabase, YouTube API
├── gmf-site/              # Static site (publish root)
│   ├── index.html         # Main landing page
│   ├── content/media.json # Curated music & video data
│   └── scripts/           # Cart, checkout, forms, media
├── supabase/schema.sql
└── netlify.toml
```

## Bulk custom apparel requests

`/bulk-orders.html` collects garment/color lines, quantities by size, design preferences,
an optional artwork link, delivery details and customer contact information. It is a
quote request, not a retail checkout: pricing and production dates are confirmed separately.

The `bulk-order` Netlify function validates the request and writes it to the existing
Supabase `public.contact_messages` inbox with `slug = 'bulk-apparel-order'`. Filter by
that slug to review requests. Contact details use `visitor_name`, `visitor_email`, and
`visitor_phone`; `message` contains the request reference and full readable breakdown.
These are the live inbox columns (the older bootstrap schema above uses different
contact column names). No new table or public database permission is required.
The function uses the existing server-side Supabase environment variables.

Customers see confirmation only after saving succeeds and can download their request
summary. This flow does not send email notifications or confirmations. Artwork is
provided as a shareable link; this page does not accept file uploads. Review and follow
up from the existing inbox. Run `npm test` and `npm run build` before deploying.

## License

&copy; GETTIN' MONEY FOREVER Productions LLC
