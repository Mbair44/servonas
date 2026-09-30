"use client";
import {useState} from 'react';
import {equipmentCostPerRental,type EquipmentAssumptions} from '@/lib/rentalEquipmentProfitability';
import {formatCents} from '@/lib/financial/priceBook';
export function RentalEquipmentCostFields({item}:{item?:EquipmentAssumptions}){
 const [stock,setStock]=useState(String(item?.stock_quantity??1));
 const [cost,setCost]=useState(item?.purchase_cost_cents==null?'':String(item.purchase_cost_cents/100));
 const [life,setLife]=useState(String(item?.expected_lifetime_rentals??''));
 const [resale,setResale]=useState(String((item?.salvage_value_cents??0)/100));
 const [enabled,setEnabled]=useState(item?.profitability_tracking_enabled??false);
 const perRental=equipmentCostPerRental({purchase_cost_cents:cost===''?null:Math.round(Number(cost)*100),expected_lifetime_rentals:life===''?null:Number(life),salvage_value_cents:Math.round(Number(resale)*100),profitability_tracking_enabled:enabled,stock_quantity:Number(stock)});
 return <fieldset className="wide rental-pricing-overrides"><legend>Cost &amp; Profitability</legend><label className="rental-check"><input type="checkbox" name="profitabilityTracking" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>Track allocated equipment cost</span></label><div className="rental-inventory-form-grid">
 <label>Purchase Cost<input name="purchaseCost" type="number" min="0" max="10000000" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/></label>
 <label>Stock quantity<input required name="stockQuantity" type="number" min="1" max="10000" value={stock} onChange={e=>setStock(e.target.value)}/></label>
 <label>Expected Lifetime Rentals<input name="expectedLifetimeRentals" type="number" min="1" max="10000000" step="1" value={life} onChange={e=>setLife(e.target.value)}/><small>An estimate per physical unit. Changes apply to future completed rentals.</small></label>
 <label>Expected Resale Value<input name="salvageValue" type="number" min="0" step="0.01" value={resale} onChange={e=>setResale(e.target.value)}/></label></div>
 <p>Estimated equipment cost per rental: <strong>{!enabled?'Tracking off':perRental==null?'Add valid purchase cost and lifetime rentals':formatCents(Math.round(perRental))}</strong></p>
 <small>Internal planning allocation, not a cash expense or customer charge. Purchase cost and resale value cover all units in this inventory group; lifetime rentals is per unit. Preview uses {stock||"—"} unit(s).</small></fieldset>;
}
