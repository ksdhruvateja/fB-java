import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Send, XCircle } from "lucide-react";
import { api } from "../api";
import { Link } from "../router";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, cx, money, statusTone, useLoad, when } from "../ui";
import { PageTitle } from "./Shell";

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft", sent: "Sent", delivery_failed: "Bounced / not delivered", acknowledged: "Acknowledged", disputed: "Disputed", paid: "Paid", void: "Void",
};

export function InvoicesPage() {
  const [status, setStatus] = useState("");
  const { data, error, loading } = useLoad(() => api.get(`/invoices${status ? `?status=${status}` : ""}`), [status]);
  return (
    <>
      <PageTitle title="Invoices" subtitle="Draft, sent, bounced, acknowledged, disputed and paid — with who is responsible." />
      <div className="mb-4 flex flex-wrap gap-1">
        {["", "draft", "sent", "delivery_failed", "disputed", "acknowledged", "paid", "void"].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={cx("rounded-full px-3 py-1.5 text-sm font-medium", status === s ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300")}>
            {s ? STATUS_TEXT[s] : "All"}
          </button>
        ))}
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !data.invoices.length ? <Empty>No invoices yet. Draft one from a completed job.</Empty> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="whitespace-nowrap bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
              <tr><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Job / site</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Responsible</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Paid</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.invoices.map((i: any) => (
                <tr key={i.id}>
                  <td className="px-4 py-3"><Link to={`/commercial/app/invoices/${i.id}`} className="font-semibold text-primary">{i.invoice_number}</Link><div className="text-xs text-slate-500">WO {i.wo_reference}</div></td>
                  <td className="px-4 py-3">{i.job_number}<div className="text-xs text-slate-500">{i.site_name}</div></td>
                  <td className="px-4 py-3">{i.dispatcher_name}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(i.status)}>{STATUS_TEXT[i.status]}</Badge>{i.sent_at && ["sent", "acknowledged"].includes(i.status) ? <div className="text-xs text-slate-500">{Math.floor((Date.now() - new Date(i.sent_at).getTime()) / 86400000)} days out</div> : null}</td>
                  <td className="px-4 py-3">{i.assigned_name || "—"}</td>
                  <td className="px-4 py-3 text-right">{money(i.total)}</td>
                  <td className="px-4 py-3 text-right">{money(i.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function InvoiceDetailPage({ id }: { id: number }) {
  const { data, error, loading, reload, setData } = useLoad(() => api.get(`/invoices/${id}`), [id]);
  const { data: team } = useLoad(() => api.get("/team").then((r) => r.users as any[]), []);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} />;
  const { invoice, job, checks, payments, messages } = data;
  const editable = invoice.status === "draft" || invoice.status === "delivery_failed";
  const blocking = checks.filter((c: any) => !c.ok && c.severity === "blocking");
  return (
    <>
      <Link to={`/commercial/app/jobs/${job.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400"><ArrowLeft className="h-4 w-4" />{job.job_number}</Link>
      <PageTitle
        title={`Invoice ${invoice.invoice_number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">WO {invoice.wo_reference || "—"} · {job.site_name}<Badge tone={statusTone(invoice.status)}>{STATUS_TEXT[invoice.status]}</Badge></span>}
      />
      {invoice.status === "delivery_failed" ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Not delivered: {invoice.delivery_failure_reason}. Fix the recipient or method and send again.</p> : null}
      {invoice.status === "disputed" ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Disputed: {invoice.dispute_reason}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {editable ? <InvoiceEditor key={invoice.updated_at} invoice={invoice} team={team || []} onSaved={(d) => setData(d)} /> : <InvoiceView invoice={invoice} />}
          {payments.length ? (
            <Card title="Payments">
              <ul className="space-y-2 text-sm">
                {payments.map((p: any) => (
                  <li key={p.id} className="flex justify-between gap-2"><span>{when(p.received_at || p.created_at)} · {p.method || "payment"}{p.reference ? ` · ref ${p.reference}` : ""}{p.evidence_text ? <span className="block text-xs text-slate-500">{p.evidence_text}</span> : null}</span><span className="font-semibold">{money(p.amount)}</span></li>
                ))}
              </ul>
            </Card>
          ) : null}
          {messages.length ? (
            <Card title="Delivery history">
              <ul className="space-y-1 text-sm">
                {messages.map((m: any) => (
                  <li key={m.id}>{when(m.created_at)} · {m.channel} {m.recipient ? `to ${m.recipient}` : ""} · <Badge tone={m.status === "sent" || m.status === "recorded" ? "green" : "red"}>{m.status}</Badge>{m.error ? <span className="block text-xs text-slate-500">{m.error}</span> : null}{m.reference ? <span className="block text-xs text-slate-500">{m.reference}</span> : null}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card title="Checks before sending">
            <ul className="space-y-1.5 text-sm">
              {checks.map((c: any) => (
                <li key={c.code} className="flex items-start gap-2">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className={cx("mt-0.5 h-4 w-4 shrink-0", c.severity === "blocking" ? "text-red-600" : "text-amber-500")} />}
                  <span>{c.label}{c.detail ? <span className="block text-xs text-slate-500">{c.detail}</span> : null}</span>
                </li>
              ))}
            </ul>
          </Card>
          <InvoiceActions invoice={invoice} blocking={blocking.length} onDone={reload} />
        </div>
      </div>
    </>
  );
}

function InvoiceView({ invoice }: { invoice: any }) {
  return (
    <Card title="Invoice">
      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Recipient</dt><dd>{invoice.submission_method === "portal" ? "Customer portal" : invoice.recipient}</dd></div>
        <div><dt className="text-xs text-slate-500">Service dates</dt><dd>{invoice.service_dates}</dd></div>
        {invoice.sent_at ? <div><dt className="text-xs text-slate-500">Sent</dt><dd>{when(invoice.sent_at)}{invoice.sent_reference ? ` · ${invoice.sent_reference}` : ""}</dd></div> : null}
      </dl>
      <Lines lines={invoice.lines} />
      <Totals invoice={invoice} />
    </Card>
  );
}

function Lines({ lines }: { lines: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price</th><th className="py-1 text-right">Amount</th></tr></thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {lines.map((l, i) => <tr key={i}><td className="py-1.5">{l.description} <span className="text-xs text-slate-500">({l.type})</span></td><td className="py-1.5 text-right">{l.quantity}</td><td className="py-1.5 text-right">{money(l.unit_price)}</td><td className="py-1.5 text-right">{money(Number(l.quantity) * Number(l.unit_price))}</td></tr>)}
      </tbody>
    </table>
  );
}

function Totals({ invoice }: { invoice: any }) {
  return (
    <div className="mt-3 space-y-0.5 text-right text-sm">
      <p>Subtotal {money(invoice.subtotal)}</p>
      {Number(invoice.tax) ? <p>Tax {money(invoice.tax)}</p> : null}
      <p className="text-lg font-bold">Total {money(invoice.total)}</p>
      {Number(invoice.amount_paid) ? <p className="text-emerald-700">Paid {money(invoice.amount_paid)}</p> : null}
    </div>
  );
}

function InvoiceEditor({ invoice, team, onSaved }: { invoice: any; team: any[]; onSaved: (d: any) => void }) {
  const [form, setForm] = useState({
    recipient: invoice.recipient, submission_method: invoice.submission_method, wo_reference: invoice.wo_reference, service_dates: invoice.service_dates,
    notes: invoice.notes, tax: String(invoice.tax || 0), assigned_user_id: invoice.assigned_user_id ? String(invoice.assigned_user_id) : "",
    lines: invoice.lines.map((l: any) => ({ ...l, quantity: String(l.quantity), unit_price: String(l.unit_price) })),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const set = (k: string, v: any) => { setDirty(true); setForm((f) => ({ ...f, [k]: v })); };
  const subtotal = form.lines.reduce((s: number, l: any) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  useEffect(() => setDirty(false), [invoice.updated_at]);
  return (
    <Card title="Edit draft">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Submission method">
          <Select value={form.submission_method} onChange={(e) => set("submission_method", e.target.value)}>
            <option value="email">Email</option><option value="portal">Customer portal</option><option value="mail">Mail</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Recipient email(s)" hint="Comma-separated"><Input value={form.recipient} onChange={(e) => set("recipient", e.target.value)} /></Field>
        <Field label="Work order #"><Input value={form.wo_reference} onChange={(e) => set("wo_reference", e.target.value)} /></Field>
        <Field label="Service dates"><Input value={form.service_dates} onChange={(e) => set("service_dates", e.target.value)} /></Field>
        <Field label="Responsible person" hint="Gets bounce and dispute follow-ups.">
          <Select value={form.assigned_user_id} onChange={(e) => set("assigned_user_id", e.target.value)}>
            <option value="">—</option>
            {team.filter((u) => u.active && u.role !== "technician").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </Select>
        </Field>
        <Field label="Tax"><Input inputMode="decimal" value={form.tax} onChange={(e) => set("tax", e.target.value)} /></Field>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Lines</p>
        {form.lines.map((l: any, i: number) => (
          <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Select value={l.type} onChange={(e) => set("lines", form.lines.map((x: any, xi: number) => (xi === i ? { ...x, type: e.target.value } : x)))} className="w-28">
              <option value="labor">Labor</option><option value="material">Material</option><option value="trip">Trip</option><option value="other">Other</option>
            </Select>
            <Input className="min-w-0 flex-1" placeholder="Description" value={l.description} onChange={(e) => set("lines", form.lines.map((x: any, xi: number) => (xi === i ? { ...x, description: e.target.value } : x)))} />
            <Input className="w-20" inputMode="decimal" aria-label="Quantity" value={l.quantity} onChange={(e) => set("lines", form.lines.map((x: any, xi: number) => (xi === i ? { ...x, quantity: e.target.value } : x)))} />
            <Input className="w-24" inputMode="decimal" aria-label="Unit price" value={l.unit_price} onChange={(e) => set("lines", form.lines.map((x: any, xi: number) => (xi === i ? { ...x, unit_price: e.target.value } : x)))} />
            <button type="button" className="px-2 text-slate-400 hover:text-red-600" aria-label="Remove line" onClick={() => set("lines", form.lines.filter((_: any, xi: number) => xi !== i))}>×</button>
          </div>
        ))}
        <Button size="sm" tone="ghost" onClick={() => set("lines", [...form.lines, { type: "material", description: "", quantity: "1", unit_price: "" }])}>+ Add line</Button>
      </div>
      <Field label="Notes on the invoice" className="mt-3"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[60px]" /></Field>
      <p className="mt-3 text-right text-lg font-bold">Total {money(subtotal + Number(form.tax || 0))}</p>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-3" busy={busy} disabled={!dirty} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          onSaved(await api.patch(`/invoices/${invoice.id}`, { ...form, assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null }));
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}>Save draft</Button>
    </Card>
  );
}

function InvoiceActions({ invoice, blocking, onDone }: { invoice: any; blocking: number; onDone: () => void }) {
  const [modal, setModal] = useState<"" | "send" | "status" | "payment">("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [resendReason, setResendReason] = useState("");
  const [pay, setPay] = useState({ amount: String(Math.max(0, Number(invoice.total) - Number(invoice.amount_paid))), method: "Check", reference: "", received_at: new Date().toISOString().slice(0, 10), evidence_text: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setModal("");
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const sendable = ["draft", "delivery_failed"].includes(invoice.status);
  const resend = invoice.status !== "draft";
  return (
    <Card title="Actions">
      <div className="flex flex-col gap-2">
        {sendable ? <Button disabled={blocking > 0} onClick={() => setModal("send")}><Send className="h-4 w-4" />{invoice.submission_method === "email" ? (resend ? "Send again" : "Send invoice") : "Record portal submission"}</Button> : null}
        {blocking > 0 && sendable ? <p className="text-xs text-slate-500">Fix the {blocking} red check{blocking === 1 ? "" : "s"} first.</p> : null}
        {["sent", "acknowledged"].includes(invoice.status) ? <Button tone="secondary" onClick={() => { setStatus("delivery_failed"); setModal("status"); }}>It bounced / was rejected</Button> : null}
        {["sent", "delivery_failed"].includes(invoice.status) ? <Button tone="secondary" onClick={() => { setStatus("acknowledged"); setModal("status"); }}>Customer acknowledged it</Button> : null}
        {["sent", "acknowledged"].includes(invoice.status) ? <Button tone="secondary" onClick={() => { setStatus("disputed"); setModal("status"); }}>Customer disputed it</Button> : null}
        {invoice.status === "disputed" ? <Button tone="secondary" onClick={() => { setStatus("sent"); setModal("status"); }}>Dispute settled</Button> : null}
        {["sent", "acknowledged", "disputed"].includes(invoice.status) ? <Button tone="success" onClick={() => setModal("payment")}>Record payment</Button> : null}
        {invoice.status !== "void" && invoice.status !== "paid" ? <Button tone="ghost" onClick={() => { setStatus("void"); setModal("status"); }}>Void</Button> : null}
      </div>

      <Modal open={modal === "send"} onClose={() => setModal("")} title={invoice.submission_method === "email" ? "Send invoice" : "Record submission"}>
        {invoice.submission_method === "email" ? <p className="text-sm">Sends to <span className="font-semibold">{invoice.recipient}</span>. It can only be sent once unless you give a reason.</p> : <Field label="Portal confirmation / reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        {resend ? <Field label="Why are you sending it again?" className="mt-3"><Input value={resendReason} onChange={(e) => setResendReason(e.target.value)} placeholder="Corrected AP address" /></Field> : null}
        <div className="mt-3"><ErrorNote error={error} /></div>
        <Button className="mt-4" busy={busy} onClick={() => run(() => api.post(`/invoices/${invoice.id}/send`, { reference, resend_reason: resend ? resendReason : undefined }))}>Confirm</Button>
      </Modal>

      <Modal open={modal === "status"} onClose={() => setModal("")} title={{ delivery_failed: "Mark as not delivered", acknowledged: "Mark acknowledged", disputed: "Mark disputed", sent: "Dispute settled", void: "Void invoice" }[status] || ""}>
        <Field label={status === "acknowledged" ? "Note (optional)" : "Reason / details"}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={status === "delivery_failed" ? "Bounce message, portal rejection reason…" : ""} /></Field>
        {status === "delivery_failed" || status === "disputed" ? <p className="mt-2 text-xs text-slate-500">This opens an exception assigned to the responsible person.</p> : null}
        <div className="mt-3"><ErrorNote error={error} /></div>
        <Button className="mt-4" tone={status === "void" ? "danger" : "primary"} busy={busy} onClick={() => run(() => api.post(`/invoices/${invoice.id}/status`, { status, reason }))}>Save</Button>
      </Modal>

      <Modal open={modal === "payment"} onClose={() => setModal("")} title="Record payment">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Received"><Input type="date" value={pay.received_at} onChange={(e) => setPay({ ...pay, received_at: e.target.value })} /></Field>
          <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option>Check</option><option>ACH</option><option>Card</option><option>Wire</option><option>Other</option></Select></Field>
          <Field label="Check # / ACH reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
        </div>
        <Field label="Evidence" hint="Remittance details, deposit note — required if there is no reference." className="mt-3"><Textarea value={pay.evidence_text} onChange={(e) => setPay({ ...pay, evidence_text: e.target.value })} className="min-h-[60px]" /></Field>
        <div className="mt-3"><ErrorNote error={error} /></div>
        <Button className="mt-4" tone="success" busy={busy} onClick={() => run(() => api.post(`/invoices/${invoice.id}/payments`, pay))}>Save payment</Button>
      </Modal>
    </Card>
  );
}
