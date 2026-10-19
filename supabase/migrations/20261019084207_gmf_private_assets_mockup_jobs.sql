-- Server-only original assets and durable image-preview jobs.
create table if not exists public.gmf_assets (
  id text primary key,
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 536870912),
  bucket text not null default 'gmf-originals' check (bucket = 'gmf-originals'),
  storage_path text not null unique,
  upload_history jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_by text not null,
  product_id text,
  error text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create table if not exists public.gmf_mockup_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  product_id text not null,
  source_asset_id text not null references public.gmf_assets(id),
  source_sha256 text not null,
  request_hash text not null unique,
  settings jsonb not null,
  previews jsonb not null default '[]',
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'partial', 'failed')),
  dispatch_token uuid not null default gen_random_uuid(),
  lease_token uuid,
  retry_count integer not null default 0 check (retry_count between 0 and 3),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gmf_one_active_job_per_owner on public.gmf_mockup_jobs(owner_id) where status in ('queued', 'running');
alter table public.gmf_assets enable row level security;
alter table public.gmf_mockup_jobs enable row level security;
revoke all on public.gmf_assets, public.gmf_mockup_jobs from anon, authenticated;
grant select, insert, update, delete on public.gmf_assets, public.gmf_mockup_jobs to service_role;
-- No client RLS policies: Netlify verifies the administrator and uses its private service key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('gmf-originals', 'gmf-originals', false, 536870912, array['image/png','image/jpeg','image/gif','image/webp','image/tiff','image/vnd.adobe.photoshop','application/octet-stream']),
 ('gmf-previews-private', 'gmf-previews-private', false, 20971520, array['image/png','image/webp']),
 ('gmf-previews', 'gmf-previews', true, 20971520, array['image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
