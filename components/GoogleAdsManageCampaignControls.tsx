"use client";

import { useState } from "react";

type BudgetAction = (formData: FormData) => void | Promise<void>;
type StatusAction = () => void | Promise<void>;

type GoogleAdsManageCampaignControlsProps = {
 budgetDollars: string;
 budgetLabel: string;
 updateBudgetAction: BudgetAction;
 statusAction: StatusAction | null;
 statusLabel: string | null;
};

export function GoogleAdsManageCampaignControls({
 budgetDollars,
 budgetLabel,
 updateBudgetAction,
 statusAction,
 statusLabel,
}: GoogleAdsManageCampaignControlsProps) {
 const [isEditingBudget, setIsEditingBudget] = useState(false);

 return <div className="google-ads-manage-actions">
  {statusAction && statusLabel ? <form action={statusAction}>
   <button className="sv-button sv-secondary" data-loading-label={statusLabel}>{statusLabel}</button>
  </form> : null}
  {!isEditingBudget ? <div className="google-ads-budget-inline google-ads-budget-inline-readonly">
   <span className="google-ads-budget-readout"><strong>Budget:</strong> {budgetLabel}</span>
   <button type="button" className="sv-button sv-secondary" onClick={() => setIsEditingBudget(true)}>Change budget</button>
  </div> : <form className="google-ads-budget-inline google-ads-budget-inline-editor" action={async (formData) => {
   await updateBudgetAction(formData);
   setIsEditingBudget(false);
  }}>
   <label className="google-ads-budget-field">
    <span>Budget:</span>
    <span className="google-ads-input-with-unit">
     <span>$</span>
     <input aria-label="Daily budget dollars" name="dailyBudgetDollars" type="number" min="1" step="1" defaultValue={budgetDollars} />
     <small>/ day</small>
    </span>
   </label>
   <div className="google-ads-manage-inline-actions">
    <button className="sv-button" data-loading-label="Updating budget…">Save</button>
    <button type="button" className="sv-button sv-secondary" onClick={() => setIsEditingBudget(false)}>Cancel</button>
   </div>
  </form>}
 </div>;
}
