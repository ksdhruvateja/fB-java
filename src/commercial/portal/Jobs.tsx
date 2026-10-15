import { useState, type ChangeEvent } from "react";
import { FileUp, Search, Sparkles } from "lucide-react";
import { api, STATUS_LABEL, type Flag, type Job } from "../api";
import { Link, navigate } from "../router";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Spinner, Textarea, cx, fileToDataUrl, money, priorityTone, statusTone, useLoad, when } from "../ui";
import { PageTitle, useSession } from "./Shell";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "review", label: "Needs review" },
  { key: "received", label: "Not accepted" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "return_visit_needed", label: "Return visit" },
  { key: "completed", label: "Ready to bill" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
  { key: "", label: "All" },
];

export function JobsPage() {
  const { isOffice, canSeeMoney } = useSession();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading } = useLoad(() => api.get<{ jobs: Job[] }>(`/jobs?status=${filter}&q=${encodeURIComponent(search)}`), [filter, search]);
  return (
    <>
      <PageTitle
        title="Jobs"
        subtitle={isOffice ? "Every work order, from received dispatch to paid invoice." : "Jobs assigned to you."}
        actions={isOffice ? <Link to="/commercial/app/intake" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">New dispatch</Link> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cx("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium", filter === f.key ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form className="ml-auto flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
          <Input placeholder="WO#, job#, site, customer" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
          <Button tone="secondary" type="submit" aria-label="Search"><Search className="h-4 w-4" /></Button>
        </form>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorNote error={error} /> : !data!.jobs.length ? (
        <Empty>No jobs here yet.{isOffice ? " Paste a dispatch email on the Intake page to create one." : ""}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="hidden w-full text-sm md:table">
            <thead className="whitespace-nowrap bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
              <tr><th className="px-4 py-2">Job</th><th className="px-4 py-2">Site</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th>{canSeeMoney ? <th className="px-4 py-2 text-right">Authorized</th> : null}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data!.jobs.map((j) => (
                <tr key={j.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => navigate(`/commercial/app/jobs/${j.id}`)}>
                  <td className="px-4 py-3"><Link to={`/commercial/app/jobs/${j.id}`} className="font-semibold">{j.job_number}</Link><div className="text-xs text-slate-500">WO {j.external_wo_number || "—"}</div></td>
                  <td className="px-4 py-3"><div className="font-medium">{j.site_name || "—"}</div><div className="max-w-xs truncate text-xs text-slate-500">{j.site_address}</div></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{j.dispatcher_name || j.billing_customer || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{j.due_at ? when(j.due_at, j.timezone) : "—"}{j.priority !== "routine" ? <Badge tone={priorityTone(j.priority)} className="ml-2">{j.priority}</Badge> : null}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(j.status)}>{STATUS_LABEL[j.status] || j.status}</Badge>{j.status === "received" && j.review_status !== "reviewed" ? <Badge tone="red" className="ml-1">Review</Badge> : null}</td>
                  {canSeeMoney ? <td className="px-4 py-3 text-right">{money(j.authorized_amount ?? j.nte_amount)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
            {data!.jobs.map((j) => (
              <li key={j.id}>
                <Link to={`/commercial/app/jobs/${j.id}`} className="block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{j.site_name || j.site_address || j.job_number}</span>
                    <Badge tone={statusTone(j.status)}>{STATUS_LABEL[j.status] || j.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{j.job_number} · WO {j.external_wo_number || "—"}{j.due_at ? ` · Due ${when(j.due_at, j.timezone)}` : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

interface Preview { fields: any; flags: Flag[]; subject: string; from: string }

export function IntakePage() {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string }[]>([]);
  const [source, setSource] = useState<"paste" | "upload">("paste");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "create">("");
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<any>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setError(null);
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) { setError(new Error(`${file.name} is larger than 8 MB.`)); continue; }
      if (/\.(eml|txt)$/i.test(file.name) || file.type === "message/rfc822" || file.type === "text/plain") {
        setText(await file.text());
        setSource("upload");
        setPreview(null);
      } else if (/^(image\/|application\/pdf)/.test(file.type)) {
        const dataUrl = await fileToDataUrl(file);
        setAttachments((a) => [...a, { name: file.name, dataUrl }].slice(0, 10));
      } else {
        setError(new Error(`${file.name}: use .eml, .txt, PDF or a photo.`));
      }
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    try {
      setPreview(await api.post<Preview>("/intake/preview", { text }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const res = await api.post("/intake", { text, source, attachments });
      setResult(res);
      if (res.outcome === "created" || res.outcome === "updated_existing") navigate(`/commercial/app/jobs/${res.job_id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageTitle title="New dispatch" subtitle="Paste the work order email or upload the .eml file. The original is kept with the job; nothing is sent to anyone." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dispatch email">
          <Textarea
            aria-label="Dispatch email text"
            value={text}
            onChange={(e) => { setText(e.target.value); setSource("paste"); setPreview(null); setResult(null); }}
            placeholder={"Paste the whole email, including the subject and sender if you can.\n\nWork Order #: 4471823\nLocation: Store #218\nAddress: …\nNTE: $650.00\n…"}
            className="min-h-[320px] font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700">
              <FileUp className="h-4 w-4" /> Upload .eml / .txt or attachments
              <input type="file" multiple accept=".eml,.txt,message/rfc822,text/plain,application/pdf,image/*" className="hidden" onChange={onFiles} />
            </label>
            {attachments.map((a) => (
              <Badge key={a.name}>{a.name}<button type="button" className="ml-1" onClick={() => setAttachments((x) => x.filter((y) => y.name !== a.name))} aria-label={`Remove ${a.name}`}>×</button></Badge>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tone="secondary" onClick={runPreview} busy={busy === "preview"} disabled={text.trim().length < 20}><Sparkles className="h-4 w-4" />Read email</Button>
            <Button onClick={create} busy={busy === "create"} disabled={text.trim().length < 20}>Create job for review</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">If this WO number already exists, the existing job is updated instead of creating a second one.</p>
          <div className="mt-3"><ErrorNote error={error} /></div>
          {result && result.outcome === "duplicate_ignored" ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{result.message} <Link to={`/commercial/app/jobs/${result.job_id}`} className="font-semibold underline">Open the job</Link></p>
          ) : result && result.outcome === "duplicate_no_changes" ? (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">This WO is already a job and nothing changed. <Link to={`/commercial/app/jobs/${result.job_id}`} className="font-semibold underline">Open the job</Link></p>
          ) : null}
        </Card>
        <Card title="What FixBridge found">
          {!preview ? <Empty>Press “Read email” to see the fields before creating the job.</Empty> : <PreviewFields preview={preview} />}
        </Card>
      </div>
    </>
  );
}

function PreviewFields({ preview }: { preview: Preview }) {
  const f = preview.fields;
  const rows: [string, string][] = [
    ["WO#", f.external_wo_number], ["PO#", f.po_number], ["Dispatched by", [f.dispatcher_name, f.dispatcher_email].filter(Boolean).join(" · ")],
    ["Billing customer", f.billing_customer], ["Site", f.site_name], ["Address", f.site_address], ["Trade", f.trade], ["Priority", f.priority],
    ["Due", f.due_at ? `${when(f.due_at, f.timezone)}${f.due_text ? ` (“${f.due_text}”)` : ""}` : f.due_text], ["NTE", f.nte_amount != null ? money(f.nte_amount) : ""],
    ["Scope", f.scope], ["Approval conditions", f.approval_conditions], ["Access", f.access_instructions], ["Customer check-in", f.checkin_instructions], ["Billing instructions", f.billing_instructions],
  ];
  return (
    <div className="space-y-3 text-sm">
      {preview.flags.length ? (
        <ul className="space-y-1">
          {preview.flags.map((fl) => (
            <li key={fl.code} className={cx("rounded-md px-3 py-2 text-xs font-medium", fl.severity === "blocking" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200")}>
              {fl.severity === "blocking" ? "Must review: " : "Check: "}{fl.message}
            </li>
          ))}
        </ul>
      ) : <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">No missing or conflicting details found. It still gets a quick review before acceptance.</p>}
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className={cx("whitespace-pre-line", !v && "italic text-slate-400")}>{v || "not found"}</dd>
          </div>
        ))}
        {f.contacts?.length ? (
          <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1.5">
            <dt className="text-slate-500">Contacts</dt>
            <dd>{f.contacts.map((c: any, i: number) => <div key={i}>{[c.name, c.phone, c.email, c.role && `(${c.role})`].filter(Boolean).join(" · ")}</div>)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
