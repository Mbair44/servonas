export const bookingPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const maximumBookingPhotoBytes = 10 * 1024 * 1024;

export function validateBookingPhoto(file: { size: number; type: string } | null) {
  if (!file || file.size === 0) return null;
  if (file.size > maximumBookingPhotoBytes) return "Choose a photo smaller than 10MB.";
  if (!bookingPhotoMimeTypes.includes(file.type as typeof bookingPhotoMimeTypes[number])) {
    return "Use a JPG, PNG, WebP, or HEIC photo.";
  }
  return null;
}

export function bookingPhotoExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  return "jpg";
}
