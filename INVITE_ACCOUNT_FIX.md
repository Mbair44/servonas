# Employee invitation account fix

Replace the included files in the Servonas project and deploy.

The invitation flow now:

1. Detects when the owner is still signed in.
2. Offers to sign out and either create or log into the invited employee account.
3. Preserves the invitation token and invited email through signup/login.
4. Returns to the invitation after email verification.
5. Verifies the signed-in email matches the invited email before accepting.

No new SQL migration is required.
