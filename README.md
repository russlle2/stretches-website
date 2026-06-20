# GMF Productions Website

Official website for **GMF Productions** (Joshua Miller) — music, merch, and live integrations powered by Stripe, Supabase, and Netlify.

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

## License

&copy; GETTIN' MONEY FOREVER Productions LLC
