"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createEmergencyAssistedBooking} from "@/app/app/[businessSlug]/assisted-booking/actions";
import {assistedMoneyCents,assistedRentalTotals,type AssistedRentalItem} from "@/lib/assistedRentalItems";

type Row={key:number;id:string;quantity:string;price:string};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function AssistedRentalBookingForm({slug,items,customers,disclosure,requestKey,depositPercent}:{slug:string;items:AssistedRentalItem[];customers:{id:string;label:string}[];disclosure:string;requestKey:string;depositPercent:number}){
 const router=useRouter(),submitting=useRef(false),nextKey=useRef(1);
 const [rows,setRows]=useState<Row[]>([{key:0,id:'',quantity:'1',price:'0.00'}]);
 const [override,setOverride]=useState(false),[subtotal,setSubtotal]=useState('0.00');
 const [discount,setDiscount]=useState('0'),[delivery,setDelivery]=useState('0'),[tax,setTax]=useState('0');
 const [depositOverride,setDepositOverride]=useState(false),[deposit,setDeposit]=useState('0');
 const [error,setError]=useState(''),[pending,setPending]=useState(false);
 const update=(key:number,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
 let totals:ReturnType<typeof assistedRentalTotals>|null=null;
 let lines:{inventoryItemId:string;quantity:number;unitPriceCents:number}[]=[];
 try{
  lines=rows.map(row=>({inventoryItemId:row.id,quantity:Number(row.quantity),unitPriceCents:assistedMoneyCents(row.price)}));
  if(lines.some(line=>!Number.isSafeInteger(line.quantity)||line.quantity<1))throw Error('Invalid quantity');
  totals=assistedRentalTotals(lines,{discount:assistedMoneyCents(discount),delivery:assistedMoneyCents(delivery),tax:assistedMoneyCents(tax),deposit:0,...(override?{subtotalOverride:assistedMoneyCents(subtotal)}:{})});
 }catch{/* Invalid/incomplete input remains visible for correction, never submitted as zero. */}
 const depositValue=depositOverride?deposit:totals?(Math.round(totals.total*depositPercent/100)/100).toFixed(2):'';
 return <form className="booking-settings-form" onSubmit={async event=>{
  event.preventDefault();if(submitting.current)return;
  submitting.current=true;setPending(true);setError('');
  const form=new FormData(event.currentTarget);let navigating=false;
  try{const result=await createEmergencyAssistedBooking(slug,form);if(result.error)setError(result.error);else if(result.url){navigating=true;router.push(result.url);return;}}
  catch{setError('Could not complete the booking. Your entries are preserved; retry to continue the same request.');}
  finally{if(!navigating){submitting.current=false;setPending(false);}}
 }}>
  <input type="hidden" name="requestKey" value={requestKey}/>
  <input type="hidden" name="rentalItems" value={JSON.stringify(lines)}/>
  <label>Existing customer<select name="existingCustomer"><option value="">Enter customer below</option>{customers.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select><small>When selected, the saved customer details are used.</small></label>
  <label>First name<input name="firstName"/></label><label>Last name<input name="lastName"/></label>
  <label>Phone<input name="phone" type="tel"/></label><label>Email<input name="email" type="email"/></label>
  <label className="wide toggle-row"><input name="smsConsent" type="checkbox" value="true"/><span><b>Customer explicitly agrees to receive booking-related text messages</b><small>{disclosure}</small></span></label>
  <label>Rental date<input required name="rentalDate" type="date" min={new Date().toISOString().slice(0,10)}/></label>
  <fieldset className="wide assisted-rental-items"><legend>Rental items</legend>
   {rows.map((row,index)=>{const item=items.find(item=>item.id===row.id);let lineTotal='—';try{if(Number.isSafeInteger(Number(row.quantity))&&Number(row.quantity)>0)lineTotal=money(assistedMoneyCents(row.price)*Number(row.quantity));}catch{/* Keep incomplete input unformatted. */}
    return <div className="assisted-rental-line" key={row.key}>
     <label>Rental {index+1}<select required value={row.id} onChange={e=>{const selected=items.find(item=>item.id===e.target.value);update(row.key,{id:e.target.value,price:selected?(selected.daily_price_cents/100).toFixed(2):'0.00',quantity:'1'});}}><option value="">Choose rental</option>{items.map(item=><option key={item.id} value={item.id} disabled={item.stock_quantity<1||rows.some(other=>other.key!==row.key&&other.id===item.id)}>{item.name}</option>)}</select></label>
     <label>Unit price<input aria-label={`Unit price for rental ${index+1}`} required type="number" min="0" step="0.01" value={row.price} onChange={e=>update(row.key,{price:e.target.value})}/></label>
     <label>Quantity<input aria-label={`Quantity for rental ${index+1}`} required type="number" min="1" step="1" max={item?.allow_quantity?item.stock_quantity:1} value={row.quantity} onChange={e=>update(row.key,{quantity:e.target.value})}/></label>
     <div><small>Line total</small><p>{lineTotal}</p></div>
     <button type="button" className="text-button" aria-label={`Remove rental ${index+1}`} onClick={()=>setRows(current=>current.filter(other=>other.key!==row.key))}>Remove</button>
    </div>;
   })}
   <button type="button" className="button secondary" onClick={()=>setRows(current=>[...current,{key:nextKey.current++,id:'',quantity:'1',price:'0.00'}])}>+ Add another rental</button>
   <p>For more than one of the same rental, increase its quantity. Unit prices start at the catalog price; confirm any date-specific or agreed pricing before sending.</p>
  </fieldset>
  <label>Address<input required name="address"/></label><label>City<input name="city" defaultValue="Mesa"/></label><label>ZIP<input required name="zip"/></label>
  <label>Rental subtotal<input name="subtotal" type="number" min="0" step="0.01" required readOnly={!override} value={override?subtotal:totals?(totals.itemSubtotal/100).toFixed(2):''} onChange={e=>setSubtotal(e.target.value)}/></label>
  <label className="toggle-row"><input name="overrideSubtotal" type="checkbox" value="true" checked={override} onChange={e=>{setSubtotal(((totals?.itemSubtotal??0)/100).toFixed(2));setOverride(e.target.checked);}}/>Override subtotal</label>
  <label>Discount<input required name="discount" type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
  <label>Delivery<input required name="delivery" type="number" min="0" step="0.01" value={delivery} onChange={e=>setDelivery(e.target.value)}/></label>
  <label>Tax<input required name="tax" type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)}/></label>
  <label>Total<input readOnly value={totals?money(totals.total):'Check amounts'}/><small>Rental subtotal − discount + delivery + tax.</small></label>
  <label>Deposit due<input required name="deposit" type="number" min="0.01" step="0.01" readOnly={!depositOverride} value={depositValue} onChange={e=>setDeposit(e.target.value)}/><small>{depositPercent}% of the full booking total unless overridden.</small></label>
  <label className="toggle-row"><input type="checkbox" checked={depositOverride} onChange={e=>{setDeposit(depositValue);setDepositOverride(e.target.checked);}}/>Override deposit</label>
  {error&&<p className="workspace-notice error wide" role="alert">{error}</p>}
  <button className="button" disabled={pending||!totals||!rows.length||rows.some(row=>!row.id)}>{pending?'Creating booking…':'Create & Send Payment Link'}</button>
  <Link href={`/app/${slug}/jobs`}>Cancel</Link>
 </form>;
}
