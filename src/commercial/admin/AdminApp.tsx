import { useEffect, useState } from "react";
import { Building2, ClipboardList, Copy, LayoutDashboard, LogOut } from "lucide-react";
import { adminApi, tokens } from "../api";
import { CommercialLogo } from "../CommercialLogo";
import { Link, navigate } from "../router";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, cx, money, useLoad, when } from "../ui";

/** FixBridge Commercial admin. Its own accounts and token; it has no access to the marketplace admin. */
export default function AdminApp({ path }: { path: string }) {
  const [admin, setAdmin] = useState<{ email: string; name: string } | null>(null);
  useEffect(() => {
    if (!tokens.admin()) return navigate("/commercial/admin/login", { replace: true });
    adminApi.get("/me").then((r) => setAdmin(r.admin)).catch(() => {
      tokens.setAdmin("");
      navigate("/commercial/admin/login", { replace: true });
    });
  }, []);
  useEffect(() => {
    document.title = "Commercial admin · FixBridge";
  }, [path]);
  if (!admin) return <Spinner />;
  const nav = [
    { to: "/commercial/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/commercial/admin/applications", label: "Pilot applications", icon: ClipboardList },
    { to: "/commercial/admin/companies", label: "Companies", icon: Building2 },
  ];
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#fbfbfd]/80 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#161617]/80">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
          <CommercialLogo small />
          <span className="rounded-full bg-[#1d1d1f] px-2.5 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">Admin</span>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1 sm:order-none sm:w-auto">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition", path === n.to ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <n.icon className="h-3.5 w-3.5" />{n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden text-[12px] text-muted-foreground md:inline">{admin.email}</span>
          <button type="button" onClick={() => { tokens.setAdmin(""); navigate("/commercial/admin/login"); }} className="flex items-center gap-1 text-[13px] text-primary hover:underline">
            <LogOut className="h-3.5 w-3.5" />Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-10">
        {path === "/commercial/admin/applications" ? <Applications /> : path === "/commercial/admin/companies" ? <Companies /> : <Overview />}
      </main>
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad(() => adminApi.get("/summary"), []);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner />;
  const s = data.summary;
  const tiles = [
    ["New applications", s.new_applications, "/commercial/admin/applications"],
    ["Companies", s.companies, "/commercial/admin/companies"],
    ["Founding spots used", `${s.founding} / ${s.founding_limit}`, "/commercial/admin/companies"],
    ["Jobs (30 days)", s.jobs_30d, null],
    ["Jobs (all time)", s.jobs, null],
    ["Open exceptions", s.open_exceptions, null],
  ] as const;
  return (
    <>
      <h1 className="mb-8 text-[40px] font-semibold leading-none tracking-[-0.03em]">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([label, value, to]) => {
          const body = (
            <div className="rounded-2xl bg-card p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-bold">{value}</p>
            </div>
          );
          return to ? <Link key={label} to={to}>{body}</Link> : <div key={label}>{body}</div>;
        })}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">This panel manages FixBridge Commercial only. Homeowner and contractor marketplace administration stays in the main admin panel.</p>
    </>
  );
}

function Applications() {
  const [status, setStatus] = useState("new");
  const { data, error, loading, reload } = useLoad(() => adminApi.get(`/applications${status ? `?status=${status}` : ""}`), [status]);
  const [approving, setApproving] = useState<any>(null);
  const [declining, setDeclining] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  return (
    <>
      <h1 className="mb-6 text-[40px] font-semibold leading-none tracking-[-0.03em]">Pilot applications</h1>
      <div className="mb-4 flex gap-1">
        {["new", "approved", "declined", ""].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={cx("rounded-full px-4 py-1.5 text-[13px] capitalize", status === s ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>{s || "all"}</button>)}
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !data.applications.length ? <Empty>No applications.</Empty> : (
        <ul className="space-y-3">
          {data.applications.map((a: any) => (
            <li key={a.id} className="rounded-2xl bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{a.company_name}</span>
                <Badge tone={a.status === "new" ? "amber" : a.status === "approved" ? "green" : "red"}>{a.status}</Badge>
                <Badge>{a.plan_interest}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{when(a.created_at)}</span>
              </div>
              <p className="mt-1 text-sm">{a.contact_name} · <a className="text-primary underline" href={`mailto:${a.email}`}>{a.email}</a>{a.phone ? ` · ${a.phone}` : ""}</p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">Trades: </dt><dd className="inline">{a.trades.join(", ")}</dd></div>
                <div><dt className="inline text-muted-foreground">Area: </dt><dd className="inline">{a.service_area || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Team: </dt><dd className="inline">{a.team_size || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Work orders/month: </dt><dd className="inline">{a.monthly_dispatch_volume || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Dispatch sources: </dt><dd className="inline">{a.dispatch_sources || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Uses today: </dt><dd className="inline">{a.current_tools || "—"}</dd></div>
              </dl>
              {a.message ? <p className="mt-2 whitespace-pre-line rounded-xl bg-muted p-3 text-sm ">{a.message}</p> : null}
              {a.decision_note ? <p className="mt-2 text-xs text-muted-foreground">Note: {a.decision_note}</p> : null}
              {a.status === "new" ? (
                <div className="mt-3 flex gap-2">
                  <Button tone="success" size="sm" onClick={() => setApproving(a)}>Approve</Button>
                  <Button tone="secondary" size="sm" onClick={() => setDeclining(a)}>Decline</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {approving ? <ApproveModal app={approving} onClose={() => setApproving(null)} onDone={(r) => { setApproving(null); setResult(r); reload(); }} /> : null}
      {declining ? <DeclineModal app={declining} onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); reload(); }} /> : null}
      <Modal open={!!result} onClose={() => setResult(null)} title="Company created">
        {result ? (
          <div className="space-y-3 text-sm">
            <p>{result.company.name} is set up. {result.emailed ? `We emailed ${result.owner.email} a link to set their password.` : `Email is not configured or was not sent — share this link with ${result.owner.email}:`}</p>
            <InviteLink url={result.invite_link} />
            <p className="text-xs text-muted-foreground">The link works once and expires in 7 days. You can issue a new one from Companies.</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function InviteLink({ url }: { url: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} onFocus={(e) => e.target.select()} />
      <Button tone="secondary" onClick={() => navigator.clipboard?.writeText(url)} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

function ApproveModal({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: (r: any) => void }) {
  const [plan, setPlan] = useState(app.plan_interest === "network" ? "network" : app.plan_interest || "essentials");
  const [founding, setFounding] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal open onClose={onClose} title={`Approve ${app.company_name}`}>
      <div className="space-y-3">
        <Field label="Plan"><Select value={plan} onChange={(e) => setPlan(e.target.value)}><option value="essentials">Commercial Essentials (3 users)</option><option value="team">Commercial Team (10 users)</option><option value="network">Network (free)</option></Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={founding} onChange={(e) => setFounding(e.target.checked)} />Founding contractor (first 10 companies: 30 days free after setup and first real job, then $49/mo for 12 months)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />Email the set-password link to {app.email}</label>
        <Field label="Internal note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px]" /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4" tone="success" busy={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          onDone(await adminApi.post(`/applications/${app.id}/approve`, { plan, founding_member: founding, send_email: sendEmail, note }));
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}>Create company</Button>
    </Modal>
  );
}

function DeclineModal({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal open onClose={onClose} title={`Decline ${app.company_name}`}>
      <Field label="Internal note (not sent)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4" tone="danger" onClick={async () => { try { await adminApi.post(`/applications/${app.id}/decline`, { note }); onDone(); } catch (e) { setError(e); } }}>Decline</Button>
    </Modal>
  );
}

const PHASE: Record<string, string> = { waiting: "Waiting to start trial", trial: "Free trial", founding: "Founding price", standard: "Standard price" };

function Companies() {
  const { data, error, loading, reload } = useLoad(() => adminApi.get("/companies"), []);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <h1 className="mb-6 text-[40px] font-semibold leading-none tracking-[-0.03em]">Companies</h1>
      {loading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !data.companies.length ? <Empty>No companies yet. Approve a pilot application to create one.</Empty> : (
        <div className="overflow-x-auto rounded-2xl bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="whitespace-nowrap bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground /50">
              <tr><th className="px-4 py-2">Company</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Billing</th><th className="px-4 py-2">Users</th><th className="px-4 py-2">Jobs</th><th className="px-4 py-2">Open exceptions</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.companies.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-3"><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.email}</p></td>
                  <td className="px-4 py-3 capitalize">{c.plan}{c.extra_seats ? ` +${c.extra_seats}` : ""}{c.founding_member ? <Badge tone="orange" className="ml-1">Founding</Badge> : null}</td>
                  <td className="px-4 py-3"><Badge tone={c.status === "active" || c.status === "pilot" ? "green" : "red"}>{c.status}</Badge></td>
                  <td className="px-4 py-3">{PHASE[c.billing.phase]}<div className="text-xs text-muted-foreground">{money(c.billing.monthly)}/mo{c.billing.waiting_for?.length ? ` · waiting for ${c.billing.waiting_for.join(", ")}` : ""}</div></td>
                  <td className="px-4 py-3">{c.active_users} / {c.billing.seats}</td>
                  <td className="px-4 py-3">{c.job_count}{c.last_job_at ? <div className="text-xs text-muted-foreground">last {when(c.last_job_at)}</div> : null}</td>
                  <td className="px-4 py-3">{c.open_exceptions}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" tone="secondary" onClick={() => setOpen(c.id)}>Manage</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? <CompanyModal id={open} onClose={() => setOpen(null)} onSaved={reload} /> : null}
    </>
  );
}

function CompanyModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const { data, error, reload } = useLoad(() => adminApi.get(`/companies/${id}`), [id]);
  const [form, setForm] = useState<any>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [link, setLink] = useState("");
  useEffect(() => {
    if (data) setForm({ plan: data.company.plan, status: data.company.status, extra_seats: data.company.extra_seats, founding_member: data.company.founding_member, intake_configured: Boolean(data.company.intake_configured_at), billing_notes: data.company.billing_notes });
  }, [data]);
  return (
    <Modal open onClose={onClose} title={data?.company.name || "Company"} wide>
      {error ? <ErrorNote error={error} /> : !data || !form ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan"><Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}><option value="network">Network (free, 1 user)</option><option value="essentials">Essentials ($99, 3 users)</option><option value="team">Team ($199, 10 users)</option></Select></Field>
            <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="pilot">Pilot</option><option value="active">Active</option><option value="suspended">Suspended (no sign-in)</option><option value="cancelled">Cancelled (no sign-in)</option></Select></Field>
            <Field label="Additional users ($15/user/mo)"><Input inputMode="numeric" value={form.extra_seats} onChange={(e) => setForm({ ...form, extra_seats: e.target.value })} /></Field>
            <div className="space-y-2 pt-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.founding_member} onChange={(e) => setForm({ ...form, founding_member: e.target.checked })} />Founding contractor</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.intake_configured} onChange={(e) => setForm({ ...form, intake_configured: e.target.checked })} />Intake is configured</label>
            </div>
            <Field label="Billing notes" className="sm:col-span-2"><Textarea value={form.billing_notes} onChange={(e) => setForm({ ...form, billing_notes: e.target.value })} className="min-h-[60px]" /></Field>
          </div>
          <div className="rounded-xl bg-muted p-3 text-sm ">
            <p className="font-semibold">{PHASE[data.company.billing.phase]} · {money(data.company.billing.monthly)}/month</p>
            <p className="text-xs text-muted-foreground">
              Intake configured: {data.company.intake_configured_at ? when(data.company.intake_configured_at) : "no"} · First job accepted: {data.company.first_job_processed_at ? when(data.company.first_job_processed_at) : "no"}
              {data.company.billing.trial_ends_at ? ` · Trial ends ${when(data.company.billing.trial_ends_at)} · $49 until ${when(data.company.billing.founding_price_ends_at)}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Pilot billing is tracked here only; no card is charged through FixBridge yet. Give advance notice before the price changes.</p>
          </div>
          <ErrorNote error={saveError} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => { setSaveError(null); try { await adminApi.patch(`/companies/${id}`, { ...form, extra_seats: Number(form.extra_seats) || 0 }); reload(); onSaved(); } catch (e) { setSaveError(e); } }}>Save</Button>
            <Button tone="secondary" onClick={async () => { try { setLink((await adminApi.post(`/companies/${id}/owner-invite`)).invite_link); } catch (e) { setSaveError(e); } }}>New owner sign-in link</Button>
          </div>
          {link ? <InviteLink url={link} /> : null}
          <Card title="Users">
            <ul className="divide-y divide-border text-sm ">
              {data.users.map((u: any) => <li key={u.id} className="flex justify-between py-2"><span>{u.name} · {u.email}</span><span className="capitalize text-muted-foreground">{u.role}{u.invited ? " · invite pending" : ""}{!u.active ? " · deactivated" : ""}</span></li>)}
            </ul>
          </Card>
          <Card title="Jobs by status">
            {data.job_counts.length ? <div className="flex flex-wrap gap-2">{data.job_counts.map((s: any) => <Badge key={s.status}>{s.status.replace(/_/g, " ")}: {s.n}</Badge>)}</div> : <p className="text-sm text-muted-foreground">No jobs yet.</p>}
          </Card>
        </div>
      )}
    </Modal>
  );
}
