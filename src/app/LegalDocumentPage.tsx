import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { fetchPublicLegalDocument } from "./legalApi";
import InsuranceRequirementsLink from "./InsuranceRequirementsLink";
import {
  CONTRACTOR_AGREEMENT_V4_LABEL,
  FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL,
} from "./contractorApplication";
import {
  formatLegalDate,
  legalKeyFromPath,
  LEGAL_ROUTES,
  PUBLIC_FOOTER_LEGAL_LINKS,
  PUBLIC_CONTRACTOR_LEGAL_LINKS,
  type LegalDocumentKey,
} from "./legalDocuments";

type Props = {
  pathname: string;
  onNavigateHome: () => void;
};

export default function LegalDocumentPage({ pathname, onNavigateHome }: Props) {
  const slugKey = legalKeyFromPath(pathname);
  const [hub, setHub] = useState(!slugKey);
  const [docKey, setDocKey] = useState<LegalDocumentKey | null>(slugKey);
  const [loading, setLoading] = useState(Boolean(slugKey));
  const [doc, setDoc] = useState<Awaited<ReturnType<typeof fetchPublicLegalDocument>>["document"] | null>(
    null
  );

  useEffect(() => {
    const key = legalKeyFromPath(pathname);
    setHub(!key);
    setDocKey(key);
    if (!key) {
      setDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchPublicLegalDocument(key)
      .then((r) => {
        if (r.ok && r.document) setDoc(r.document);
        else setDoc(null);
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <button type="button" onClick={onNavigateHome} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <BrandLogo variant="nav" tone="black" className="h-7" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
        {hub ? (
          <div>
            <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
              Legal
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Current FixBridge legal documents. No account required.
            </p>
            <ul className="mt-8 space-y-3">
              {PUBLIC_FOOTER_LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-base font-medium text-primary hover:underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <h2 className="mt-10 text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Contractor documents
            </h2>
            <ul className="mt-4 space-y-3">
              {PUBLIC_CONTRACTOR_LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-base font-medium text-primary hover:underline">
                    {link.label}
                  </a>
                  {link.pdfHref ? (
                    <a
                      href={link.pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
                    >
                      PDF
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
          </p>
        ) : doc ? (
          docKey === "INSURANCE_REQUIREMENTS" ? (
            <article>
              <h1 className="text-2xl font-bold">{doc.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {doc.version}
                {doc.effectiveDate ? ` · Effective ${formatLegalDate(doc.effectiveDate)}` : null}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                The official FixBridge Insurance Requirements guide is provided as a PDF for contractors and
                insurance agents.
              </p>
              <div className="mt-6">
                <InsuranceRequirementsLink label="Open Insurance Requirements PDF" />
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                A COI alone does not satisfy Additional Insured, Primary &amp; Non-Contributory, or Waiver of
                Subrogation requirements — separate endorsements must be uploaded and verified.
              </p>
            </article>
          ) : docKey === "CONTRACTOR_AGREEMENT" ? (
            <article>
              <h1 className="text-2xl font-bold">{doc.title || CONTRACTOR_AGREEMENT_V4_LABEL}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {doc.version}
                {doc.effectiveDate ? ` · Effective ${formatLegalDate(doc.effectiveDate)}` : null}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                The official FixBridge Contractor Agreement Package is provided as a PDF. Review and accept the
                current version during contractor onboarding or in your Compliance portal.
              </p>
              <div className="mt-6">
                <a
                  href={FIXBRIDGE_CONTRACTOR_AGREEMENT_V4_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Open Contractor Agreement Package v4 (PDF)
                </a>
              </div>
              <div className="mt-8 space-y-6 text-sm leading-relaxed">
                {(doc.content?.sections || []).map((s) => (
                  <section key={s.title}>
                    <h2 className="text-base font-semibold">{s.title}</h2>
                    <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{s.body}</p>
                  </section>
                ))}
              </div>
            </article>
          ) : (
          <article>
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Version {doc.version}
              {doc.effectiveDate ? ` · Effective ${formatLegalDate(doc.effectiveDate)}` : null}
            </p>
            <div className="mt-8 space-y-6 text-sm leading-relaxed">
              {(doc.content?.sections || []).map((s) => (
                <section key={s.title}>
                  <h2 className="text-base font-semibold">{s.title}</h2>
                  <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{s.body}</p>
                </section>
              ))}
              {!doc.content?.sections?.length ? (
                <p className="text-muted-foreground">Document content is not available.</p>
              ) : null}
            </div>
          </article>
          )
        ) : (
          <div>
            <h1 className="text-xl font-bold">Document not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <a href="/legal" className="text-primary hover:underline">
                View all legal documents
              </a>
            </p>
          </div>
        )}

        {!hub && docKey ? (
          <p className="mt-10 text-xs text-muted-foreground">
            Canonical URL:{" "}
            <a href={LEGAL_ROUTES[docKey]} className="text-primary hover:underline">
              {LEGAL_ROUTES[docKey]}
            </a>
          </p>
        ) : null}
      </main>
    </div>
  );
}
