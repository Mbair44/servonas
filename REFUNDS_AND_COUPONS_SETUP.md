# Stripe refunds and coupon codes

## 1. Run the Supabase migration

Open Supabase > SQL Editor and run:

`supabase/refunds_and_stripe_coupons.sql`

## 2. Update the Stripe webhook

Add this event to the existing endpoint:

- `charge.refunded`

Keep the existing checkout events enabled.

## 3. Create coupon codes in Stripe

In Stripe, create a Coupon and then a Promotion Code. Checkout now displays an "Add promotion code" field automatically.

Important: the checkout collects only the 25% deposit, so Stripe applies promotion codes to that deposit charge. Percentage codes therefore discount the deposit percentage; fixed-dollar codes subtract directly from the deposit. The discount is saved on the booking and the remaining balance is recalculated so the customer receives the same dollar savings overall.

## 4. Refunds

Open `/admin`, scroll to Stripe refunds, enter `ADMIN_ACCESS_KEY`, select a paid booking, and issue either a full or partial refund.

- Partial refund: booking remains confirmed unless you choose to cancel it.
- Full refund: booking is marked refunded and its inventory date is released.
- Deposits remain non-refundable by policy; this control is for approved exceptions.

## 5. Deploy

Copy the project over your existing Git checkout, then run:

```bash
git add .
git commit -m "Add Stripe refunds and promotion codes"
git push
```
