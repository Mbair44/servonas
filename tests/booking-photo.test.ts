import assert from "node:assert/strict";
import test from "node:test";
import { bookingPhotoExtension, maximumBookingPhotoBytes, validateBookingPhoto } from "../lib/bookingPhoto.ts";

test("allows no public-booking photo and supported images within the limit", () => {
  assert.equal(validateBookingPhoto(null), null);
  assert.equal(validateBookingPhoto({ size: 1024, type: "image/jpeg" }), null);
  assert.equal(validateBookingPhoto({ size: maximumBookingPhotoBytes, type: "image/heic" }), null);
});

test("rejects oversized or unsupported public-booking attachments", () => {
  assert.equal(validateBookingPhoto({ size: maximumBookingPhotoBytes + 1, type: "image/png" }), "Choose a photo smaller than 10MB.");
  assert.equal(validateBookingPhoto({ size: 100, type: "application/pdf" }), "Use a JPG, PNG, WebP, or HEIC photo.");
});

test("uses storage-safe extensions derived from verified MIME type", () => {
  assert.equal(bookingPhotoExtension("image/png"), "png");
  assert.equal(bookingPhotoExtension("image/heic"), "heic");
  assert.equal(bookingPhotoExtension("image/jpeg"), "jpg");
});
