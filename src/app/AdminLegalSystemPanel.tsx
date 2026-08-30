import { useEffect, useState } from "react";
import { Archive, ExternalLink, Loader2, Plus } from "lucide-react";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import {
  fetchAdminLegalDocuments,
  fetchAdminLegalVersions,
  publishAdminLegalVersion,
} from "./legalApi";
import { formatLegalDate, LEGAL_ROUTES } from "./legalDocuments";
import { FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL, FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL } from "./contractorApplication";

export default function AdminLegalSystemPanel() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<
    Awaited<ReturnType<typeof fetchAdminLegalDocuments>>["documents"]
  >([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [versions, setVersions] = useState<
    Awaited<ReturnType<typeof fetchAdminLegalVersions>>["versions"]
  >([]);
  const [busy, setBusy] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    void fetchAdminLegalDocuments()
      .then((r) => {
        if (r.ok && r.documents) setDocuments(r.documents);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setVersions([]);
      return;
    }
    void fetchAdminLegalVersions(selectedKey).then((r) => {
      if (r.ok && r.versions) setVersions(r.versions);
    });
  }, [selectedKey]);

  async function handlePublish() {
    if (!selectedKey || !newVersion.trim()) return;
    setBusy(true);
    setMessage(null);
    const current = documents?.find((d) => d.key === selectedKey);
    const r = await publishAdminLegalVersion(selectedKey, {
      version: newVersion.trim(),
      title: current?.title,
      effectiveDate: new Date().toISOString().slice(0, 10),
      content: current?.content,
    });
    setBusy(false);
    if (r.ok) {
      setMessage(`Published ${selectedKey} v${newVersion.trim()}. Previous current version archived.`);
      setNewVersion("");
      reload();
      void fetchAdminLegalVersions(selectedKey).then((vr) => {
        if (vr.ok && vr.versions) setVersions(vr.versions);
      });
    } else {
      setMessage("Could not publish version.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Legal / System</h2>
        <p className="text-sm text-muted-foreground">
          Manage current and archived legal document versions. Publishing archives the prior current version.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide">
              Current documents
            </div>
            <ul className="divide-y divide-border">
              {(documents || []).map((doc) => (
                <li key={doc.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(doc.key)}
                    className={`w-full px-4 py-3 text-left text-sm hover:bg-muted/40 ${
                      selectedKey === doc.key ? "bg-primary/5" : ""
                    }`}
                  >
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      v{doc.version} · {formatLegalDate(doc.effectiveDate)} · {doc.status || "current"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-4">
            {selectedKey ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">{selectedKey}</h3>
                  </div>
                  {selectedKey === "INSURANCE_REQUIREMENTS" ? (
                    <a
                      href={FIXBRIDGE_INSURANCE_REQUIREMENTS_PDF_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      View PDF guide <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : selectedKey === "CONTRACTOR_AGREEMENT" ? (
                    <a
                      href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      View agreement PDF <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {(versions || []).map((v) => (
                    <div key={`${v.key}-${v.version}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="font-medium">{v.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · v{v.version} · {formatLegalDate(v.effectiveDate)} ·{" "}
                        <span className={v.status === "current" ? "text-emerald-600" : "text-muted-foreground"}>
                          {v.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="New version (e.g. 3.1)"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || !newVersion.trim()}
                    onClick={() => void handlePublish()}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Publish
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a document to view versions.</p>
            )}
            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
