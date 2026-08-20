const VARIANT_CACHE_CONTROL = "31536000";
const IMAGE_VARIANT_VERSION = "v1";

export type ImageVariantKind = "display" | "thumb";

export type ImageUploadVariantPaths = {
  assetId: string;
  displayPath: string;
  thumbPath: string;
};

function normalizeExtension(extension: string) {
  const cleaned = extension.trim().toLowerCase().replace(/^\./, "");
  return cleaned || "webp";
}

export function buildImageVariantPaths(ownerId: string, extension: string, assetId = crypto.randomUUID()): ImageUploadVariantPaths {
  const normalizedExtension = normalizeExtension(extension);
  return {
    assetId,
    displayPath: `${ownerId}/${assetId}/${IMAGE_VARIANT_VERSION}/display.${normalizedExtension}`,
    thumbPath: `${ownerId}/${assetId}/${IMAGE_VARIANT_VERSION}/thumb.${normalizedExtension}`,
  };
}

export function imageVariantCacheControl() {
  return VARIANT_CACHE_CONTROL;
}

export function storageImageThumbUrl(url: string | null | undefined) {
  if (!url) return null;
  return /\/display\.[a-z0-9]+(?:\?|$)/i.test(url) ? url.replace(/\/display(\.[a-z0-9]+)(\?|$)/i, "/thumb$1$2") : url;
}

export function storageImageDisplayUrl(url: string | null | undefined) {
  if (!url) return null;
  return /\/thumb\.[a-z0-9]+(?:\?|$)/i.test(url) ? url.replace(/\/thumb(\.[a-z0-9]+)(\?|$)/i, "/display$1$2") : url;
}

export function managedImageVariantPathsFromStoragePath(path: string | null | undefined) {
  if (!path || !/\/display\.[a-z0-9]+$/i.test(path)) return [];
  const displayPath = path;
  const thumbPath = path.replace(/\/display(\.[a-z0-9]+)$/i, "/thumb$1");
  return [displayPath, thumbPath];
}

export function managedImageVariantPathsFromPublicUrl(url: string | null | undefined, bucket: string) {
  if (!url) return [];
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return [];
    const relativePath = decodeURIComponent(parsed.pathname.slice(index + marker.length));
    return managedImageVariantPathsFromStoragePath(relativePath);
  } catch {
    return [];
  }
}
