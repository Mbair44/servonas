import styles from "./SmartUpsellOfferPage.module.css";
import alternativeStyles from "./SmartUpsellAlternatives.module.css";
import type {PublicSmartUpsellOffer} from "@/lib/smartUpsellOfferPage";
import {smartUpsellCheckoutPreparationEnabled,smartUpsellCheckoutUnavailable} from "@/lib/smartUpsellCheckout";
import {storageImageThumbUrl} from "@/lib/storageImageVariants";

const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);

export function SmartUpsellOfferPage({offer}:{offer:PublicSmartUpsellOffer}){
 const checkoutEnabled=(smartUpsellCheckoutPreparationEnabled()||offer.restrictedTestCheckout)&&offer.checkoutEligible;
 const expires=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(offer.expiresAt));
 const checkout=`/api/smart-upsells/${encodeURIComponent(offer.token)}/checkout`;
 const discountPercent=Math.round(offer.pricing.discountCents/Math.max(1,offer.pricing.originalPriceCents)*100);
 return <main className={styles.page} style={{"--upsell-brand":offer.business.brandColor??"#1769f5"} as React.CSSProperties}>
  <section className={styles.card}>
   <header className={styles.header}>{offer.business.logoUrl?<img src={offer.business.logoUrl} alt={`${offer.business.name} logo`}/>:<span>{offer.business.name.slice(0,1)}</span>}<strong>{offer.business.name}</strong></header>
   <div className={styles.hero}><p>🎉 A special upgrade for your party!</p><h1>Add more fun for less</h1></div>
   <section className={styles.item}>{offer.item.imageUrl?<img src={storageImageThumbUrl(offer.item.imageUrl)??offer.item.imageUrl} alt={offer.item.name}/>:<div className={styles.placeholder}>{offer.item.name.slice(0,1)}</div>}<div><h2>{offer.item.name}</h2><p>Available for your existing reservation.</p></div></section>
   <section className={styles.pricing}><div><span>Regular price</span><del>{money(offer.pricing.originalPriceCents)}</del></div><div className={styles.exclusive}><span>Your exclusive price</span><strong>{money(offer.pricing.discountedPriceCents)}</strong><b>{discountPercent}% OFF</b></div><dl><div><dt>Pay today</dt><dd>{money(offer.pricing.depositCents)}</dd></div><div><dt>Added to your remaining balance</dt><dd>{money(offer.pricing.remainingBalanceIncrementCents)}</dd></div></dl>{offer.pricing.additionalDeliveryFeeCents===0?<p className={styles.delivery}>No additional delivery fee.</p>:<p className={styles.delivery}>Additional delivery: {money(offer.pricing.additionalDeliveryFeeCents)}</p>}{offer.pricing.taxCents>0&&<p className={styles.tax}>Applicable tax included in the amounts above.</p>}</section>
   <p className={styles.expires}>Offer expires {expires}.</p>
   {checkoutEnabled?<form action={checkout} method="post"><button className={styles.cta}>Add to My Party — Pay {money(offer.pricing.depositCents)}</button></form>:<div className={styles.unavailable} role="status"><strong>Online checkout is not available yet.</strong><button type="button" disabled>Add to My Party — checkout coming soon</button><span>{smartUpsellCheckoutUnavailable()}</span>{offer.business.phone&&<a href={`tel:${offer.business.phone}`}>Call {offer.business.name}</a>}</div>}
   {offer.alternatives.length>0&&<section className={alternativeStyles.alternatives}><header><h2>Looking for something different?</h2><p>Check out our other inflatables available for your party date — also {discountPercent}% off!</p></header><div className={alternativeStyles.grid}>{offer.alternatives.map(item=><article className={alternativeStyles.card} key={item.id}>{item.imageUrl?<img src={storageImageThumbUrl(item.imageUrl)??item.imageUrl} alt={item.name}/>:<div className={alternativeStyles.placeholder}>{item.name.slice(0,1)}</div>}<div><h3>{item.name}</h3><del>{money(item.originalPriceCents)}</del><strong>{money(item.discountedPriceCents)}</strong></div>{checkoutEnabled&&<form action={checkout} method="post"><input type="hidden" name="inventoryItemId" value={item.id}/><button className={alternativeStyles.cta}>Choose this inflatable — Pay {money(item.depositCents)}</button></form>}</article>)}</div></section>}
  </section>
 </main>;
}
