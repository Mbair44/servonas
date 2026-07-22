# Servonas Epic 4.5 hotfix

This fixes:

1. Vercel build error: `useState is not defined` in `booking-settings-form.tsx`.
2. Signup clicks that produce no network request because browser-native validation silently blocks submission.

## Apply

From your Servonas project root:

1. Copy `components/AuthForm.tsx` from this hotfix over your existing file.
2. Copy `apply-hotfix.mjs` into the project root.
3. Run:

```bash
node apply-hotfix.mjs
```

4. Commit and push:

```bash
git add -A
git commit -m "Fix Epic 4.5 build and signup submission"
git push
```

The script only adds the missing React `useState` import. The AuthForm replacement adds `noValidate`, so validation is handled by the existing server action and clicking Create account always submits a request.
