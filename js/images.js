// הקטנת תמונות בדפדפן לפני ההעלאה, כדי לחסוך מקום ולטעון מהר.
import { signUploads, uploadToSigned } from './api.js';

const MAX_SIDE = 1600;
const THUMB_SIDE = 480; // לכרטיסים במסך הבית (~25KB במקום ~200KB)
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

function toBlob(canvas, type, quality = QUALITY) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function resize(bmp, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  return { blob, width, height };
}

export async function compressImage(file) {
  const bmp = await loadBitmap(file);
  const full = await resize(bmp, MAX_SIDE, QUALITY);
  const thumb = await resize(bmp, THUMB_SIDE, 0.75);
  bmp.close?.();
  return { ...full, thumb: thumb.blob, ext: full.blob.type === 'image/webp' ? 'webp' : 'jpg' };
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
    // אם התמונה המוקטנת נכשלה, לא נורא: האתר יציג את המלאה
    if (uploads[i].thumbToken) await uploadToSigned(uploads[i].thumbPath, uploads[i].thumbToken, c.thumb).catch(() => {});
    results.push({ path: uploads[i].path, width: c.width, height: c.height });
    onProgress(i + 1, compressed.length);
  }
  return results;
}
