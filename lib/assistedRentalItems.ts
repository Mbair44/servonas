export type AssistedRentalItem={id:string;name:string;daily_price_cents:number;allow_quantity:boolean;stock_quantity:number};
export type AssistedRentalLine={inventoryItemId:string;quantity:number;unitPriceCents:number};

export function assistedMoneyCents(value:unknown):number{
 const text=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Enter a valid amount with at most two decimal places.');
 const [whole,fraction='']=text.split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>2147483647)throw new Error('Amount is too large.');
 return cents;
}

export function normalizeAssistedRentalLines(lines:AssistedRentalLine[],items:AssistedRentalItem[]){
 if(!Array.isArray(lines)||!lines.length)throw new Error('Choose at least one rental.');
 const result:AssistedRentalLine[]=[];
 for(const line of lines){
  const item=items.find(item=>item.id===line?.inventoryItemId);
  if(!item)throw new Error('A selected rental is no longer available.');
  if(!Number.isSafeInteger(line.quantity)||line.quantity<1||!Number.isSafeInteger(line.unitPriceCents)||line.unitPriceCents<0)throw new Error(`Check the quantity and price for ${item.name}.`);
  const existing=result.find(row=>row.inventoryItemId===item.id);
  if(existing&&existing.unitPriceCents!==line.unitPriceCents)throw new Error(`Use one unit price for ${item.name}.`);
  const quantity=(existing?.quantity??0)+line.quantity;
  if(quantity>(item.allow_quantity?item.stock_quantity:Math.min(1,item.stock_quantity)))throw new Error(`The selected quantity of ${item.name} is unavailable.`);
  if(existing)existing.quantity=quantity;else result.push({...line});
 }
 return result;
}

export function assistedRentalTotals(lines:AssistedRentalLine[],amounts:{discount:number;delivery:number;tax:number;subtotalOverride?:number;deposit:number}){
 const itemSubtotal=lines.reduce((sum,line)=>sum+line.unitPriceCents*line.quantity,0);
 const subtotal=amounts.subtotalOverride??itemSubtotal;
 const total=subtotal-amounts.discount+amounts.delivery+amounts.tax;
 if([itemSubtotal,subtotal,total,amounts.discount,amounts.delivery,amounts.tax,amounts.deposit].some(value=>!Number.isSafeInteger(value)||value<0||value>2147483647)||amounts.discount>subtotal||amounts.deposit>total)throw new Error('Check the confirmed amounts. Discount cannot exceed the rental subtotal and deposit cannot exceed the total.');
 return {itemSubtotal,subtotal,discount:amounts.discount,delivery:amounts.delivery,tax:amounts.tax,total,deposit:amounts.deposit};
}
