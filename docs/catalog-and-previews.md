# Catalog and preview operations

The canonical catalog is `gmf-site/content/design-manifest.json` (schema version 2). Each exact garment/color/artwork/size option has its own immutable SKU and integer-cent price. A variant can be purchased only when its product is published and the variant is available, positively priced, and has an approved image. Draft products stay out of the public catalog. The server calculates checkout prices from its generated exact-SKU catalog.

`npm run build` deterministically generates the browser catalog, Stripe sync input, and bundled server catalog. Building never creates Stripe objects or generates images. Catalog publication belongs to the admin's normal publish action; approving a preview alone does not publish a product.

Deploy through Netlify's remote Linux Git build so dependency installation supplies Linux Sharp/libvips binaries. The current CommonJS functions use Netlify's default ZISI dependency copying; `external_node_modules = ["sharp"]` also protects Sharp if esbuild is selected later. Do not deploy a locally packaged macOS dependency tree as the image worker. The lockfile includes Linux optional dependencies, which must remain enabled during installation.

Use Node 22 for both build and Functions runtime. `netlify.toml` pins `NODE_VERSION = "22"`; set `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` through Netlify's environment settings and redeploy (this runtime setting does not belong in `netlify.toml`). The installed Supabase client initializes its Realtime transport even for storage/database calls and requires native WebSocket support, which is unavailable by default on Node 20. `package.json` therefore requires Node 22 or newer for local checks too.

## Configuration

Apply `supabase/migrations/20261019084207_gmf_private_assets_mockup_jobs.sql` to the existing store's Supabase project. It creates server-only tables `gmf_assets` and `gmf_mockup_jobs`, private buckets `gmf-originals` and `gmf-previews-private`, and public bucket `gmf-previews`. Keep the service role key server-side. Client roles have no table access.

The 512 MiB limit in the schema and upload API is an application ceiling; the Supabase project's global file-size limit and storage allowance must also permit each upload. The existing Free project's 50 MiB global limit rejected the large-original test, and the complete USB archive exceeds its storage allowance. A larger bucket setting cannot override that project limit. Keep the verified local original archive until sufficient cloud storage is authorized and the upload inventory confirms completion.

Netlify Functions require these environment variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing store database and private storage. |
| `OPENAI_API_KEY` | Dedicated server-only OpenAI key authorized for this store. |
| `GMF_MOCKUP_WORKER_SECRET` | Random server-only secret of at least 32 characters for signed worker dispatch. |
| `OPENAI_IMAGE_MODEL` | Optional override; default `gpt-image-2.5-sunburst`. |
| `DEPLOY_URL` | Netlify-provided deploy URL; worker requests stay on the current deploy. |
| `SITE_URL` or `URL` | Worker URL fallback outside a deploy-specific environment. |

Missing image credentials return a clear 503 response. Originals and catalog editing remain usable. Never put credentials in browser config, repository files, or support messages. For deploy previews sharing the production database, use mocked image tests unless actual generation is intended: the API uses the configured account and can incur charges.

## Original upload and previews

1. An authenticated admin requests a signed upload using filename, byte size, and SHA-256. The browser uploads directly to private storage, then asks the server to verify the full file checksum. Files are limited to 512 MiB. Verified duplicates reuse the same asset; failed attempts retain their storage history and use a new path. PNG, JPEG, WebP, TIFF, and PSD originals are accepted by the UI/API. PSD files require a separate PNG or TIFF working copy for generation.
2. Select a verified original, garment, and up to eight colors. Optional inversion requires explicit original garment and print colors and creates one extra preview with those roles swapped. No generated preview becomes another generation's source.
3. The signed background worker claims the saved job atomically and generates one image per invocation. It persists the image privately before continuing. Completed previews survive failures. Repeating the same source and settings reuses the job; retry processes only unfinished/failed previews, with at most three retries and one active job per admin.
4. Review text, artwork, garment colors, print placement, and inversion before approving. Only selected completed previews are copied to public storage. Apply the approved images to sellable variants, set per-size prices and availability, then publish the catalog through the admin editor.

Original downloads require admin authentication and use short-lived signed URLs. Unapproved previews use temporary signed URLs. Public approved image paths are immutable; source files are never overwritten. A saved image found after a worker interruption is reused without another provider call. A provider request interrupted before its result is saved may still have been billed; retry only after reviewing the saved job status.

## Recovery and verification

If dispatch fails, the saved job reports a retryable partial state. If a running worker stops, refreshing the job after 16 minutes marks it retryable. Fix missing environment configuration before retrying. Failed checksum verification requires uploading the correct original again. Original files and generated previews are not automatically deleted.

Run `node --test tests/catalog.test.js tests/mockup-jobs.test.js` for deterministic catalog, cart reconciliation, private upload/checksum, authorization, job deduplication, partial retry, dispatch replay, recovery, and approval checks. These tests use mocked storage and image generation and do not make paid API calls.
