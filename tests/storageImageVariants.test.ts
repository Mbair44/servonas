import assert from "node:assert/strict";
import {describe,it} from "node:test";

import {
  buildImageVariantPaths,
  imageVariantCacheControl,
  managedImageVariantPathsFromPublicUrl,
  storageImageDisplayUrl,
  storageImageThumbUrl,
} from "../lib/storageImageVariants.ts";

describe("storage image variants",()=>{
  it("builds versioned display and thumb paths for immutable caching",()=>{
    const variants=buildImageVariantPaths("tenant-123","webp","asset-456");
    assert.equal(variants.displayPath,"tenant-123/asset-456/v1/display.webp");
    assert.equal(variants.thumbPath,"tenant-123/asset-456/v1/thumb.webp");
    assert.equal(imageVariantCacheControl(),"31536000");
  });

  it("derives thumb and display URLs while preserving legacy URLs",()=>{
    const displayUrl="https://example.supabase.co/storage/v1/object/public/website-assets/tenant-123/asset-456/v1/display.webp";
    const thumbUrl="https://example.supabase.co/storage/v1/object/public/website-assets/tenant-123/asset-456/v1/thumb.webp";
    const legacyUrl="https://example.supabase.co/storage/v1/object/public/website-assets/tenant-123/legacy-photo.jpg";
    assert.equal(storageImageThumbUrl(displayUrl),thumbUrl);
    assert.equal(storageImageDisplayUrl(thumbUrl),displayUrl);
    assert.equal(storageImageThumbUrl(legacyUrl),legacyUrl);
  });

  it("finds managed display and thumb objects for safe cleanup",()=>{
    const displayUrl="https://example.supabase.co/storage/v1/object/public/inventory-images/tenant-123/asset-456/v1/display.webp";
    assert.deepEqual(
      managedImageVariantPathsFromPublicUrl(displayUrl,"inventory-images"),
      ["tenant-123/asset-456/v1/display.webp","tenant-123/asset-456/v1/thumb.webp"]
    );
    assert.deepEqual(
      managedImageVariantPathsFromPublicUrl("https://example.supabase.co/storage/v1/object/public/inventory-images/tenant-123/legacy-photo.jpg","inventory-images"),
      []
    );
  });
});
