import { useState } from "react";
import { Copy, Plus, UserPlus } from "lucide-react";
import { api, CHECKIN_LABEL, type CUser } from "../api";
import { outbox, discardOutboxItem, flushOutbox } from "../outbox";
import { Link } from "../router";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, cx, money, useLoad, when } from "../ui";
import { PageTitle, useSession } from "./Shell";

// ── Exceptions ──────────────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  dispatch_review: "Dispatch review", dispatch_update: "Dispatch changed", external_checkin_failed: "Customer check-in", external_checkout_failed: "Customer check-out",
  no_access: "No access", ambiguous_reply: "Unclear approval", invoice_delivery_failed: "Invoice bounced", invoice_disputed: "Invoice disputed", delivery_failed: "Not delivered",
};

export function ExceptionsPage() {
  const { isOffice } = useSession();
  const [status, setStatus] = useState("open");
  const { data, error, loading, reload } = useLoad(() => api.get(`/exceptions?status=${status}`), [status]);
  const { data: team } = useLoad(() => api.get("/team").then((r) => r.users as CUser[]), []);
  const [resolving, setResolving] = useState<any>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<unknown>(null);
  return (
    <>
      <PageTitle title="Exceptions" subtitle="Every problem has one responsible person until it is resolved." />
      <div className="mb-4 flex gap-1">
        {["open", "resolved"].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={cx("rounded-full px-3 py-1.5 text-sm font-medium capitalize", status === s ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white dark:bg-slate-900")}>{s}</button>)}
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !data.exceptions.length ? <Empty>{status === "open" ? "No open exceptions." : "Nothing resolved yet."}</Empty> : (
        <ul className="space-y-3">
          {data.exceptions.map((e: any) => (
            <li key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={status === "open" ? "amber" : "green"}>{KIND_LABEL[e.kind] || e.kind}</Badge>
                <span className="font-semibold">{e.title}</span>
                {e.job_id ? <Link to={`/commercial/app/jobs/${e.job_id}`} className="text-sm text-primary underline">{e.job_number}</Link> : null}
                <span className="ml-auto text-xs text-slate-500">{when(e.created_at)}</span>
              </div>
              {e.detail ? <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{e.detail}</p> : null}
              {status === "open" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Responsible:</span>
                  {isOffice ? (
                    <Select className="w-auto" value={e.assigned_user_id || ""} onChange={async (ev) => { try { await api.patch(`/exceptions/${e.id}`, { assigned_user_id: Number(ev.target.value) }); reload(); } catch (x) { setErr(x); } }}>
                      {(team || []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                    </Select>
                  ) : <span className="text-sm font-medium">{e.assigned_name}</span>}
                  <Button size="sm" tone="success" className="ml-auto" onClick={() => { setResolving(e); setNote(""); }}>Resolve</Button>
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">Resolved {when(e.resolved_at)}: {e.resolution_note}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><ErrorNote error={err} /></div>
      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Resolve exception">
        <p className="mb-2 text-sm">{resolving?.title}</p>
        <Field label="How was it resolved?"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button className="mt-4" tone="success" disabled={note.trim().length < 3} onClick={async () => { try { await api.patch(`/exceptions/${resolving.id}`, { status: "resolved", resolution_note: note }); setResolving(null); reload(); } catch (x) { setErr(x); } }}>Resolve</Button>
      </Modal>
    </>
  );
}

// ── Customers & sites ───────────────────────────────────────────────────────
const BLANK_CUSTOMER = {
  name: "", kind: "facility_manager", email_domains: "", billing_email: "", invoice_recipients: "", submission_method: "email", portal_name: "", portal_url: "",
  subject_format: "Invoice {invoice_number} - WO {wo_number} - {site_name}", checkin_method: "none", checkin_instructions: "", billing_instructions: "",
  payment_terms_days: 30, requires_completion_photos: true, requires_signoff: false, notes: "",
};
const BLANK_SITE = { customer_id: "", name: "", store_number: "", address: "", city: "", state: "", zip: "", timezone: "", access_instructions: "", contact_name: "", contact_phone: "", notes: "" };

export function CustomersPage() {
  const customers = useLoad(() => api.get("/customers").then((r) => r.customers as any[]), []);
  const sites = useLoad(() => api.get("/sites").then((r) => r.sites as any[]), []);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [editSite, setEditSite] = useState<any>(null);
  return (
    <>
      <PageTitle title="Customers & sites" subtitle="Each customer profile sets how dispatches are matched, how check-in works, and how invoices are submitted." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Customers" actions={<Button size="sm" onClick={() => setEditCustomer({ ...BLANK_CUSTOMER })}><Plus className="h-4 w-4" />Add customer</Button>}>
          {customers.loading && !customers.data ? <Spinner /> : !customers.data?.length ? <Empty>Add the facility managers and companies that send you work orders.</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {customers.data.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-slate-500">Invoices via {c.submission_method}{c.submission_method === "email" && (c.invoice_recipients || c.billing_email) ? ` to ${c.invoice_recipients || c.billing_email}` : c.portal_name ? ` (${c.portal_name})` : ""} · check-in: {CHECKIN_LABEL[c.checkin_method]} · {c.site_count} sites</p>
                    {c.email_domains?.length ? <p className="text-xs text-slate-500">Dispatches from @{c.email_domains.join(", @")}</p> : null}
                  </div>
                  <Button size="sm" tone="ghost" onClick={() => setEditCustomer({ ...c, email_domains: (c.email_domains || []).join(", ") })}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Sites" actions={<Button size="sm" onClick={() => setEditSite({ ...BLANK_SITE })}><Plus className="h-4 w-4" />Add site</Button>}>
          {sites.loading && !sites.data ? <Spinner /> : !sites.data?.length ? <Empty>Sites are matched by store number or address when dispatches arrive.</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {sites.data.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.name || s.address}{s.store_number ? ` #${s.store_number}` : ""}</p>
                    <p className="text-xs text-slate-500">{[s.address, s.city, s.state, s.zip].filter(Boolean).join(", ")}{s.customer_name ? ` · ${s.customer_name}` : ""}</p>
                  </div>
                  <Button size="sm" tone="ghost" onClick={() => setEditSite({ ...s, customer_id: s.customer_id ? String(s.customer_id) : "" })}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editCustomer ? <CustomerModal value={editCustomer} onClose={() => setEditCustomer(null)} onSaved={() => { setEditCustomer(null); customers.reload(); }} /> : null}
      {editSite ? <SiteModal value={editSite} customers={customers.data || []} onClose={() => setEditSite(null)} onSaved={() => { setEditSite(null); sites.reload(); }} /> : null}
    </>
  );
}

function CustomerModal({ value, onClose, onSaved }: { value: any; onClose: () => void; onSaved: () => void }) {
  const [f, setForm] = useState<any>(value);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm({ ...f, [k]: v });
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit ${f.name}` : "Add customer"} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="facility_manager">Facility management company</option><option value="property_manager">Property manager</option><option value="retailer">Retailer / owner</option><option value="general_contractor">General contractor</option><option value="other">Other</option></Select></Field>
        <Field label="Dispatch email domains" hint="Used to match incoming dispatches, e.g. northwindfs.com"><Input value={f.email_domains} onChange={(e) => set("email_domains", e.target.value)} /></Field>
        <Field label="Payment terms (days)"><Input inputMode="numeric" value={f.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
        <Field label="Invoice submission method"><Select value={f.submission_method} onChange={(e) => set("submission_method", e.target.value)}><option value="email">Email</option><option value="portal">Customer portal</option><option value="mail">Mail</option><option value="other">Other</option></Select></Field>
        {f.submission_method === "email" ? (
          <Field label="Invoice recipients" hint="Comma-separated"><Input value={f.invoice_recipients} onChange={(e) => set("invoice_recipients", e.target.value)} placeholder="ap@customer.com" /></Field>
        ) : (
          <Field label="Portal name"><Input value={f.portal_name} onChange={(e) => set("portal_name", e.target.value)} placeholder="ServiceChannel, Corrigo…" /></Field>
        )}
        <Field label="Billing email"><Input type="email" value={f.billing_email} onChange={(e) => set("billing_email", e.target.value)} /></Field>
        {f.submission_method === "portal" ? <Field label="Portal link"><Input value={f.portal_url} onChange={(e) => set("portal_url", e.target.value)} placeholder="https://" /></Field> : null}
        <Field label="Invoice email subject" hint="Use {invoice_number}, {wo_number}, {site_name}, {po_number}, {company}" className="sm:col-span-2"><Input value={f.subject_format} onChange={(e) => set("subject_format", e.target.value)} /></Field>
        <Field label="Customer check-in method"><Select value={f.checkin_method} onChange={(e) => set("checkin_method", e.target.value)}>{Object.entries(CHECKIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Check-in instructions"><Input value={f.checkin_instructions} onChange={(e) => set("checkin_instructions", e.target.value)} placeholder="Call IVR 1-800-… with WO# and PIN" /></Field>
        <Field label="Billing instructions" className="sm:col-span-2"><Textarea value={f.billing_instructions} onChange={(e) => set("billing_instructions", e.target.value)} className="min-h-[60px]" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requires_completion_photos} onChange={(e) => set("requires_completion_photos", e.target.checked)} />Requires after photos to close a job</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requires_signoff} onChange={(e) => set("requires_signoff", e.target.checked)} />Requires on-site sign-off name</label>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[60px]" /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4" busy={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          const body = { ...f, payment_terms_days: Number(f.payment_terms_days) };
          if (f.id) await api.patch(`/customers/${f.id}`, body);
          else await api.post("/customers", body);
          onSaved();
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}>Save</Button>
    </Modal>
  );
}

function SiteModal({ value, customers, onClose, onSaved }: { value: any; customers: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setForm] = useState<any>(value);
  const [error, setError] = useState<unknown>(null);
  const set = (k: string, v: any) => setForm({ ...f, [k]: v });
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit site" : "Add site"} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer"><Select value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Site name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Store / site number"><Input value={f.store_number} onChange={(e) => set("store_number", e.target.value)} /></Field>
        <Field label="Time zone" hint="e.g. America/Chicago"><Input value={f.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
        <Field label="Street address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="State"><Input value={f.state} onChange={(e) => set("state", e.target.value)} /></Field><Field label="ZIP"><Input value={f.zip} onChange={(e) => set("zip", e.target.value)} /></Field></div>
        <Field label="Site contact"><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
        <Field label="Site phone"><Input value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></Field>
        <Field label="Access instructions" className="sm:col-span-2"><Textarea value={f.access_instructions} onChange={(e) => set("access_instructions", e.target.value)} className="min-h-[60px]" /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4" onClick={async () => {
        try {
          const body = { ...f, customer_id: f.customer_id ? Number(f.customer_id) : null };
          if (f.id) await api.patch(`/sites/${f.id}`, body);
          else await api.post("/sites", body);
          onSaved();
        } catch (e) {
          setError(e);
        }
      }}>Save</Button>
    </Modal>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────
export function TeamPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useLoad(() => api.get("/team"), []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "technician", can_view_financials: false });
  const [link, setLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const owner = user.role === "owner";
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  return (
    <>
      <PageTitle title="Team" subtitle={`${data.seats_used} of ${data.seats} seats used. Additional users are $15/user/month.`}
        actions={owner ? <Button onClick={() => { setInviteOpen(true); setLink(null); }} disabled={data.seats_used >= data.seats}><UserPlus className="h-4 w-4" />Invite</Button> : null} />
      {data.seats_used >= data.seats && owner ? <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">All seats are in use. Contact FixBridge to add a seat, or deactivate someone who no longer needs access.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="whitespace-nowrap bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50"><tr><th className="px-4 py-2">Person</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Sees prices & invoices</th><th className="px-4 py-2">Status</th>{owner ? <th /> : null}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.users.map((u: CUser) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><p className="font-medium">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className="px-4 py-3">
                  {owner && u.id !== user.id ? (
                    <Select className="w-auto" value={u.role} onChange={async (e) => { try { await api.patch(`/team/${u.id}`, { role: e.target.value }); reload(); } catch (x) { setErr(x); } }}>
                      <option value="owner">Owner</option><option value="office">Office</option><option value="technician">Technician</option>
                    </Select>
                  ) : <span className="capitalize">{u.role}</span>}
                </td>
                <td className="px-4 py-3">
                  {u.role === "technician" && owner ? (
                    <input type="checkbox" aria-label="Can see prices and invoices" checked={u.can_view_financials} onChange={async (e) => { try { await api.patch(`/team/${u.id}`, { can_view_financials: e.target.checked }); reload(); } catch (x) { setErr(x); } }} />
                  ) : u.can_view_financials ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3">{!u.active ? <Badge tone="slate">Deactivated</Badge> : u.invited ? <Badge tone="amber">Invite pending</Badge> : <Badge tone="green">Active</Badge>}</td>
                {owner ? (
                  <td className="px-4 py-3 text-right">
                    {u.id !== user.id ? (
                      <span className="inline-flex gap-1">
                        {u.invited && u.active ? <Button size="sm" tone="ghost" onClick={async () => { try { const r = await api.patch(`/team/${u.id}`, { reissue_invite: true }); setLink({ email: u.email, url: r.invite_link, emailed: false }); setInviteOpen(true); } catch (x) { setErr(x); } }}>New invite link</Button> : null}
                        <Button size="sm" tone="ghost" onClick={async () => { try { await api.patch(`/team/${u.id}`, { active: !u.active }); reload(); } catch (x) { setErr(x); } }}>{u.active ? "Deactivate" : "Reactivate"}</Button>
                      </span>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3"><ErrorNote error={err} /></div>
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={link ? "Invite link" : "Invite a team member"}>
        {link ? (
          <div className="space-y-3 text-sm">
            <p>{link.emailed ? `We emailed ${link.email} an invite.` : `Send this link to ${link.email}.`} It works once and expires in 7 days.</p>
            <div className="flex gap-2"><Input readOnly value={link.url} onFocus={(e) => e.target.select()} /><Button tone="secondary" onClick={() => navigator.clipboard?.writeText(link.url)} aria-label="Copy link"><Copy className="h-4 w-4" /></Button></div>
            <Button onClick={() => setInviteOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="technician">Technician — sees assigned jobs</option><option value="office">Office — sees everything</option></Select></Field>
            {form.role === "technician" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.can_view_financials} onChange={(e) => setForm({ ...form, can_view_financials: e.target.checked })} />Can see prices, NTE and invoices</label> : null}
            <ErrorNote error={err} />
            <Button onClick={async () => {
              setErr(null);
              try {
                const r = await api.post("/team", form);
                setLink({ email: form.email, url: r.invite_link, emailed: r.emailed });
                setForm({ name: "", email: "", phone: "", role: "technician", can_view_financials: false });
                reload();
              } catch (x) {
                setErr(x);
              }
            }}>Create invite</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user, company, refresh } = useSession();
  const owner = user.role === "owner";
  const { data: team } = useLoad(() => api.get("/team").then((r) => r.users as CUser[]), []);
  const [form, setForm] = useState({ name: company.name, email: company.email, phone: company.phone, timezone: company.timezone, service_area: company.service_area || "", labor_rate: company.labor_rate == null ? "" : String(company.labor_rate), default_assignee_user_id: company.default_assignee_user_id ? String(company.default_assignee_user_id) : "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [items, setItems] = useState(outbox.items());
  const billing = company.billing;
  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid gap-4 xl:grid-cols-2">
        {owner ? (
          <Card title="Company">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Reply-to email" hint="Customers’ replies to emails sent from FixBridge go here."><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Default time zone"><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
              <Field label="Default labor rate ($/hour)" hint="Used for invoice drafts without an approved proposal."><Input inputMode="decimal" value={form.labor_rate} onChange={(e) => setForm({ ...form, labor_rate: e.target.value })} /></Field>
              <Field label="Exceptions go to" hint="Unassigned problems (bounces, failed check-ins) land with this person.">
                <Select value={form.default_assignee_user_id} onChange={(e) => setForm({ ...form, default_assignee_user_id: e.target.value })}>
                  <option value="">Company owner</option>
                  {(team || []).filter((u) => u.active && u.role !== "technician").map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </Select>
              </Field>
              <Field label="Service area" className="sm:col-span-2"><Input value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} /></Field>
            </div>
            <div className="mt-3"><ErrorNote error={error} /></div>
            <Button className="mt-4" onClick={async () => {
              setError(null);
              try {
                await api.patch("/company", { ...form, labor_rate: form.labor_rate === "" ? null : Number(form.labor_rate), default_assignee_user_id: form.default_assignee_user_id ? Number(form.default_assignee_user_id) : null });
                setSaved(true);
                await refresh();
              } catch (e) {
                setError(e);
              }
            }}>Save</Button>
            {saved ? <span className="ml-3 text-sm text-emerald-700">Saved.</span> : null}
          </Card>
        ) : (
          <Card title="Your account"><p className="text-sm">{user.name} · {user.email} · <span className="capitalize">{user.role}</span></p><p className="mt-1 text-sm text-slate-500">{company.name}</p></Card>
        )}
        {owner && billing ? (
          <Card title="Plan">
            <p className="text-lg font-semibold capitalize">{billing.plan === "network" ? "Network (free)" : `Commercial ${billing.plan}`} · {billing.seats} users</p>
            {company.founding_member ? <Badge tone="orange" className="mt-1">Founding contractor</Badge> : null}
            <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
              {billing.phase === "waiting" ? <p>Your 30 free days start once {billing.waiting_for.join(" and ")} {billing.waiting_for.length > 1 ? "are" : "is"} done.</p> : null}
              {billing.phase === "trial" ? <p>Free until {when(billing.trial_ends_at)}. Then {money(billing.founding_monthly)}/month until {when(billing.founding_price_ends_at)}.</p> : null}
              {billing.phase === "founding" ? <p>Founding price {money(billing.founding_monthly)}/month until {when(billing.founding_price_ends_at)}, then {money(billing.standard_monthly)}/month with advance notice.</p> : null}
              {billing.phase === "standard" ? <p>{money(billing.monthly)}/month.</p> : null}
              <p className="mt-2 text-xs text-slate-500">Pilot: no card on file and nothing is charged through FixBridge yet. Cancel monthly; no setup fee.</p>
            </div>
          </Card>
        ) : null}
        <Card title="This phone’s outbox">
          {!items.length ? <p className="text-sm text-slate-500">Nothing waiting to sync.</p> : (
            <ul className="space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2">
                  <span>{i.label} <span className="text-xs text-slate-500">({when(i.queued_at)})</span>{i.last_error ? <span className="block text-xs text-red-600">{i.last_error}</span> : null}</span>
                  <Button size="sm" tone="ghost" onClick={() => { discardOutboxItem(i.id); setItems(outbox.items()); }}>Discard</Button>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-3" size="sm" tone="secondary" onClick={async () => { await flushOutbox(); setItems(outbox.items()); }}>Sync now</Button>
        </Card>
      </div>
    </>
  );
}
