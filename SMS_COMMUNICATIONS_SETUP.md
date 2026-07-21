# Customer message previews (stub mode)

The communications feature is currently configured in **stub mode**. It generates and stores the exact text message, but it does not contact Twilio, send a text, or incur SMS charges.

## Setup

1. Run `supabase/customer_sms_communications.sql` once in Supabase SQL Editor.
2. Add these Production environment variables in Vercel:
   - `SMS_DELIVERY_MODE=stub`
   - `GOOGLE_REVIEW_URL`
   - `CRON_SECRET` (a long random value)
3. Redeploy.
4. Open `/admin#communications`, enter `ADMIN_ACCESS_KEY`, edit templates, and generate previews from a booking.

The Vercel cron still processes scheduled confirmation, reminder, and review messages, but in stub mode it only writes them to the communication log with status **skipped** and the note `Stub mode: preview generated; no text message was sent.`

## Enable live SMS later

When you are ready, add the three Twilio variables, change `SMS_DELIVERY_MODE` to `live`, and redeploy:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

No code changes are required.

Supported template variables:
`{customerName}`, `{bookingNumber}`, `{eventDate}`, `{items}`, `{depositPaid}`, `{balanceDue}`, `{deliveryAddress}`, `{receiptLink}`, `{stripeReceiptLink}`, `{googleReviewLink}`.
