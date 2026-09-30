import type {SupabaseClient} from '@supabase/supabase-js';
import {formatCents,marginPercent} from '@/lib/financial/priceBook';
import {finalizeRentalProfitability} from '@/app/app/[businessSlug]/jobs/profitabilityActions';
export async function BookingEquipmentProfitability({db,businessId,bookingId,slug,jobId,canEdit}:{db:SupabaseClient;businessId:string;bookingId:string;slug:string;jobId:string;canEdit:boolean}){
 const {data:s,error}=await db.from('booking_profitability_snapshots').select('*').eq('business_id',businessId).eq('booking_id',bookingId).maybeSingle();
 if(error)return <section className="workspace-panel"><h2>Rental profitability</h2><p>Profitability data is unavailable.</p></section>;
 if(!s)return <section className="workspace-panel"><h2>Rental profitability</h2><p>Equipment allocations are captured when a paid rental is completed. Older completed bookings have no allocation snapshot.</p></section>;
 const revenue=Number(s.revenue_cents),equipment=Number(s.equipment_allocation_cents),cost=Number(s.operating_cost_cents),profit=s.contribution_profit_cents==null?null:Number(s.contribution_profit_cents);
 const full=profit==null||!s.equipment_complete?null:profit-equipment;
 const margin=(costs:number)=>{const value=marginPercent(revenue,costs);return value==null?'—':`${value}%`;};
 return <section className="workspace-panel"><h2>Rental profitability</h2><p>Saved at completion. These internal allocations never create a cash expense or customer charge.</p><dl>
 <div><dt>Net booking revenue (excluding sales tax)</dt><dd>{formatCents(revenue)}</dd></div>
 <div><dt>Cash/operating costs reviewed</dt><dd>{profit==null?'Not reviewed':formatCents(cost)}</dd></div>
 <div><dt>Contribution Profit</dt><dd>{profit==null?'Not reviewed':`${formatCents(profit)} · ${margin(cost)} margin`}</dd></div>
 <div><dt>Allocated Equipment Cost</dt><dd>{s.equipment_complete?formatCents(equipment):'Incomplete assumptions at completion'}</dd></div>
 <div><dt>Fully Loaded Profit</dt><dd>{full==null?'Not available':`${formatCents(full)} · ${margin(cost+equipment)} margin`}</dd></div></dl>
 <small>Discounts are already included in the saved booking total. Refunds recorded by capture time reduce revenue proportionally. Later refunds or cost corrections do not rewrite this snapshot.</small>
 {profit==null&&canEdit&&<form action={finalizeRentalProfitability.bind(null,slug,jobId,bookingId)} className="booking-settings-form"><p className="wide">Review actual operating costs once before finalizing. Recorded invoice internal-cost estimate: {formatCents(Number(s.source_snapshot?.invoiceCostEstimateCents??0))}. Reconcile that estimate into the categories below; it is not added a second time.</p>{[['labor','Labor'],['delivery','Delivery / vehicle costs'],['processingFees','Payment processing fees'],['other','Other variable costs']].map(([key,label])=><label key={key}>{label}<input name={key} required type="number" min="0" step="0.01" placeholder="0.00"/></label>)}<label className="wide toggle-row"><input required name="confirmed" type="checkbox"/>I reviewed all operating costs. Equipment purchases are excluded. Finalizing saves these amounts permanently.</label><button className="sv-button">Finalize profitability costs</button></form>}
 </section>;
}
