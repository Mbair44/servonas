import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {smartUpsellOfferCanBeginCheckout,smartUpsellCheckoutPreparationEnabled} from "../lib/smartUpsellCheckout.ts";

const root=new URL("../",import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),"utf8");
const valid={status:"sent" as const,expires_at:"2030-01-01T00:00:00.000Z",discounted_price_cents:9250,additional_delivery_fee_cents:0,tax_cents:0,deposit_cents:4625,remaining_balance_increment_cents:4625};

test("offer checkout eligibility rejects expired, terminal, and inconsistent offer snapshots",()=>{
 assert.equal(smartUpsellOfferCanBeginCheckout(valid,new Date("2029-01-01T00:00:00Z")),true);
 assert.equal(smartUpsellOfferCanBeginCheckout({...valid,status:"accepted"},new Date("2029-01-01T00:00:00Z")),false);
 assert.equal(smartUpsellOfferCanBeginCheckout({...valid,expires_at:"2020-01-01T00:00:00Z"},new Date("2029-01-01T00:00:00Z")),false);
 assert.equal(smartUpsellOfferCanBeginCheckout({...valid,deposit_cents:4000},new Date("2029-01-01T00:00:00Z")),false);
});

test("server-side payment gate is disabled by default",()=>{
 const previousA=process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED,previousB=process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED;
 delete process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED;delete process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED;
 assert.equal(smartUpsellCheckoutPreparationEnabled(),false);
 if(previousA!==undefined)process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED=previousA;if(previousB!==undefined)process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED=previousB;
});

test("public routes use token-only validation and domain ownership checks",()=>{
 const loader=read("lib/smartUpsellOfferPage.ts"),hosted=read("app/upsell/[token]/page.tsx"),domain=read("app/sites/domain/[domain]/upsell/[token]/page.tsx"),middleware=read("middleware.ts");
 assert.match(loader,/token_hash/);assert.match(loader,/smartUpsellTokenIsUsable/);assert.match(loader,/booking\.customer_id!==offer\.customer_id/);assert.match(loader,/booking\.rental_starts_at!==offer\.rental_starts_at/);assert.match(loader,/\.eq\("business_id",offer\.business_id\)/);assert.match(loader,/domain_status","connected"/);
 assert.match(hosted,/loadPublicSmartUpsellOffer/);assert.match(domain,/loadPublicSmartUpsellOffer\(db,\{token,domain/);assert.match(middleware,/path\.startsWith\("\/upsell\/"\)/);
});

test("customer page displays discounted total, deposit, balance, and a disabled-state explanation",()=>{
 const page=read("components/SmartUpsellOfferPage.tsx"),styles=read("components/SmartUpsellOfferPage.module.css"),route=read("app/api/smart-upsells/[token]/checkout/route.ts");
 assert.match(page,/Regular price/);assert.match(page,/Your exclusive price/);assert.match(page,/Pay today/);assert.match(page,/Added to your remaining balance/);assert.match(page,/smartUpsellCheckoutPreparationEnabled/);assert.match(styles,/@media\(max-width:480px\)/);
 assert.match(route,/smartUpsellCheckoutPreparationEnabled\(\)/);assert.doesNotMatch(route,/stripeClient|stageBookingItemAmendment|\.rpc\(/);
});
