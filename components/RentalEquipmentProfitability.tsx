import {equipmentProfitability,type EquipmentAssumptions,type EquipmentProfitabilityRow} from '@/lib/rentalEquipmentProfitability';
import {formatCents} from '@/lib/financial/priceBook';
export function RentalEquipmentProfitability({item,row}:{item:EquipmentAssumptions;row?:EquipmentProfitabilityRow}){
 const p=equipmentProfitability(item,row),money=(n:number|null)=>n==null?'Not available':formatCents(Math.round(n));
 const estimated=row?.estimated_contribution_cents==null?null:Number(row.estimated_contribution_cents),estimatedFull=row?.estimated_fully_loaded_cents==null?null:Number(row.estimated_fully_loaded_cents),excluded=Number(row?.excluded_equipment_items??0),refundUnits=Number(row?.refund_review_units??0);
 return <section className="rental-performance"><header><strong>Cost &amp; Profitability</strong>{p.recoveredPercent!=null&&p.recoveredPercent>=100&&<span>Purchase cost recovered from reviewed contribution</span>}</header><div className="rental-performance-metrics">
 <div><span>Completed physical-unit rentals</span><strong>{p.completed}{p.expected!=null?` / ${p.expected} expected`:''}</strong></div>
 <div><span>Expected life used</span><strong>{p.lifePercent==null?'Not configured':`${p.lifePercent.toFixed(1)}%`}</strong></div>
 <div><span>Expected remaining rentals</span><strong>{p.remainingRentals??'Not configured'}</strong></div>
 <div><span>Equipment cost per unit rental</span><strong>{item.profitability_tracking_enabled?money(p.perRental):'Tracking off'}</strong></div>
 <div><span>Revenue since tracking began</span><strong>{money(row?.revenue_cents==null?null:Number(row.revenue_cents))}</strong></div>
 <div><span>{p.contribution==null?'Estimated contribution profit':'Reviewed contribution profit'}</span><strong>{money(p.contribution??estimated)}</strong></div>
 <div><span>Equipment cost allocated</span><strong>{money(p.allocated)}</strong></div>
 <div><span>Equipment cost remaining to allocate</span><strong>{money(p.remainingAllocation)}</strong></div>
 <div><span>{p.contribution==null?'Estimated fully loaded profit':'Reviewed fully loaded profit'}</span><strong>{money(p.contribution==null?estimatedFull:row?.fully_loaded_cents==null?null:Number(row.fully_loaded_cents))}</strong></div>
 <div><span>Purchase cost recovered from reviewed contribution</span><strong>{p.recoveredPercent==null?'Not available':`${p.recoveredPercent.toFixed(1)}%`}</strong></div>
 <div><span>Rentals until equipment cost recovered</span><strong>{p.rentalsUntilRecovered??'Needs positive contribution from at least 3 reviewed rentals'}</strong></div></div>
 <p>{p.tracked} of {p.completed} completed unit rentals have equipment snapshots; {p.reviewed} have reviewed operating costs. Unreviewed/historical profit is unknown, not zero.{excluded?` Equipment allocation excludes ${excluded} tracked item${excluded===1?'':'s'}.`:''}{refundUnits?` ${refundUnits} unit rental${refundUnits===1?' has':'s have'} refunds that are reflected in current revenue; review profitability if the refund changed costs.`:''} Lifetime revenue above retains the existing report.</p>
 </section>;
}
