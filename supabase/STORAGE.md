# Supabase storage setup (event banners)

Gatefy uses Supabase Storage for event banner images. Follow these steps to enable it.

## 1. Environment variables

In `.env.local` (and in your deployment env), set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

- **NEXT_PUBLIC_SUPABASE_URL**: Project URL from [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API.
- **SUPABASE_SERVICE_ROLE_KEY**: Service role key from the same page (under "Project API keys"). Use this only on the server; never expose it in client code.

## 2. Create the storage bucket and policies

In Supabase Dashboard → **SQL Editor**, run the contents of `schema.sql` (or at least the storage section at the bottom).

That will:

- Create the **event-banners** bucket (public, 5MB max file size, images only).
- Add RLS policies so:
  - Anyone can **read** (view) banner images.
  - The app (using the service role key) can **upload**, **update**, and **delete** banners.

### Alternative: create bucket in the UI

1. Go to **Storage** in the sidebar.
2. Click **New bucket**.
3. Name: `event-banners`.
4. Enable **Public bucket** (so banner URLs work without auth).
5. Optional: set **File size limit** (e.g. 5MB) and **Allowed MIME types** (e.g. `image/jpeg`, `image/png`, `image/webp`, `image/gif`).
6. Create the bucket, then in **Policies** add:
   - **Select**: allow public read for `bucket_id = 'event-banners'`.
   - **Insert / Update / Delete**: allow for your app (e.g. via service role; if you use auth, you can restrict to authenticated users).

## 3. Verify

- Restart your Next.js dev server after changing env vars.
- Create an event and upload a banner image. The image should appear and the event’s `banner_url` should point to a Supabase storage URL.

If uploads fail with "Banner upload not configured", check that both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. If you see storage/RLS errors, ensure the bucket exists and the policies from `schema.sql` have been applied.
