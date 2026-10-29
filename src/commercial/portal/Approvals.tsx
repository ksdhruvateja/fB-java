import { useState } from "react";
import { CheckCircle2, CircleAlert, FilePlus2, Receipt, Send, XCircle } from "lucide-react";
import { api } from "../api";
import { Link, navigate } from "../router";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Textarea, cx, money, statusTone, when } from "../ui";
import type { JobBundle } from "./JobDetail";
import { useSession } from "./Shell";

type Labor = { description: string; hours: number | string; rate?: number | string };
type Material = { description: string; quantity: number | string; unit_cost?: number | string };

export function ApprovalsAndBilling({ bundle, onChange }: { bundle: JobBundle; onChange: () => void }) {
  const { isOffice, canSeeMoney } = useSession();
  const j = bundle.job;
  const [proposalOpen, setProposalOpen] = useState<any>(null);
  const [nteOpen, setNteOpen] = useState(false);
  const pendingApprovals = bundle.approvals.filter((a) => a.status === "pending" || a.status === "needs_review");
  const billable = !["invoiced", "paid"].includes(j.status);

  return (
    <>
      <Card
        title="Proposals & authorizations"
        actions={billable ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" tone="secondary" onClick={() => setProposalOpen({})}><FilePlus2 className="h-4 w-4" />New proposal</Button>
            {isOffice && canSeeMoney ? <Button size="sm" tone="ghost" onClick={() => setNteOpen(true)}>Request NTE increase</Button> : null}
          </div>
        ) : null}
      >
        {pendingApprovals.length ? (
          <p className="mb-3 flex items-center gap-2 rounded-xl bg-orange-50 p-3 text-sm font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200">
            <CircleAlert className="h-4 w-4" />Additional work is waiting for authorization. Do not start it until it is approved.
          </p>
        ) : null}
        {j.approval_conditions ? <p className="mb-3 text-xs text-muted-foreground"><span className="font-semibold">Customer’s approval rules:</span> {j.approval_conditions}</p> : null}
        {!bundle.proposals.length && !bundle.approvals.length ? <p className="text-sm text-muted-foreground">No proposals or NTE requests.</p> : null}
        <ul className="space-y-3">
          {bundle.proposals.slice().reverse().map((p) => {
            const approval = bundle.approvals.filter((a) => a.proposal_id === p.id).slice(-1)[0];
            return (
              <li key={p.id} className="rounded-2xl bg-muted p-4 ">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Proposal v{p.version}</span>
                  <Badge tone={p.status === "approved" ? "green" : p.status === "declined" ? "red" : p.status === "submitted" ? "orange" : "slate"}>{p.status === "submitted" ? (approval?.status === "needs_review" ? "Reply needs review" : "Waiting for approval") : p.status}</Badge>
                  {canSeeMoney ? <span className="ml-auto font-semibold">{money(p.total)}</span> : null}
                </div>
                {p.findings ? <p className="mt-2 text-sm"><span className="font-medium">Findings:</span> {p.findings}</p> : null}
                {p.scope ? <p className="mt-1 text-sm"><span className="font-medium">Scope:</span> {p.scope}</p> : null}
                {p.exclusions ? <p className="mt-1 text-xs text-muted-foreground">Excludes: {p.exclusions}</p> : null}
                {approval ? <ApprovalLine approval={approval} /> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.status === "draft" ? <Button size="sm" tone="secondary" onClick={() => setProposalOpen(p)}>{isOffice ? "Review & price" : "Edit"}</Button> : null}
                  {p.status === "draft" && isOffice && canSeeMoney ? <SubmitProposal proposal={p} job={j} onDone={onChange} /> : null}
                  {approval && (approval.status === "pending" || approval.status === "needs_review") && isOffice ? <DecisionButton approval={approval} onDone={onChange} /> : null}
                </div>
              </li>
            );
          })}
          {bundle.approvals.filter((a) => a.kind === "nte_increase").map((a) => (
            <li key={a.id} className="rounded-2xl bg-muted p-4 ">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">NTE increase</span>
                <Badge tone={statusTone(a.status === "pending" ? "awaiting_approval" : a.status === "approved" ? "completed" : a.status === "declined" ? "declined" : "received")}>{a.status.replace("_", " ")}</Badge>
              </div>
              {a.reason ? <p className="mt-1 text-sm">{a.reason}</p> : null}
              <ApprovalLine approval={a} />
              {(a.status === "pending" || a.status === "needs_review") && isOffice ? <div className="mt-2"><DecisionButton approval={a} onDone={onChange} /></div> : null}
            </li>
          ))}
        </ul>
      </Card>

      <CompletionCard bundle={bundle} onChange={onChange} />
      {isOffice && canSeeMoney ? <InvoiceCard bundle={bundle} onChange={onChange} /> : null}

      <ProposalModal proposal={proposalOpen} jobId={j.id} onClose={() => setProposalOpen(null)} onSaved={() => { setProposalOpen(null); onChange(); }} />
      <NteModal open={nteOpen} jobId={j.id} current={j.authorized_amount ?? j.nte_amount} onClose={() => setNteOpen(false)} onSaved={() => { setNteOpen(false); onChange(); }} />
    </>
  );
}

function ApprovalLine({ approval: a }: { approval: any }) {
  const { canSeeMoney } = useSession();
  return (
    <div className="mt-2 rounded-xl bg-muted p-3 text-xs /60">
      {canSeeMoney ? (
        <p>
          Original authorization {money(a.original_amount)} · requested {money(a.requested_amount)}
          {a.approved_amount != null ? <> · <span className="font-semibold">approved {money(a.approved_amount)}</span></> : null}
        </p>
      ) : null}
      {a.approver_name ? <p>Approver: {a.approver_name}{a.approver_contact ? ` (${a.approver_contact})` : ""}{a.decided_at ? ` · ${when(a.decided_at)}` : ""}</p> : null}
      {a.evidence_text ? <p className="mt-1 whitespace-pre-line italic">“{a.evidence_text}”</p> : null}
    </div>
  );
}

function SubmitProposal({ proposal, job, onDone }: { proposal: any; job: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [via, setVia] = useState(job.dispatcher_email ? "email" : "portal");
  const [recipient, setRecipient] = useState(job.dispatcher_email || "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Send className="h-4 w-4" />Submit to customer</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Submit proposal v${proposal.version} — ${money(proposal.total)}`}>
        <p className="mb-3 text-sm text-muted-foreground">The proposal is sent once. Its total becomes the new authorized amount when the customer approves it.</p>
        <div className="space-y-3">
          <Field label="How">
            <Select value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="email">Email it from FixBridge</option>
              <option value="portal">I entered it in the customer’s portal</option>
              <option value="phone">I gave it by phone</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          {via === "email" ? <Field label="Send to"><Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field> : <Field label="Reference / confirmation"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        </div>
        <div className="mt-3"><ErrorNote error={error} /></div>
        <Button className="mt-4" busy={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post(`/proposals/${proposal.id}/submit`, { via, recipient, reference });
            setOpen(false);
            onDone();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}>Submit</Button>
      </Modal>
    </>
  );
}

function DecisionButton({ approval, onDone }: { approval: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("approved");
  const [amount, setAmount] = useState(approval.requested_amount != null ? String(approval.requested_amount) : "");
  const [approver, setApprover] = useState("");
  const [contact, setContact] = useState("");
  const [kind, setKind] = useState("email");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <Button size="sm" tone={approval.status === "needs_review" ? "danger" : "secondary"} onClick={() => setOpen(true)}>{approval.status === "needs_review" ? "Review the reply" : "Record the customer’s reply"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Customer’s reply">
        <div className="grid grid-cols-3 gap-2">
          {([
            ["approved", "Approved", CheckCircle2, "border-emerald-600 bg-emerald-50 text-emerald-900"],
            ["declined", "Declined", XCircle, "border-red-600 bg-red-50 text-red-900"],
            ["unclear", "Not clear", CircleAlert, "border-amber-600 bg-amber-50 text-amber-900"],
          ] as const).map(([k, label, Icon, on]) => (
            <button key={k} type="button" onClick={() => setDecision(k)} className={cx("flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-sm font-semibold", decision === k ? on : "border-border")}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </div>
        {decision === "unclear" ? <p className="mt-2 text-xs text-muted-foreground">An unclear reply is not treated as approval. It goes to the exception queue for someone to follow up.</p> : null}
        <div className="mt-3 space-y-3">
          {decision === "approved" ? <Field label="Approved amount"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field> : null}
          {decision !== "unclear" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Approved by"><Input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name, company" /></Field>
              <Field label="Their email / phone"><Input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
            </div>
          ) : null}
          <Field label="Evidence">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="email">Email reply</option><option value="portal">Portal approval</option><option value="phone">Phone call (note who and when)</option><option value="written">Signed document</option>
            </Select>
          </Field>
          <Field label="Paste the reply or describe it (required)"><Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="“Approved to proceed at $1,180 — Pat Lee, Northwind, 10/14 3:05 PM”" /></Field>
        </div>
        <div className="mt-3"><ErrorNote error={error} /></div>
        <Button className="mt-4" busy={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post(`/approvals/${approval.id}/decision`, { decision, approved_amount: amount, approver_name: approver, approver_contact: contact, evidence_kind: kind, evidence_text: evidence });
            setOpen(false);
            onDone();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}>Save</Button>
      </Modal>
    </>
  );
}

function ProposalModal({ proposal, jobId, onClose, onSaved }: { proposal: any; jobId: number; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={!!proposal} onClose={onClose} title={proposal?.id ? `Proposal v${proposal.version}` : "New proposal"} wide>
      {proposal ? <ProposalForm key={proposal.id || "new"} proposal={proposal} jobId={jobId} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function ProposalForm({ proposal, jobId, onSaved }: { proposal: any; jobId: number; onSaved: () => void }) {
  const { isOffice, canSeeMoney } = useSession();
  const [findings, setFindings] = useState(proposal.findings || "");
  const [scope, setScope] = useState(proposal.scope || "");
  const [exclusions, setExclusions] = useState(proposal.exclusions || "");
  const [timing, setTiming] = useState(proposal.timing || "");
  const [labor, setLabor] = useState<Labor[]>(proposal.labor_lines?.length ? proposal.labor_lines : [{ description: "Labor", hours: "", rate: "" }]);
  const [materials, setMaterials] = useState<Material[]>(proposal.material_lines?.length ? proposal.material_lines : [{ description: "", quantity: "", unit_cost: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const total = labor.reduce((s, l) => s + Number(l.hours || 0) * Number(l.rate || 0), 0) + materials.reduce((s, m) => s + Number(m.quantity || 0) * Number(m.unit_cost || 0), 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { findings, scope, exclusions, timing, labor_lines: labor, material_lines: materials, office_reviewed: isOffice };
      if (proposal.id) await api.patch(`/proposals/${proposal.id}`, body);
      else await api.post(`/jobs/${jobId}/proposals`, body);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Findings" hint="What you found on site."><Textarea value={findings} onChange={(e) => setFindings(e.target.value)} /></Field>
      <Field label="Proposed scope"><Textarea value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Exclusions"><Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} className="min-h-[60px]" /></Field>
        <Field label="Timing"><Textarea value={timing} onChange={(e) => setTiming(e.target.value)} className="min-h-[60px]" placeholder="Parts 2 days; 3 hours on site" /></Field>
      </div>
      <LineTable
        title="Labor"
        rows={labor}
        cols={[{ key: "description", label: "Description", wide: true }, { key: "hours", label: "Hours" }, ...(canSeeMoney ? [{ key: "rate", label: "Rate $" }] : [])]}
        onChange={setLabor}
        blank={{ description: "", hours: "", rate: "" }}
      />
      <LineTable
        title="Materials"
        rows={materials}
        cols={[{ key: "description", label: "Item", wide: true }, { key: "quantity", label: "Qty" }, ...(canSeeMoney ? [{ key: "unit_cost", label: "Unit $" }] : [])]}
        onChange={setMaterials}
        blank={{ description: "", quantity: "", unit_cost: "" }}
      />
      {canSeeMoney ? <p className="text-right text-lg font-bold">Total {money(total)}</p> : <p className="text-xs text-muted-foreground">The office adds prices before it goes to the customer.</p>}
      <ErrorNote error={error} />
      <Button onClick={save} busy={busy}>{proposal.id ? "Save" : "Save draft"}</Button>
    </div>
  );
}

function LineTable<T extends Record<string, any>>({ title, rows, cols, onChange, blank }: { title: string; rows: T[]; cols: { key: string; label: string; wide?: boolean }[]; onChange: (r: T[]) => void; blank: T }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            {cols.map((c) => (
              <Input key={c.key} aria-label={c.label} placeholder={c.label} className={c.wide ? "flex-1" : "w-24"} inputMode={c.wide ? undefined : "decimal"}
                value={row[c.key] ?? ""} onChange={(e) => onChange(rows.map((r, ri) => (ri === i ? { ...r, [c.key]: e.target.value } : r)))} />
            ))}
            <button type="button" className="px-2 text-muted-foreground hover:text-red-600" aria-label="Remove line" onClick={() => onChange(rows.filter((_, ri) => ri !== i))}>×</button>
          </div>
        ))}
        <Button size="sm" tone="ghost" onClick={() => onChange([...rows, { ...blank }])}>+ Add line</Button>
      </div>
    </fieldset>
  );
}

function NteModal({ open, jobId, current, onClose, onSaved }: { open: boolean; jobId: number; current: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal open={open} onClose={onClose} title="Request an NTE increase">
      <p className="mb-3 text-sm text-muted-foreground">Currently authorized: {money(current)}. Record the request here, send it the way this customer accepts, then record their reply.</p>
      <div className="space-y-3">
        <Field label="New NTE requested"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Why"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4" onClick={async () => { try { await api.post(`/jobs/${jobId}/nte-requests`, { requested_amount: amount, reason }); onSaved(); } catch (e) { setError(e); } }}>Save request</Button>
    </Modal>
  );
}

function CompletionCard({ bundle, onChange }: { bundle: JobBundle; onChange: () => void }) {
  const { isOffice } = useSession();
  const j = bundle.job;
  const [summary, setSummary] = useState("");
  const [signoff, setSignoff] = useState(j.signoff_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blocking = bundle.completion.filter((c) => !c.ok && c.severity === "blocking");
  if (!bundle.visits.length && !j.completion_finalized_at) return null;
  return (
    <Card title="Completion package">
      {j.completion_finalized_at ? (
        <div className="text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Finalized {when(j.completion_finalized_at)}</p>
          {j.completion_summary ? <p className="mt-2 whitespace-pre-line">{j.completion_summary}</p> : null}
          {j.signoff_name ? <p className="mt-1 text-xs text-muted-foreground">Signed off by {j.signoff_name}</p> : null}
        </div>
      ) : (
        <>
          <ul className="space-y-1.5 text-sm">
            {bundle.completion.map((c) => (
              <li key={c.code} className="flex items-start gap-2">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className={cx("mt-0.5 h-4 w-4 shrink-0", c.severity === "blocking" ? "text-red-600" : "text-amber-500")} />}
                <span>{c.label}{!c.ok && c.detail ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}</span>
              </li>
            ))}
          </ul>
          {isOffice ? (
            <div className="mt-4 space-y-3">
              <Field label="Completion summary (optional)" hint="Defaults to the technicians’ work notes."><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[60px]" /></Field>
              {bundle.customer?.requires_signoff ? <Field label="Signed off on site by"><Input value={signoff} onChange={(e) => setSignoff(e.target.value)} /></Field> : null}
              <ErrorNote error={error} />
              <Button tone="success" disabled={blocking.length > 0} busy={busy} onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.post(`/jobs/${j.id}/completion/finalize`, { summary, signoff_name: signoff });
                  onChange();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}>Finalize completion package</Button>
              {blocking.length ? <p className="text-xs text-muted-foreground">Finish the items marked in red first.</p> : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function InvoiceCard({ bundle, onChange }: { bundle: JobBundle; onChange: () => void }) {
  const j = bundle.job;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const invoices = bundle.invoices || [];
  const live = invoices.filter((i) => i.status !== "void");
  return (
    <Card title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4" />Invoice</span>}>
      {invoices.length ? (
        <ul className="mb-3 space-y-2">
          {invoices.map((i) => (
            <li key={i.id}>
              <Link to={`/commercial/app/invoices/${i.id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-muted p-4 hover:border-primary ">
                <span><span className="font-semibold">{i.invoice_number}</span> <span className="text-sm text-muted-foreground">{money(i.total)}</span></span>
                <Badge tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {!live.length ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {j.completion_finalized_at ? "Ready to bill. The draft is built from approved work and visit times." : "You can draft the invoice now; it can only be sent after the completion package is finalized."}
          </p>
          <ErrorNote error={error} />
          <Button busy={busy} onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api.post(`/jobs/${j.id}/invoices`);
              onChange();
              navigate(`/commercial/app/invoices/${res.invoice.id}`);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}>Draft invoice</Button>
        </>
      ) : null}
    </Card>
  );
}
