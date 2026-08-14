/* Client-side image compression for KYC document uploads.
   Keeps payloads small enough for the JSON-only API router while staying readable. */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function compressImageToDataUrl(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are accepted');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large (max 5MB)');
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to process image');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  return canvas.toDataURL('image/jpeg', quality);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoking early is safe once decoded; the bitmap holds its own pixels.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
