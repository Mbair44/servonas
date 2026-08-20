"use client";

const MB = 1024 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 12 * MB;

export type OptimizedImageUpload = {
  display: File;
  thumb: File;
  originalBytes: number;
  displayBytes: number;
  thumbBytes: number;
  compressionRatio: number;
  width: number;
  height: number;
  transformed: boolean;
};

type OptimizeOptions = {
  maxSourceBytes?: number;
  maxDisplayLongEdge?: number;
  maxThumbLongEdge?: number;
  quality?: number;
};

type RasterResult = { blob: Blob; width: number; height: number; transformed: boolean };

function fileBaseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

function targetSize(width: number, height: number, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(context: CanvasRenderingContext2D, width: number, height: number) {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        close() {
          bitmap.close();
        },
      };
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("This image could not be prepared."));
      next.src = objectUrl;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw(context: CanvasRenderingContext2D, width: number, height: number) {
        context.drawImage(image, 0, 0, width, height);
      },
      close() {},
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function rasterize(file: File, longEdge: number, quality: number): Promise<RasterResult> {
  const decoded = await decodeImage(file);
  try {
    const size = targetSize(decoded.width, decoded.height, longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    decoded.draw(context, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) throw new Error("This image could not be compressed.");
    return {
      blob,
      width: size.width,
      height: size.height,
      transformed: size.width !== decoded.width || size.height !== decoded.height || file.type !== "image/webp",
    };
  } finally {
    decoded.close();
  }
}

export function validateOptimizableImage(file: File, allowedTypes: Set<string>, maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES) {
  if (!allowedTypes.has(file.type)) {
    throw new Error(`“${file.name}” is not a supported image type.`);
  }
  if (file.size > maxSourceBytes) {
    throw new Error(`“${file.name}” is ${(file.size / MB).toFixed(1)} MB. Choose an image smaller than ${(maxSourceBytes / MB).toFixed(0)} MB.`);
  }
}

export async function optimizeImageForUpload(file: File, options: OptimizeOptions = {}): Promise<OptimizedImageUpload> {
  const maxDisplayLongEdge = options.maxDisplayLongEdge ?? 1920;
  const maxThumbLongEdge = options.maxThumbLongEdge ?? 560;
  const quality = options.quality ?? 0.78;
  const displayResult = await rasterize(file, maxDisplayLongEdge, quality);
  const thumbResult = await rasterize(file, maxThumbLongEdge, quality);
  const baseName = fileBaseName(file.name);
  const display = new File([displayResult.blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  const thumb = new File([thumbResult.blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  return {
    display,
    thumb,
    originalBytes: file.size,
    displayBytes: display.size,
    thumbBytes: thumb.size,
    compressionRatio: file.size > 0 ? 1 - display.size / file.size : 0,
    width: displayResult.width,
    height: displayResult.height,
    transformed: displayResult.transformed || thumbResult.transformed || display.size !== file.size,
  };
}
