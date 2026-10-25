// הקטנת תמונות בדפדפן לפני ההעלאה, כדי לחסוך מקום ולטעון מהר.
import { signUploads, uploadToSigned } from './api.js';

const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // דפדפנים ישנים
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

function toBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function compressImage(file) {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  bmp.close?.();

  let blob = await toBlob(canvas, 'image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg');
  return { blob, width, height, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
}

// מעלה רשימת קבצים. מחזיר [{ path, width, height }]
export async function uploadImages(key, files, onProgress = () => {}) {
  if (!files.length) return [];
  const compressed = [];
  for (const f of files) compressed.push(await compressImage(f));

  const results = [];
  // כל הקבצים מאותו סוג (תלוי בדפדפן), אז מספיקה בקשה אחת
  const { uploads } = await signUploads(key, compressed.length, compressed[0].ext);
  for (let i = 0; i < compressed.length; i++) {
    const c = compressed[i];
    await uploadToSigned(uploads[i].path, uploads[i].token, c.blob);
    results.push({ path: uploads[i].path, width: c.width, height: c.height });
    onProgress(i + 1, compressed.length);
  }
  return results;
}
