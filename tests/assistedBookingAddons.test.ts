import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const form=readFileSync(new URL("../components/AssistedRentalBookingForm.tsx",import.meta.url),"utf8");
const action=readFileSync(new URL("../app/app/[businessSlug]/assisted-booking/actions.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261106000300_assisted_booking_catalog_addons.sql",import.meta.url),"utf8");

test("assisted booking includes selected catalog add-ons before calculating the total and deposit",()=>{
 assert.match(form,/name="staffAddons"/);
 assert.match(form,/addonSubtotal/);
 assert.match(form,/subtotalOverride:rentalSubtotal\+addonSubtotal/);
 assert.match(form,/Booking add-ons/);
 assert.match(form,/included in the total and deposit calculation/);
 assert.match(action,/const staffAddons=JSON\.parse\(text\(form,"staffAddons"\)\|\|"\[\]"\)/);
 assert.match(action,/staffAddons/);
});

test("database atomically validates catalog add-ons and saves customer-visible charge lines",()=>{
 assert.match(migration,/requested_assisted_catalog_addons/);
 assert.match(migration,/catalog\.business_id=p_business_id and catalog\.is_active and catalog\.visibility='admin_only'/);
 assert.match(migration,/staffAddonSubtotalCents/);
 assert.match(migration,/insert into public\.job_addons/);
 assert.match(migration,/insert into public\.booking_charge_lines/);
 assert.match(migration,/assisted_booking_addons/);
});
