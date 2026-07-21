# Epic 3 deployment package (no test dependencies)

This package contains the complete Epic 3 application and Supabase migration, but removes Vitest and Playwright so the existing `pnpm-lock.yaml` remains compatible with Vercel's frozen-lockfile install.

## Deploy

Copy these files over the current project, then commit and push:

```bash
git add .
git commit -m "Deploy Epic 3 without test dependencies"
git push
```

No local package installation is required for this fix.

## Important cleanup

The package removes these files from the Epic 3 test-enabled release:

- `tests/`
- `vitest.config.ts`
- `playwright.config.ts`

If those files are already in your repository, delete them before committing.
