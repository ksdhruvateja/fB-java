export const MAX_REPAIR_PHOTOS = 6;
export const MAX_REPAIR_PHOTO_CHARS = 700_000;

export function normalizeRepairPhotos(photos, legacyPhoto = null) {
  if (photos != null && !Array.isArray(photos)) {
    throw Object.assign(new Error('Repair photos must be an array.'), { status: 400, code: 'INVALID_REPAIR_PHOTOS' });
  }
  const items = photos ?? (typeof legacyPhoto === 'string' && legacyPhoto.startsWith('data:image/') ? [legacyPhoto] : []);
  if (items.length > MAX_REPAIR_PHOTOS) {
    throw Object.assign(new Error(`Attach up to ${MAX_REPAIR_PHOTOS} repair photos.`), { status: 400, code: 'TOO_MANY_REPAIR_PHOTOS' });
  }
  return items.map((photo) => {
    const match = typeof photo === 'string' && photo.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || photo.length > MAX_REPAIR_PHOTO_CHARS || match[2].length % 4 !== 0 || Buffer.from(match[2], 'base64').length === 0) {
      throw Object.assign(new Error('Choose JPG, PNG or WEBP photos under 700 KB each after compression.'), { status: 400, code: 'INVALID_REPAIR_PHOTO' });
    }
    return photo;
  });
}

export function repairPhotosFromRow(row) {
  let photos = row?.media_data_urls ?? row?.mediaDataUrls;
  if (typeof photos === 'string') {
    try { photos = JSON.parse(photos); } catch { photos = null; }
  }
  if (Array.isArray(photos) && photos.length) return photos;
  const legacy = row?.media_data_url ?? row?.mediaDataUrl;
  return typeof legacy === 'string' && legacy.startsWith('data:image/') ? [legacy] : [];
}
