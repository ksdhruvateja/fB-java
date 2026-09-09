import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Scale } from "lucide-react";
import { fetchHomeownerLegalStatus } from "./legalApi";
import { formatLegalDate, formatUtcTimestamp, LEGAL_ROUTES } from "./legalDocuments";

export default function HomeownerLegalPanel() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<
    Awaited<ReturnType<typeof fetchHomeownerLegalStatus>>["documents"]
  >([]);

  useEffect(() => {
    void fetchHomeownerLegalStatus()
      .then((r) => {
        if (r.ok && r.documents) setDocuments(r.documents);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Legal</h2>
          <p className="text-sm text-muted-foreground">
            Current policies and your acceptance status.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          {(documents || []).map((doc) => (
            <div key={doc.key} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold">{doc.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Version {doc.version} · Effective {formatLegalDate(doc.effectiveDate)}
                  </p>
                  {doc.accepted ? (
                    <p className="mt-2 text-xs">
                      <span className="font-medium text-emerald-600">
                        {doc.acceptedCurrentVersion ? "Accepted (current version)" : "Accepted (prior version)"}
                      </span>
                      {doc.acceptedAt ? (
                        <span className="block text-muted-foreground mt-0.5">
                          {formatUtcTimestamp(doc.acceptedAt)}
                          {doc.acceptedVersion && doc.acceptedVersion !== doc.version
                            ? ` · v${doc.acceptedVersion}`
                            : null}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600 font-medium">Not yet accepted</p>
                  )}
                </div>
                <a
                  href={doc.route || LEGAL_ROUTES[doc.key as keyof typeof LEGAL_ROUTES]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted/50"
                >
                  View
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
