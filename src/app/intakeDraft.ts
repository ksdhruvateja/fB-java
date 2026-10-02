import type { AdaptiveAnswers } from "./serviceRequestFlow";
import type { IntakePhase } from "./HomeownerServiceIntake";
import type { ServiceLocation } from "./serviceRequestFlow";

export type IntakeDraft = {
  userId: number;
  intakePhase: IntakePhase;
  requestSystemId: string;
  issueArea: ServiceLocation | "";
  description: string;
  adaptiveAnswers: AdaptiveAnswers;
  propertyId: number | "";
  equipmentKey?: string;
  partnerCode: string;
  mediaDataUrl: string | null;
  mediaDataUrls?: string[];
  mediaType: string | null;
  savedAt: string;
};

const STORAGE_KEY = "fixbridge-intake-draft";

export function loadIntakeDraft(userId: number): IntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntakeDraft;
    if (Number(parsed.userId) !== Number(userId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

let photoDb: Promise<IDBDatabase> | null = null;
function openPhotoDb() {
  if (!photoDb) photoDb = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("fixbridge-intake-photos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "userId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { photoDb = null; reject(request.error); };
  });
  return photoDb;
}

export async function loadIntakeDraftPhotos(draft: IntakeDraft): Promise<string[]> {
  if (draft.mediaDataUrls?.length) return draft.mediaDataUrls;
  if (draft.mediaDataUrl?.startsWith("data:image/")) return [draft.mediaDataUrl];
  try {
    const db = await openPhotoDb();
    const row = await new Promise<{ propertyId: number | ""; savedAt: string; photos: string[] } | undefined>((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(draft.userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return row?.propertyId === draft.propertyId && row.savedAt === draft.savedAt ? row.photos : [];
  } catch { return []; }
}

let saveQueue: Promise<boolean> = Promise.resolve(true);
let draftEpoch = 0;
export function saveIntakeDraft(draft: IntakeDraft): Promise<boolean> {
  // Keep images out of sessionStorage's small quota; bind them to this user,
  // property and draft revision. Serialize saves so old revisions cannot win.
  const snapshot = { ...draft, savedAt: new Date().toISOString() };
  const epoch = draftEpoch;
  saveQueue = saveQueue.then(async () => {
    try {
      if (epoch !== draftEpoch) return false;
      const photos = snapshot.mediaDataUrls || (snapshot.mediaDataUrl?.startsWith("data:image/") ? [snapshot.mediaDataUrl] : []);
      const db = await openPhotoDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put({ userId: snapshot.userId, propertyId: snapshot.propertyId, savedAt: snapshot.savedAt, photos });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const metadata = { ...snapshot, mediaDataUrls: undefined, mediaDataUrl: snapshot.mediaType?.startsWith("video") ? snapshot.mediaDataUrl : null };
      if (epoch !== draftEpoch) return false;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
      return true;
    } catch { return false; }
  });
  return saveQueue;
}

export function clearIntakeDraft() {
  draftEpoch += 1;
  try {
    const draft = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as IntakeDraft | null;
    sessionStorage.removeItem(STORAGE_KEY);
    if (draft) saveQueue = saveQueue.then(async () => {
      // Queue deletion before future saves so clearing an old draft cannot
      // erase the photos of a new request created immediately afterward.
      const db = await openPhotoDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").delete(draft.userId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    }).catch(() => true);
  } catch {
    /* storage unavailable */
  }
}
