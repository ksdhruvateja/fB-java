/** Compress an image file via canvas (max dimension 1600). Non-images pass through. */
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ dataUrl: string; type: string; name: string }> {
  if (!file.type.startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, type: file.type || 'application/octet-stream', name: file.name };
  }

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const { width, height } = img;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  if (scale >= 1 && file.size < 900_000) {
    return { dataUrl, type: file.type || 'image/jpeg', name: file.name };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl, type: file.type || 'image/jpeg', name: file.name };
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const compressed = canvas.toDataURL(outType, quality);
  return {
    dataUrl: compressed,
    type: outType,
    name: file.name.replace(/\.\w+$/, outType === 'image/png' ? '.png' : '.jpg'),
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = src;
  });
}
