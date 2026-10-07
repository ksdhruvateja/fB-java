import { compressImageForAssessment } from "./imageUpload";

export const MAX_REPAIR_PHOTOS = 6;
export const MAX_REPAIR_PHOTO_CHARS = 700_000;

export async function prepareRepairPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new Error("Choose a JPG, PNG or WEBP photo.");
  }
  if (file.size > 15_000_000) throw new Error("Choose a photo smaller than 15 MB before compression.");
  for (const [edge, quality] of [[1280, 0.78], [1024, 0.7], [800, 0.6]]) {
    const photo = await compressImageForAssessment(file, edge, quality);
    if (photo.length <= MAX_REPAIR_PHOTO_CHARS) return photo;
  }
  throw new Error("This photo is too large after compression. Choose a smaller photo.");
}
