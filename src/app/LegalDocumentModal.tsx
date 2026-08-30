import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "./platformApi";
import type { LegalDocumentKey } from "./legalDocuments";

type LegalDoc = {
  key: string;
  title: string;
  version: string;
  content?: { heading: string; sections: { title: string; body: string }[] };
};

export default function LegalDocumentModal({
  documentKey,
  open,
  onClose,
}: {
  documentKey: LegalDocumentKey | null;
  open: boolean;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !documentKey) return;
    setLoading(true);
    void api<{ ok: boolean; document?: LegalDoc }>(`/api/legal/documents/${documentKey}`)
      .then((r) => {
        if (r.ok && r.document) setDoc(r.document);
      })
      .finally(() => setLoading(false));
  }, [open, documentKey]);

  if (!open || !documentKey) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{doc?.title || "Legal document"}</h2>
            {doc?.version ? <p className="text-xs text-muted-foreground">Version {doc.version}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border p-1.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            {(doc?.content?.sections || []).map((s) => (
              <section key={s.title}>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-muted-foreground">{s.body}</p>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
