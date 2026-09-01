"use client";

import { useState } from "react";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function GoogleAdsBidAdjustment({ action, currentBidDollars, recommendedBidDollars, dailyBudgetLabel }: {
 action: (formData: FormData) => void | Promise<void>;
 currentBidDollars: number;
 recommendedBidDollars: number;
 dailyBudgetLabel: string;
}) {
 const [value, setValue] = useState(recommendedBidDollars.toFixed(2));
 const parsed = Number(value);
 const valid = /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(parsed) && parsed > 0;
 return <details className="google-ads-health-confirm" open>
  <summary>Adjust maximum bid</summary>
  <form action={action}>
   <dl className="google-ads-bid-values"><div><dt>Current maximum bid</dt><dd>{money(currentBidDollars)}</dd></div><div><dt>Recommended starting bid</dt><dd>{money(recommendedBidDollars)}</dd></div></dl>
   <label>Maximum bid per click<input name="maximumBidDollars" inputMode="decimal" pattern="^\d+(?:\.\d{1,2})?$" type="text" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9.]/g, ""))} aria-describedby="maximum-bid-help" required /></label>
   <p id="maximum-bid-help">Your maximum bid is the most Google is allowed to bid for a click. Google may charge less than this amount.</p>
   <p><strong>New maximum bid: {valid ? money(parsed) : "Enter a valid dollar amount"}</strong></p>
   {valid && parsed < 0.5 ? <p className="google-ads-bid-warning">You can use this amount, but bids below $0.50 may have difficulty competing.</p> : null}
   <p>Your daily campaign budget of {dailyBudgetLabel} still limits how much you can spend overall.</p>
   <input type="hidden" name="confirmCpcFix" value="apply" />
   <button className="sv-button" disabled={!valid}>Update maximum bid</button>
  </form>
 </details>;
}
