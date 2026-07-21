# Admin dashboard setup

The dashboard is available at:

http://localhost:3000/admin

## Required environment variable

Add the following line to `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=PASTE_YOUR_PRIVATE_SERVICE_ROLE_KEY_HERE
```

Find it in Supabase under **Project Settings → API Keys**. Depending on the dashboard version it may be labeled **service_role**, **Secret key**, or listed under legacy API keys.

Important:

- Never send this key to anyone.
- Never use a variable beginning with `NEXT_PUBLIC_` for this key.
- Never commit `.env.local` to GitHub.

After adding the key, stop the server with `Control + C`, run `npm run dev` again, and open `/admin`.

The current admin dashboard is intended for local development. Add admin authentication before deploying it publicly.
