/**
 * Client-side 1:1 image cropper producing WebP or PNG blobs.
 */

export interface CropArea {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function cropImageToBlob(
  source: HTMLImageElement | ImageBitmap,
  crop?: CropArea,
  outputSize = 512
): Promise<Blob> {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;

  let { sx, sy, sWidth, sHeight } = crop ?? { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };

  if (!sWidth || !sHeight) {
    // Default: Center-crop to 1:1 square
    const minDim = Math.min(width, height);
    sx = Math.round((width - minDim) / 2);
    sy = Math.round((height - minDim) / 2);
    sWidth = minDim;
    sHeight = minDim;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Smooth image rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, outputSize, outputSize);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        // Fallback to image/png
        canvas.toBlob(
          (pngBlob) => {
            if (pngBlob) {
              resolve(pngBlob);
            } else {
              reject(new Error('Failed to encode cropped image to blob'));
            }
          },
          'image/png'
        );
      },
      'image/webp',
      0.9
    );
  });
}
