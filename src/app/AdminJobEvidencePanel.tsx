import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchAdminJobEvidence, type JobEvidencePackage } from "./legalApi";
import { formatUtcTimestamp } from "./legalDocuments";
import { formatMoney } from "./managedJobs";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/50 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </section>
  );
}

export default function AdminJobEvidencePanel({ jobId }: { jobId: number }) {
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState<JobEvidencePackage | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchAdminJobEvidence(jobId)
      .then((r) => {
        if (r.ok && r.evidence) setEvidence(r.evidence);
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading evidence…
      </p>
    );
  }

  if (!evidence) {
    return <p className="text-sm text-muted-foreground py-4">Could not load job evidence.</p>;
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <Section title="Homeowner">
        {evidence.homeownerAcceptances.length === 0 ? (
          <p className="text-muted-foreground text-xs">No acceptance records.</p>
        ) : (
          evidence.homeownerAcceptances.map((a) => (
            <div key={a.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
              <p className="font-medium">{a.documentTitle || a.acceptanceType}</p>
              <p className="text-muted-foreground">
                {a.documentKey ? `${a.documentKey} v${a.documentVersion}` : a.acceptanceType} ·{" "}
                {formatUtcTimestamp(a.acceptedAt)}
                {a.snapshotId ? ` · snapshot #${a.snapshotId}` : ""}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Job authorization">
        {evidence.professionalDispatchSnapshots.length === 0 ? (
          <p className="text-muted-foreground text-xs">No dispatch pricing snapshot.</p>
        ) : (
          evidence.professionalDispatchSnapshots.map((s) => (
            <div key={s.id} className="text-xs">
              <p>
                Authorized now: {formatMoney(s.authorizedNowCents / 100)} ·{" "}
                {formatUtcTimestamp(s.createdAt)}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Quote">
        {evidence.quoteSnapshots.length === 0 ? (
          <p className="text-muted-foreground text-xs">No approved quote snapshot.</p>
        ) : (
          evidence.quoteSnapshots.map((q) => (
            <div key={q.id} className="text-xs">
              <p>
                Quote {q.quoteNumber || `#${q.id}`} v{q.versionNumber} · Total{" "}
                {q.total != null ? formatMoney(q.total) : "—"} · {formatUtcTimestamp(q.acceptedAt)}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Change orders">
        {evidence.changeOrders.length === 0 ? (
          <p className="text-muted-foreground text-xs">None.</p>
        ) : (
          evidence.changeOrders.map((co) => (
            <div key={co.id} className="text-xs">
              <p>
                #{co.id} {co.status} · {co.retailAmount != null ? formatMoney(co.retailAmount) : "—"}
                {co.approvedAt ? ` · ${formatUtcTimestamp(co.approvedAt)}` : ""}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Payment">
        {evidence.paymentAuthorizations.length === 0 && evidence.payments.length === 0 ? (
          <p className="text-muted-foreground text-xs">No payment authorization records.</p>
        ) : (
          <>
            {evidence.paymentAuthorizations.map((p) => (
              <div key={p.id} className="text-xs">
                <p>
                  Auth {formatMoney(p.authorizedAmountCents / 100)} · {formatUtcTimestamp(p.createdAt)}
                  {p.stripePaymentIntentId ? ` · PI ${p.stripePaymentIntentId}` : ""}
                </p>
              </div>
            ))}
            {evidence.payments.map((p) => (
              <div key={`pay-${p.id}`} className="text-xs text-muted-foreground">
                Payment #{p.id} {p.status} {formatMoney(p.amountCents / 100)}
                {p.stripePaymentIntentId ? ` · ${p.stripePaymentIntentId}` : ""}
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Compliance at dispatch">
        {evidence.dispatchEvidence ? (
          <p className="text-xs">
            {evidence.dispatchEvidence.complianceStatus || "—"} ·{" "}
            {evidence.dispatchEvidence.dispatchAt
              ? formatUtcTimestamp(evidence.dispatchEvidence.dispatchAt)
              : "—"}
            <br />
            Document IDs:{" "}
            {(evidence.dispatchEvidence.complianceDocumentIds || []).join(", ") || "—"}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">No dispatch evidence linkage yet.</p>
        )}
        {evidence.contractorCompliance?.documents?.length ? (
          <div className="mt-2 space-y-1">
            {evidence.contractorCompliance.documents
              .filter((d) => d.isCurrent !== false)
              .map((d) => (
                <p key={d.id} className="text-xs">
                  {d.documentType}: {d.status}
                  {d.expirationDate ? ` · exp ${d.expirationDate}` : ""}
                  {d.verifiedAt ? ` · verified ${formatUtcTimestamp(d.verifiedAt)}` : ""}
                </p>
              ))}
          </div>
        ) : null}
      </Section>

      <Section title="Completion">
        <p className="text-xs">
          Status: {evidence.completion.status}
          {evidence.completion.customerConfirmedAt
            ? ` · confirmed ${formatUtcTimestamp(evidence.completion.customerConfirmedAt)}`
            : ""}
        </p>
      </Section>
    </div>
  );
}
