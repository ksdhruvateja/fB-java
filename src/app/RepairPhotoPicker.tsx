import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { MAX_REPAIR_PHOTOS } from "./repairPhotos";

export default function RepairPhotoPicker({ photos, onFile, onRemove, disabled = false }: {
  photos: string[];
  onFile: (file: File) => Promise<void>;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const adding = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length || adding.current || disabled) return;
    if (photos.length + files.length > MAX_REPAIR_PHOTOS) {
      setError(`Attach up to ${MAX_REPAIR_PHOTOS} photos. Remove a photo to add another.`);
      return;
    }
    adding.current = true;
    setBusy(true);
    setError(null);
    try { for (const file of Array.from(files)) await onFile(file); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not add this photo."); }
    finally { adding.current = false; setBusy(false); }
  }

  return <div className="space-y-3">
    <div><p className="text-sm font-semibold">Add photos</p><p className="text-xs text-muted-foreground">Up to 6 photos. Preview photos if you want to check them. Photos are compressed for upload.</p></div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={disabled || busy || photos.length >= MAX_REPAIR_PHOTOS} onClick={() => camera.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium disabled:opacity-50"><Camera className="h-4 w-4" />Take Photo</button>
      <button type="button" disabled={disabled || busy || photos.length >= MAX_REPAIR_PHOTOS} onClick={() => upload.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium disabled:opacity-50"><ImagePlus className="h-4 w-4" />{photos.length ? "Add More Photos" : "Upload Photo"}</button>
    </div>
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a photo with the camera" className="sr-only" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} />
    <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose photos from this device" className="sr-only" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} />
    {busy ? <p role="status" className="text-sm">Adding photos…</p> : null}
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={`${index}:${photo.slice(-24)}`} className="rounded-xl border border-border p-2">
      <button type="button" disabled={disabled || busy} aria-label={`Preview photo ${index + 1}`} onClick={() => setPreview(photo)} className="w-full"><img src={photo} alt={`Repair photo ${index + 1}`} className="h-24 w-full rounded-lg object-cover" /></button>
      <div className="mt-2 flex items-center justify-between gap-1"><span className="text-xs">{"Photo attached"}</span><button type="button" disabled={disabled || busy} aria-label={`Remove photo ${index + 1}`} onClick={() => onRemove(index)} className="rounded p-1"><X className="h-4 w-4" /></button></div>
    </div>)}</div>
    {preview ? <div role="dialog" aria-modal="true" aria-label="Photo preview" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-xl rounded-2xl bg-card p-4"><img src={preview} alt="Preview selected repair photo" className="max-h-[65vh] w-full object-contain" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setPreview(null)} className="rounded-xl border px-4 py-2">Close preview</button><button type="button" onClick={() => setPreview(null)} className="rounded-xl bg-primary px-4 py-2 text-white">Done</button></div></div></div> : null}
  </div>;
}
