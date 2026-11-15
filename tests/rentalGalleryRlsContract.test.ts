import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";

const migration=()=>readFile(join(process.cwd(),"supabase/migrations/20261112000100_rental_item_image_gallery.sql"),"utf8");

test("gallery RLS grants members read access and restricts mutations to tenant managers",async()=>{
 const sql=await migration();
 assert.match(sql,/enable row level security/);
 assert.match(sql,/for select to authenticated using\(public\.is_business_member\(business_id\)\)/);
 assert.match(sql,/for all to authenticated using\(public\.has_business_role\(business_id,array\['owner','admin','manager'\]\)\) with check\(public\.has_business_role\(business_id,array\['owner','admin','manager'\]\)\)/);
});

test("security-definer gallery RPC authorizes the caller before it can touch tenant metadata",async()=>{
 const sql=await migration();
 assert.match(sql,/security definer set search_path=public/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.has_business_role\(p_business_id,array\['owner','admin','manager'\]\)/);
 assert.match(sql,/select updated_at into v_updated from public\.inventory_items where id=p_item_id and business_id=p_business_id for update/);
});
