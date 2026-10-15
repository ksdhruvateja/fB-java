import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, FileText, Mail, Pencil, Phone, ShieldAlert } from "lucide-react";
import { api, CHECKIN_LABEL, STATUS_LABEL, type CUser, type Flag, type Job } from "../api";
import { Link } from "../router";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, cx, fromLocalInput, money, priorityTone, statusTone, toLocalInput, useLoad, when } from "../ui";
import { PageTitle, useSession } from "./Shell";
import { Fieldwork } from "./Fieldwork";
import { ApprovalsAndBilling } from "./Approvals";

export interface JobBundle {
  job: Job;
  visits: any[];
  files: any[];
  proposals: any[];
  approvals: any[];
  events: any[];
  exceptions: any[];
  customer: any;
  site: any;
  completion: { code: string; ok: boolean; label: string; detail: string; severity: string }[];
  dispatch_emails?: any[];
  invoices?: any[];
}

export function useTeam() {
  const { data } = useLoad(() => api.get<{ users: CUser[] }>("/team").then((r) => r.users), []);
  return data || [];
}

export function JobDetailPage({ id }: { id: number }) {
  const { isOffice } = useSession();
  const { data, error, loading, reload } = useLoad(() => api.get<JobBundle>(`/jobs/${id}`), [id]);
  const team = useTeam();
  if (loading && !data) return <Spinner />;
  if (error && !data) return <><BackLink /><ErrorNote error={error} /></>;
  const b = data!;
  const j = b.job;
  const needsReview = j.status === "received" && j.review_status !== "reviewed";
  const toAccept = j.status === "received" && j.review_status === "reviewed";

  return (
    <>
      <BackLink />
      <PageTitle
        title={<span className="flex flex-wrap items-center gap-2">{j.site_name || j.site_address || j.job_number}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{j.job_number}</span>·<span>WO {j.external_wo_number || "—"}</span>
            {j.po_number ? <>·<span>PO {j.po_number}</span></> : null}
            <Badge tone={statusTone(j.status)}>{STATUS_LABEL[j.status] || j.status}</Badge>
            {j.priority !== "routine" ? <Badge tone={priorityTone(j.priority)}>{j.priority}</Badge> : null}
          </span>
        }
      />

      {b.exceptions.filter((e) => e.status === "open").length ? (
        <div className="mb-4 space-y-2">
          {b.exceptions.filter((e) => e.status === "open").map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{e.title}</p>
                {e.detail ? <p className="whitespace-pre-line text-xs">{e.detail}</p> : null}
                <p className="mt-1 text-xs">Responsible: {e.assigned_name || "unassigned"}</p>
              </div>
              <Link to="/commercial/app/exceptions" className="text-xs font-semibold underline">Manage</Link>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {needsReview && isOffice ? <ReviewPanel bundle={b} onSaved={reload} /> : null}
          {toAccept && isOffice ? <AcceptPanel job={j} team={team} onDone={reload} /> : null}
          {j.status === "received" && !isOffice ? <Card><p className="text-sm">This dispatch has not been accepted yet.</p></Card> : null}
          {!["received", "declined", "cancelled"].includes(j.status) ? <Fieldwork bundle={b} team={team} onChange={reload} /> : null}
          {!["received", "declined", "cancelled"].includes(j.status) ? <ApprovalsAndBilling bundle={b} onChange={reload} /> : null}
          <Timeline events={b.events} timezone={j.timezone} />
        </div>
        <div className="space-y-4">
          <DetailsCard bundle={b} team={team} onSaved={reload} />
          <FilesCard files={b.files} />
          {isOffice && b.dispatch_emails?.length ? <OriginalEmails emails={b.dispatch_emails} /> : null}
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link to="/commercial/app/jobs" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground dark:text-muted-foreground">
      <ArrowLeft className="h-4 w-4" /> Jobs
    </Link>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────
function ReviewPanel({ bundle, onSaved }: { bundle: JobBundle; onSaved: () => void }) {
  const open = bundle.job.flags.filter((f) => !f.resolved);
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-600" />Review this dispatch</span>} className="border-red-200 dark:border-red-900">
      <p className="mb-4 text-sm text-muted-foreground">
        Check each field against the original email. Fix what is wrong, or explain flagged items that are correct as they are. A reviewed dispatch can then be accepted with an ETA.
      </p>
      <JobForm bundle={bundle} flags={open} onSaved={onSaved} reviewMode />
    </Card>
  );
}

const FIELD_FOR_FLAG: Record<string, string> = {};

function JobForm({ bundle, flags, onSaved, reviewMode, onCancel }: { bundle: JobBundle; flags: Flag[]; onSaved: () => void; reviewMode?: boolean; onCancel?: () => void }) {
  const j = bundle.job;
  const { canSeeMoney } = useSession();
  const { data: customers } = useLoad(() => api.get("/customers").then((r) => r.customers as any[]), []);
  const { data: sites } = useLoad(() => api.get("/sites").then((r) => r.sites as any[]), []);
  const [form, setForm] = useState(() => ({
    external_wo_number: j.external_wo_number, po_number: j.po_number, dispatcher_name: j.dispatcher_name, dispatcher_email: j.dispatcher_email,
    customer_id: j.customer_id ? String(j.customer_id) : "", billing_customer: j.billing_customer, site_id: j.site_id ? String(j.site_id) : "",
    site_name: j.site_name, site_address: j.site_address, scope: j.scope, trade: j.trade, priority: j.priority, due_at: toLocalInput(j.due_at),
    timezone: j.timezone, nte_amount: j.nte_amount == null ? "" : String(j.nte_amount), approval_conditions: j.approval_conditions,
    billing_instructions: j.billing_instructions, access_instructions: j.access_instructions, checkin_method: j.checkin_method, checkin_instructions: j.checkin_instructions,
    contacts: j.contacts?.length ? j.contacts : [{ name: "", phone: "", email: "", role: "" }],
  }));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "review">("");
  const [error, setError] = useState<unknown>(null);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const flagFor = (field: string) => flags.filter((f) => f.field === field || FIELD_FOR_FLAG[f.code] === field);

  async function save(markReviewed: boolean) {
    setBusy(markReviewed ? "review" : "save");
    setError(null);
    try {
      const payload: any = {
        ...form,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        site_id: form.site_id ? Number(form.site_id) : null,
        due_at: fromLocalInput(form.due_at),
        contacts: form.contacts.filter((c) => c.name || c.phone || c.email),
        resolve_flags: Object.entries(notes).filter(([, n]) => n.trim()).map(([code, note]) => ({ code, note })),
        mark_reviewed: markReviewed,
      };
      if (!canSeeMoney) delete payload.nte_amount;
      await api.patch(`/jobs/${j.id}`, payload);
      setNotes({});
      onSaved();
      onCancel?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  const FlagNotes = ({ field }: { field: string }) => (
    <>
      {flagFor(field).map((f) => (
        <div key={f.code} className={cx("mt-1.5 rounded-xl p-3 text-xs", f.severity === "blocking" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200")}>
          <p className="font-medium">{f.message}</p>
          <Input
            className="mt-1 text-xs"
            placeholder={f.severity === "blocking" ? "Correct the field above, or explain why it is right (e.g. “Confirmed by phone with dispatcher”)" : "Optional: note that you checked this"}
            value={notes[f.code] || ""}
            onChange={(e) => setNotes((n) => ({ ...n, [f.code]: e.target.value }))}
          />
        </div>
      ))}
    </>
  );

  const unmappedFlags = flags.filter((f) => !["external_wo_number", "site_address", "nte_amount", "scope", "due_at", "trade", "priority", "customer_id", "site_id", "checkin_method"].includes(f.field));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Work order # (external)"><Input value={form.external_wo_number} onChange={(e) => set("external_wo_number", e.target.value)} /><FlagNotes field="external_wo_number" /></Field>
        <Field label="PO #"><Input value={form.po_number} onChange={(e) => set("po_number", e.target.value)} /></Field>
        <Field label="Dispatching company"><Input value={form.dispatcher_name} onChange={(e) => set("dispatcher_name", e.target.value)} /></Field>
        <Field label="Dispatcher email"><Input type="email" value={form.dispatcher_email} onChange={(e) => set("dispatcher_email", e.target.value)} /></Field>
        <Field label="Customer profile" hint="Sets invoice recipients, subject format and submission method.">
          <Select value={form.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
            <option value="">Not linked</option>
            {(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <FlagNotes field="customer_id" />
        </Field>
        <Field label="Billing customer"><Input value={form.billing_customer} onChange={(e) => set("billing_customer", e.target.value)} /></Field>
        <Field label="Saved site">
          <Select value={form.site_id} onChange={(e) => {
            const s = (sites || []).find((x) => String(x.id) === e.target.value);
            setForm((f) => ({ ...f, site_id: e.target.value, ...(s ? { site_name: s.name || f.site_name, site_address: [s.address, s.city, s.state, s.zip].filter(Boolean).join(", ") || f.site_address, access_instructions: f.access_instructions || s.access_instructions, timezone: s.timezone || f.timezone } : {}) }));
          }}>
            <option value="">Not linked</option>
            {(sites || []).map((s) => <option key={s.id} value={s.id}>{[s.name, s.store_number && `#${s.store_number}`, s.city].filter(Boolean).join(" · ")}</option>)}
          </Select>
          <FlagNotes field="site_id" />
        </Field>
        <Field label="Site name"><Input value={form.site_name} onChange={(e) => set("site_name", e.target.value)} /></Field>
        <Field label="Site address" className="sm:col-span-2"><Input value={form.site_address} onChange={(e) => set("site_address", e.target.value)} placeholder="Street, city, state ZIP" /><FlagNotes field="site_address" /></Field>
        <Field label="Scope / problem" className="sm:col-span-2"><Textarea value={form.scope} onChange={(e) => set("scope", e.target.value)} /><FlagNotes field="scope" /></Field>
        <Field label="Trade"><Input value={form.trade} onChange={(e) => set("trade", e.target.value)} /><FlagNotes field="trade" /></Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="emergency">Emergency</option><option value="urgent">Urgent</option><option value="routine">Routine</option><option value="scheduled">Scheduled / PM</option>
          </Select>
          <FlagNotes field="priority" />
        </Field>
        <Field label="Due" hint={j.due_text ? `Email said: “${j.due_text}”` : undefined}><Input type="datetime-local" value={form.due_at} onChange={(e) => set("due_at", e.target.value)} /><FlagNotes field="due_at" /></Field>
        <Field label="Site time zone"><Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/Chicago" /></Field>
        {canSeeMoney ? <Field label="NTE (not to exceed)"><Input inputMode="decimal" value={form.nte_amount} onChange={(e) => set("nte_amount", e.target.value)} placeholder="650.00" /><FlagNotes field="nte_amount" /></Field> : null}
        <Field label="Customer check-in method">
          <Select value={form.checkin_method} onChange={(e) => set("checkin_method", e.target.value)}>
            {Object.entries(CHECKIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <FlagNotes field="checkin_method" />
        </Field>
        <Field label="Check-in instructions" className="sm:col-span-2"><Textarea value={form.checkin_instructions} onChange={(e) => set("checkin_instructions", e.target.value)} className="min-h-[60px]" /></Field>
        <Field label="Approval conditions" className="sm:col-span-2"><Textarea value={form.approval_conditions} onChange={(e) => set("approval_conditions", e.target.value)} className="min-h-[60px]" /></Field>
        <Field label="Access instructions"><Textarea value={form.access_instructions} onChange={(e) => set("access_instructions", e.target.value)} className="min-h-[60px]" /></Field>
        <Field label="Billing instructions"><Textarea value={form.billing_instructions} onChange={(e) => set("billing_instructions", e.target.value)} className="min-h-[60px]" /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Contacts</legend>
        <div className="space-y-2">
          {form.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["name", "phone", "email", "role"] as const).map((k) => (
                <Input key={k} placeholder={k} value={c[k]} onChange={(e) => set("contacts", form.contacts.map((x, xi) => (xi === i ? { ...x, [k]: e.target.value } : x)))} />
              ))}
            </div>
          ))}
          <Button tone="ghost" size="sm" onClick={() => set("contacts", [...form.contacts, { name: "", phone: "", email: "", role: "" }])}>+ Add contact</Button>
        </div>
      </fieldset>
      {unmappedFlags.length ? <div>{unmappedFlags.map((f) => <FlagNotes key={f.code} field={f.field} />)}</div> : null}
      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2">
        {reviewMode ? <Button tone="success" onClick={() => save(true)} busy={busy === "review"}><CheckCircle2 className="h-4 w-4" />Save & mark reviewed</Button> : null}
        <Button tone={reviewMode ? "secondary" : "primary"} onClick={() => save(false)} busy={busy === "save"}>Save changes</Button>
        {onCancel ? <Button tone="ghost" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </div>
  );
}

// ── Accept ───────────────────────────────────────────────────────────────────
function AcceptPanel({ job, team, onDone }: { job: Job; team: CUser[]; onDone: () => void }) {
  const [eta, setEta] = useState(() => toLocalInput(job.due_at && new Date(job.due_at) > new Date() ? job.due_at : new Date(Date.now() + 2 * 3600_000).toISOString()));
  const [assigned, setAssigned] = useState<number[]>([]);
  const [channel, setChannel] = useState(job.dispatcher_email ? "email" : "none");
  const [reference, setReference] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);
  const techs = team.filter((u) => u.active && !u.invited);

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      await api.post(`/jobs/${job.id}/accept`, {
        eta_at: fromLocalInput(eta), assigned_user_ids: assigned,
        notify: channel === "none" ? undefined : { channel, reference, recipient: job.dispatcher_email },
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await api.post(`/jobs/${job.id}/decline`, { reason });
      setDeclineOpen(false);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card title="Accept this work order" className="border-amber-300 dark:border-amber-800">
      <p className="mb-4 text-sm text-muted-foreground">Reviewed. Until you accept it, this is only a received dispatch.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ETA on site"><Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} /></Field>
        <Field label="Let the dispatcher know">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="none">Don’t send anything</option>
            <option value="email" disabled={!job.dispatcher_email}>Email acceptance to {job.dispatcher_email || "(no dispatcher email)"}</option>
            <option value="portal">I accepted it in their portal</option>
            <option value="phone">I accepted it by phone</option>
          </Select>
        </Field>
        {channel === "portal" || channel === "phone" ? <Field label="Reference / who you spoke to" className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field> : null}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Assign technicians</legend>
          <div className="flex flex-wrap gap-2">
            {techs.map((u) => {
              const on = assigned.includes(u.id);
              return (
                <button key={u.id} type="button" aria-pressed={on} onClick={() => setAssigned(on ? assigned.filter((x) => x !== u.id) : [...assigned, u.id])}
                  className={cx("rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-white" : "border-border")}>
                  {u.name || u.email} <span className="text-xs opacity-75">({u.role})</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="mt-4"><ErrorNote error={error} /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button tone="success" size="lg" onClick={accept} busy={busy === "accept"} disabled={!eta}>Accept with ETA</Button>
        <Button tone="secondary" onClick={() => setDeclineOpen(true)}>Decline</Button>
      </div>
      <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline this dispatch">
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Outside service area, no availability before due date…" /></Field>
        <div className="mt-4 flex gap-2"><Button tone="danger" onClick={decline} busy={busy === "decline"}>Decline</Button><Button tone="ghost" onClick={() => setDeclineOpen(false)}>Cancel</Button></div>
      </Modal>
    </Card>
  );
}

// ── Details ──────────────────────────────────────────────────────────────────
function DetailsCard({ bundle, team, onSaved }: { bundle: JobBundle; team: CUser[]; onSaved: () => void }) {
  const { isOffice, canSeeMoney } = useSession();
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const j = bundle.job;
  const names = useMemo(() => new Map(team.map((u) => [u.id, u.name || u.email])), [team]);
  const row = (label: string, value: React.ReactNode) => (value ? (
    <div className="py-2"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-0.5 whitespace-pre-line text-sm">{value}</dd></div>
  ) : null);
  return (
    <Card title="Work order" actions={isOffice && j.status !== "received" ? <Button tone="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button> : null}>
      <dl className="divide-y divide-border">
        {row("Site", <>{j.site_name}{j.site_address ? <><br /><a className="text-primary underline" href={`https://maps.google.com/?q=${encodeURIComponent(j.site_address)}`} target="_blank" rel="noreferrer">{j.site_address}</a></> : null}</>)}
        {row("Due", j.due_at ? `${when(j.due_at, j.timezone)}${new Date(j.due_at) < new Date() && !["completed", "invoiced", "paid"].includes(j.status) ? " — overdue" : ""}` : j.due_text)}
        {row("ETA", j.eta_at ? when(j.eta_at, j.timezone) : "")}
        {canSeeMoney ? row("NTE / authorized", j.nte_amount != null || j.authorized_amount != null ? `${money(j.nte_amount)} original${j.authorized_amount != null && Number(j.authorized_amount) !== Number(j.nte_amount) ? ` · ${money(j.authorized_amount)} authorized now` : ""}` : "No NTE on file") : null}
        {row("Scope", j.scope)}
        {row("Trade", j.trade)}
        {row("Dispatched by", [j.dispatcher_name, j.dispatcher_email].filter(Boolean).join(" · "))}
        {row("Billing customer", j.billing_customer)}
        {row("Customer check-in", j.checkin_method !== "none" ? `${CHECKIN_LABEL[j.checkin_method] || j.checkin_method}${j.checkin_instructions ? `\n${j.checkin_instructions}` : ""}` : "")}
        {row("Access", j.access_instructions)}
        {row("Approval conditions", j.approval_conditions)}
        {isOffice ? row("Billing instructions", j.billing_instructions) : null}
        {j.contacts?.length ? row("Contacts", <ul className="space-y-1">{j.contacts.map((c, i) => (
          <li key={i}>{c.name}{c.role ? ` (${c.role})` : ""}{c.phone ? <> · <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{c.phone}</a></> : null}{c.email ? <> · <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="h-3 w-3" />{c.email}</a></> : null}</li>
        ))}</ul>) : null}
        {row("Technicians", <span className="flex flex-wrap items-center gap-2">{j.assigned_user_ids?.length ? j.assigned_user_ids.map((id) => names.get(id) || `#${id}`).join(", ") : "None assigned"}{isOffice && j.status !== "received" ? <Button tone="ghost" size="sm" onClick={() => setAssignOpen(true)}>Change</Button> : null}</span>)}
        {bundle.customer ? row("Customer profile", `${bundle.customer.name} · invoices via ${bundle.customer.submission_method}`) : null}
      </dl>
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit work order" wide>
        <JobForm bundle={bundle} flags={j.flags.filter((f) => !f.resolved)} onSaved={onSaved} onCancel={() => setEditing(false)} />
      </Modal>
      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} job={j} team={team} onSaved={onSaved} />
    </Card>
  );
}

function AssignModal({ open, onClose, job, team, onSaved }: { open: boolean; onClose: () => void; job: Job; team: CUser[]; onSaved: () => void }) {
  const [ids, setIds] = useState<number[]>(job.assigned_user_ids || []);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setIds(job.assigned_user_ids || []), [job.assigned_user_ids, open]);
  return (
    <Modal open={open} onClose={onClose} title="Assign technicians">
      <div className="space-y-2">
        {team.filter((u) => u.active).map((u) => (
          <label key={u.id} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={ids.includes(u.id)} onChange={(e) => setIds(e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id))} />
            {u.name || u.email} <span className="text-xs text-muted-foreground">{u.role}{u.invited ? " · invite pending" : ""}</span>
          </label>
        ))}
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <div className="mt-4 flex gap-2">
        <Button onClick={async () => { try { await api.post(`/jobs/${job.id}/assign`, { assigned_user_ids: ids }); onSaved(); onClose(); } catch (e) { setError(e); } }}>Save</Button>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function FilesCard({ files }: { files: any[] }) {
  if (!files.length) return null;
  const photos = files.filter((f) => f.kind === "photo");
  const docs = files.filter((f) => f.kind !== "photo");
  return (
    <Card title={`Photos & files (${files.length})`}>
      {photos.length ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="group relative block aspect-square overflow-hidden rounded-xl bg-muted">
              <img src={p.url} alt={p.caption || `${p.stage} photo`} className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{p.stage}</span>
            </a>
          ))}
        </div>
      ) : null}
      {docs.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {docs.map((d) => <li key={d.id}><a href={d.url} className="inline-flex items-center gap-2 text-primary underline"><FileText className="h-4 w-4" />{d.file_name || `File ${d.id}`}</a></li>)}
        </ul>
      ) : null}
    </Card>
  );
}

function OriginalEmails({ emails }: { emails: any[] }) {
  const [open, setOpen] = useState<any>(null);
  return (
    <Card title="Original dispatch emails">
      <ul className="space-y-2 text-sm">
        {emails.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{e.subject || "(no subject)"}</span>
              <span className="text-xs text-muted-foreground">{when(e.created_at)} · {e.outcome.replace(/_/g, " ")}</span>
            </span>
            <Button tone="ghost" size="sm" onClick={async () => setOpen((await api.get(`/dispatch-emails/${e.id}`)).email)}>View</Button>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject || "Original email"} wide>
        <p className="mb-2 text-xs text-muted-foreground">From {open?.from_address || "unknown"} · added {open ? when(open.created_at) : ""} · kept exactly as received</p>
        <pre className="max-h-[60svh] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-xs ">{open?.raw_text}</pre>
      </Modal>
    </Card>
  );
}

function Timeline({ events, timezone }: { events: any[]; timezone: string }) {
  const [all, setAll] = useState(false);
  const list = all ? events : events.slice(-12);
  return (
    <Card title={<span className="flex items-center gap-2"><Clock className="h-4 w-4" />History</span>} actions={events.length > 12 ? <Button tone="ghost" size="sm" onClick={() => setAll(!all)}>{all ? "Show recent" : `Show all ${events.length}`}</Button> : null}>
      <ol className="relative ml-2 border-l border-border">
        {list.map((e) => (
          <li key={e.id} className="ml-4 pb-3">
            <span className={cx("absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background", /fail|declined|exception|unclear/.test(e.kind + e.summary) ? "bg-red-500" : /approv|completed|paid|accepted|sent/.test(e.kind) ? "bg-emerald-500" : "bg-muted-foreground")} />
            <p className="text-sm">{e.summary}</p>
            <p className="text-xs text-muted-foreground">{when(e.occurred_at, timezone)}{e.actor_name ? ` · ${e.actor_name}` : ""}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

