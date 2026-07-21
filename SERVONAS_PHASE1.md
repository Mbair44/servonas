# Servonas Phase 1

## Included
- Servonas visual identity and scalable SVG logos
- Marketing pages: home, features, pricing, industries, demo, and contact
- Three-step Create Your Business onboarding wizard
- Tenant workspace preview at `/app/[businessSlug]`
- Multi-tenant Supabase foundation in `supabase/servonas_multi_tenant_foundation.sql`
- Existing NRS booking, inventory, images, payments, admin, receipt, refund, coupon, and SMS routes retained
- Domain and email setup checklist in `DOMAIN_AND_EMAIL_SETUP.md`

## Run locally
```bash
npm install
npm run dev
```

## Deploy
1. Create a new Vercel project from this folder.
2. Copy the environment variables used by the NRS project.
3. Run `supabase/servonas_multi_tenant_foundation.sql` in a development Supabase project first.
4. Connect the Servonas domain after deployment.

## Important implementation boundary
The database foundation is tenant-aware, but the legacy NRS CRUD queries still need to be updated one endpoint at a time to require and filter by `business_id` before multiple paying customers share production data. The included `lib/tenant.ts` starts that migration. Auth and Stripe subscription billing are intentionally left as the next milestone rather than simulated.
