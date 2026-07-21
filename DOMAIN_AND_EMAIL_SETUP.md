# Servonas domain and email setup

Domain registration and mailbox creation require access to the owner's registrar and email-provider accounts, so they cannot be completed from the code package.

## Recommended setup
1. Register `servonas.com` at your preferred registrar.
2. Add the domain to the Servonas Vercel project and copy the DNS records Vercel provides into the registrar.
3. Create email with Google Workspace or Microsoft 365.
4. Recommended addresses: `hello@servonas.com`, `support@servonas.com`, `sales@servonas.com`, and `billing@servonas.com`.
5. Add the provider's MX, SPF, and DKIM DNS records. Add DMARC after mail is working.
6. Replace the `mailto:hello@servonas.com` contact form with Resend when transactional email is implemented.

## Suggested launch DNS
- Root/apex domain: follow Vercel's current project-specific DNS instruction.
- `www`: CNAME to the value shown by Vercel.
- Email: use only the MX/TXT values supplied by the selected email provider.
