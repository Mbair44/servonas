/**
 * Phase 2 is intentionally opt-in. The browser and the public endpoint use
 * the same build-time flag so catalog selections cannot become purchasable by
 * accident before the canonical checkout transaction supports them.
 */
export const customerCatalogAddonsUiEnabled=()=>process.env.NEXT_PUBLIC_CUSTOMER_CATALOG_ADDONS_UI_ENABLED==="true";
