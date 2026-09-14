import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const migration=()=>read("supabase/migrations/20260914000400_fix_promotion_category_save.sql");
test("category RLS allows tenant reads and requires matching tenant ownership on writes",async()=>{
 const sql=await migration();
 assert.match(sql,/for select to authenticated using/);
 assert.match(sql,/public\.is_business_member\(p\.business_id\)/);
 assert.match(sql,/for all to authenticated using/);
 assert.match(sql,/c\.business_id=p\.business_id/);
 assert.match(sql,/p\.id=promotion_id and c\.id=category_id and public\.has_business_role/);
});
test("promotion creation saves the complete graph in one invoker transaction",async()=>{
 const [sql,actions]=await Promise.all([migration(),read("app/app/[businessSlug]/marketing/promotions/actions.ts")]);
 assert.match(sql,/security invoker/);
 assert.match(sql,/v_actor is null or not public\.has_business_role/);
 for(const table of ["discounts","promotions","promotion_categories","discount_items"])assert.match(sql,new RegExp(`insert into public\\.${table}`));
 assert.match(sql,/where business_id=p_business_id and active and category_id=any\(p_category_ids\)/);
 assert.match(actions,/supabase\.rpc\("save_promotion_draft"/);
 const create=actions.slice(actions.indexOf("export async function createPromotion"),actions.indexOf("export async function publishPromotion"));
 assert.doesNotMatch(create,/\.insert\(/);
 assert.match(create,/PGRST202/);
});
test("retry repairs only incomplete inactive drafts created by the same actor",async()=>{
 const sql=await migration();
 assert.match(sql,/v_promotion\.status<>'draft' or v_discount\.is_active or v_discount\.created_by is distinct from v_actor/);
 assert.match(sql,/exists\(select 1 from public\.promotion_categories where promotion_id=v_promotion\.id\)/);
 assert.match(sql,/exists\(select 1 from public\.discount_items where discount_id=v_discount\.id\)/);
 assert.match(sql,/v_promotion_id=v_promotion\.id; v_discount_id=v_discount\.id/);
 assert.match(sql,/raise exception 'promotion_slug_in_use'/);
 assert.match(sql,/raise exception 'promotion_category_unavailable'/);
});
