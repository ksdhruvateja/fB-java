import { useEffect, useState } from "react";
import { FileText, Loader2, Mail, MessageSquare, Send } from "lucide-react";
import {
  adminGetJobInvoice,
  adminSendJobInvoice,
  formatMoney,
  type HomeownerInvoicePreview,
} from "./managedJobs";

type Props = {
  jobId: number;
  readOnly?: boolean;
  onMessage?: (msg: string) => void;
  compact?: boolean;
};

export default function AdminHomeownerInvoicePanel({
  jobId,
  readOnly = false,
  onMessage,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [invoice, setInvoice] = useState<HomeownerInvoicePreview | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await adminGetJobInvoice(jobId);
        if (!r.ok || !r.invoice) {
          setError(r.message || "Could not load invoice.");
          setInvoice(null);
        } else {
          setInvoice(r.invoice);
          setHtml(r.html || "");
          setEmail(r.invoice.billTo.email || "");
          setPhone(r.invoice.billTo.phone || "");
          setSendEmail(Boolean(r.invoice.billTo.email));
          setSendSms(Boolean(r.invoice.billTo.phone));
        }
      } catch {
        setError("Network error loading invoice.");
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  async function handleSend() {
    if (!sendEmail && !sendSms) {
      onMessage?.("Choose email and/or SMS delivery.");
      return;
    }
    setSending(true);
    try {
      const r = await adminSendJobInvoice(jobId, {
        sendEmail,
        sendSms,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        onMessage?.(r.message || "Could not send invoice.");
      } else {
        onMessage?.(r.message || "Invoice sent.");
        if (r.invoice) setInvoice(r.invoice);
      }
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not send invoice.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Generating invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
        {error || "Invoice unavailable."}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? "" : "rounded-xl border border-border bg-card p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-[#FF4D1C]" />
            Invoice {invoice.invoiceNumber}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invoice.bookingId} · {invoice.billTo.name}
          </p>
        </div>
        <p className="text-lg font-bold tabular-nums text-[#FF4D1C]">{formatMoney(invoice.amountDue)} due</p>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {invoice.lineItems.map((item, i) => (
          <li key={i} className="flex justify-between gap-3 px-3 py-2">
            <span className="text-foreground/90">{item.label}</span>
            <span className="shrink-0 tabular-nums font-medium">{formatMoney(item.amount)}</span>
          </li>
        ))}
        {invoice.paid > 0 && (
          <li className="flex justify-between gap-3 px-3 py-2 text-teal-700 dark:text-teal-400">
            <span>Payments received</span>
            <span className="tabular-nums">−{formatMoney(invoice.paid)}</span>
          </li>
        )}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Email to</span>
          <input
            type="email"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={readOnly}
            placeholder="homeowner@email.com"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">SMS to</span>
          <input
            type="tel"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={readOnly}
            placeholder="+1 555 123 4567"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Note on invoice (optional)</span>
        <textarea
          rows={2}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={readOnly}
          placeholder="Payment due within 7 days…"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            disabled={readOnly}
            className="rounded border-border"
          />
          <Mail className="h-4 w-4 text-muted-foreground" />
          Send email
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sendSms}
            onChange={(e) => setSendSms(e.target.checked)}
            disabled={readOnly}
            className="rounded border-border"
          />
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Send SMS
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly || sending}
          onClick={() => void handleSend()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Generate & send invoice
        </button>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted/40"
        >
          {showPreview ? "Hide preview" : "Preview HTML"}
        </button>
      </div>

      {showPreview && html ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe title="Invoice preview" srcDoc={html} className="h-[420px] w-full bg-white" />
        </div>
      ) : null}
    </div>
  );
}
