import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight, BadgeCheck, Building2, CheckCircle2, ClipboardCheck, FileText, Inbox, MapPin, Receipt, ShieldCheck,
  Smartphone, TriangleAlert, Users, Wallet, WifiOff,
} from "lucide-react";
import { api } from "./api";
import { Link } from "./router";
import { Button, Field, Input, Select, Textarea, cx } from "./ui";
import { CommercialLogo } from "./CommercialLogo";

const WORKFLOW = [
  { icon: Inbox, title: "Dispatch email", text: "Paste or upload the work order email. The original is kept exactly as received." },
  { icon: ClipboardCheck, title: "Reviewed job record", text: "WO#, site, NTE, priority, due time and instructions are pulled out. Anything missing or contradictory is flagged for review." },
  { icon: BadgeCheck, title: "Acceptance & ETA", text: "A received dispatch is not an accepted job. Accept it with an ETA and assign technicians." },
  { icon: MapPin, title: "Site visit", text: "On my way, check in, check out — plus the customer’s own check-in (IVR, code or portal), including when it fails." },
  { icon: FileText, title: "Proposal / authorized work", text: "Findings, labor and materials go to the office for review. Extra work waits until it is authorized." },
  { icon: ShieldCheck, title: "Completion package", text: "Work notes, after photos and check-in records are checked before the job can be closed." },
  { icon: Receipt, title: "Invoice submission", text: "Invoices are drafted from approved work and visits, then checked against the WO, the authorized amount and duplicates." },
  { icon: Wallet, title: "Payment tracking", text: "Sent, bounced, acknowledged, disputed, paid — with the evidence for each payment." },
];

const FEATURES = [
  { icon: Inbox, title: "Dispatch intake", points: ["Paste or upload .eml / .txt work orders", "Repeat emails for the same WO update the existing job", "Unclear address or NTE goes to a review queue"] },
  { icon: Smartphone, title: "Built for the phone", points: ["“What needs my attention today?” on one screen", "Large On my way / Check in / Check out buttons", "Optional location; recorded even when it is not shared"] },
  { icon: WifiOff, title: "Works with weak signal", points: ["Field actions save on the phone when offline", "They send with the original time when signal returns", "Never recorded twice"] },
  { icon: ShieldCheck, title: "Authorizations on record", points: ["Original NTE, requested increase, approved amount", "Who approved, and the reply as evidence", "Unclear replies go to a person to review"] },
  { icon: Receipt, title: "Invoices that go through", points: ["Recipient, WO#, approved amount and service dates checked", "Customer-specific subject lines and submission method", "Bounced invoices are flagged and assigned"] },
  { icon: Users, title: "Your team, your rules", points: ["Owner and office see everything", "Technicians see the jobs assigned to them", "Choose who can see prices and invoices"] },
];

const TRADES = ["Plumbing", "HVAC", "Refrigeration", "Electrical", "Roofing", "Doors & Locks", "General Maintenance", "Painting", "Flooring", "Landscaping"];

interface Offer {
  founding: { limit: number; remaining: number; monthly: number };
}

export default function Landing() {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    document.title = "FixBridge Commercial · Work order management for commercial contractors";
    api.public<Offer>("GET", "/public/offer").then(setOffer).catch(() => setOffer(null));
  }, []);

  return (
    <div className="min-h-svh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/commercial" aria-label="FixBridge Commercial home"><CommercialLogo /></Link>
          <nav className="ml-6 hidden items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
            <a href="#workflow" className="px-3 py-2 hover:text-slate-900 dark:hover:text-white">How it works</a>
            <a href="#pricing" className="px-3 py-2 hover:text-slate-900 dark:hover:text-white">Pricing</a>
            <a href="#founding" className="px-3 py-2 hover:text-slate-900 dark:hover:text-white">Founding offer</a>
            <a href="#faq" className="px-3 py-2 hover:text-slate-900 dark:hover:text-white">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/commercial/login" className="whitespace-nowrap px-2 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 sm:px-3">Sign in</Link>
            <a href="#apply" className="whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 sm:px-4"><span className="sm:hidden">Apply</span><span className="hidden sm:inline">Apply for the pilot</span></a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,77,28,.35), transparent 40%), radial-gradient(circle at 80% 60%, rgba(56,189,248,.18), transparent 45%)" }} />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300">
              <Building2 className="h-3.5 w-3.5" /> For commercial service contractors
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              From dispatch email to paid invoice, without the spreadsheet.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Free to join the FixBridge contractor network. Optional commercial tools help you manage the jobs you already have.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#apply" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-white hover:bg-primary/90">
                Apply for the pilot <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#workflow" className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10">
                See the workflow
              </a>
            </div>
            <p className="mt-6 text-sm text-slate-400">No percentage of your invoices. No per-job fees. Nothing charged to your facility customers.</p>
          </div>
          <TodayPreview />
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">One record for every work order</h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Every step is saved on the job, so the office, the technician and the invoice all work from the same facts.
        </p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW.map((step, i) => (
            <li key={step.title} className="relative rounded-lg border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-900">{i + 1}</span>
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg bg-white p-6 shadow-sm dark:bg-slate-900">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Simple monthly pricing</h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Pay for the tools, not for the work. FixBridge does not take a percentage of your invoices, charge per job, charge your facility customers, or require you to collect payments through FixBridge.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <PlanCard name="Network" price="Free" note="Join the FixBridge contractor network." points={["Contractor profile in the FixBridge network", "No monthly fee"]} />
          <PlanCard
            name="Commercial Essentials"
            price="$99"
            per="/month"
            note="Includes 3 users"
            highlight
            points={["Dispatch intake and review queue", "Mobile visits, check-in and check-out", "Proposals, approvals and NTE tracking", "Completion packages and invoice checks", "Exception queue and payment tracking"]}
          />
          <PlanCard name="Commercial Team" price="$199" per="/month" note="Includes 10 users" points={["Everything in Essentials", "Room for office staff and a field crew", "Configurable financial permissions"]} />
        </div>
        <p className="mt-5 text-sm text-slate-600 dark:text-slate-400">Additional users: $15 per user per month. Cancel monthly. No setup fee.</p>
      </section>

      <section id="founding" className="scroll-mt-20 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-orange-300">Founding contractor offer</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">For the first 10 companies</h2>
            <ul className="mt-6 space-y-3 text-slate-200">
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />30 days free — the clock starts only after your intake is set up and a real job has been processed.</li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />Then $49/month for 12 months.</li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />After that, $99/month — with advance notice before it changes.</li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />No setup fee. Cancel monthly.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-6">
            {offer ? (
              offer.founding.remaining > 0 ? (
                <>
                  <p className="text-5xl font-bold">{offer.founding.remaining}</p>
                  <p className="mt-1 text-slate-300">of {offer.founding.limit} founding spots still open</p>
                </>
              ) : (
                <p className="text-lg font-semibold">All founding spots have been taken. You can still apply for the pilot at standard pricing.</p>
              )
            ) : (
              <p className="text-lg font-semibold">Founding spots are limited to the first {10} companies.</p>
            )}
            <a href="#apply" className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-white hover:bg-primary/90">
              Apply now <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-slate-400">Applying is free. No payment details are collected during the pilot.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y divide-slate-200 dark:divide-slate-800">
          <Faq q="Will FixBridge send me commercial jobs?">
            Joining the network is free. The commercial tools are for managing the work orders you already receive from your own customers. We do not promise job volume or faster payment.
          </Faq>
          <Faq q="Do my customers have to use FixBridge?">
            No. Your facility managers keep sending dispatches the way they do today. You paste or upload the email, and invoices go out through the submission method each customer already accepts.
          </Faq>
          <Faq q="Does FixBridge collect my payments or take a cut?">
            No. Customers pay you directly. You record payments in FixBridge with the reference or remittance as evidence. There is no percentage of invoices and no per-job charge.
          </Faq>
          <Faq q="Can technicians see prices?">
            Only if you allow it. Owners and office staff see everything; technicians see the jobs assigned to them, and financial access is a per-person setting.
          </Faq>
          <Faq q="Can dispatch emails be forwarded automatically?">
            In the pilot you paste or upload dispatch emails. Automatic forwarding is planned for a later release.
          </Faq>
          <Faq q="Is the commercial account separate from my FixBridge homeowner or contractor login?">
            Yes. FixBridge Commercial uses its own accounts and sign-in, and its data is kept separate from the homeowner and contractor marketplace.
          </Faq>
        </div>
      </section>

      <section id="apply" className="scroll-mt-20 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Apply for the pilot</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Tell us about your company and how your work orders arrive. We review every application and reply by email with next steps.
          </p>
          <PilotForm />
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-slate-500 sm:px-6">
          <CommercialLogo small />
          <a href="/" className="hover:text-slate-900 dark:hover:text-white">FixBridge home</a>
          <Link to="/commercial/login" className="hover:text-slate-900 dark:hover:text-white">Company sign in</Link>
          <a href="/legal/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy</a>
          <a href="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact</a>
          <span className="ml-auto">© {new Date().getFullYear()} FixBridge</span>
        </div>
      </footer>
    </div>
  );
}

function TodayPreview() {
  const rows = [
    { tone: "bg-red-500", label: "Needs review", value: "NTE unclear", sub: "WO 5512 · Oak Plaza" },
    { tone: "bg-orange-500", label: "Due today", value: "2 jobs", sub: "Store #218 · 5:00 PM CT" },
    { tone: "bg-sky-500", label: "On site", value: "Visit 2", sub: "Customer check-in confirmed" },
    { tone: "bg-amber-500", label: "Invoice bounced", value: "INV-1004", sub: "Assigned to office" },
  ];
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-slate-800 bg-white p-4 text-slate-900 shadow-2xl" aria-label="Example of the Today screen">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Example</p>
      <p className="mt-1 text-lg font-bold">What needs my attention today?</p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <span className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", r.tone)} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
              <p className="font-semibold">{r.value}</p>
              <p className="truncate text-xs text-slate-500">{r.sub}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-md bg-slate-900 py-3 text-center text-sm font-semibold text-white">On my way</span>
        <span className="rounded-md bg-primary py-3 text-center text-sm font-semibold text-white">Check in</span>
      </div>
    </div>
  );
}

function PlanCard({ name, price, per, note, points, highlight }: { name: string; price: string; per?: string; note: string; points: string[]; highlight?: boolean }) {
  return (
    <div className={cx("flex flex-col rounded-xl border p-6", highlight ? "border-primary shadow-lg ring-1 ring-primary" : "border-slate-200 dark:border-slate-800")}>
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-3"><span className="text-4xl font-bold">{price}</span>{per ? <span className="text-slate-500">{per}</span> : null}</p>
      <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">{note}</p>
      <ul className="mt-5 space-y-2 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: string }) {
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
        {q}
        <span className="text-xl text-slate-400 transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{children}</p>
    </details>
  );
}

const EMPTY = {
  company_name: "", contact_name: "", email: "", phone: "", trades: [] as string[], service_area: "", team_size: "",
  dispatch_sources: "", monthly_dispatch_volume: "", current_tools: "", plan_interest: "essentials", message: "", consent: false,
};

function PilotForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.public("POST", "/pilot-applications", form);
      setDone(true);
    } catch (err: any) {
      setErrors(err?.body?.errors || {});
      setMessage(err?.message || "Could not send your application.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" role="status">
        <CheckCircle2 className="h-6 w-6" />
        <p className="mt-2 text-lg font-semibold">Application received.</p>
        <p className="mt-1 text-sm">We will review it and reply to {form.email} with next steps. No payment is taken during the pilot.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Company name" error={errors.company_name}><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} autoComplete="organization" required /></Field>
      <Field label="Your name" error={errors.contact_name}><Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} autoComplete="name" required /></Field>
      <Field label="Work email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required /></Field>
      <Field label="Phone" error={errors.phone}><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">Trades you cover</legend>
        <div className="flex flex-wrap gap-2">
          {TRADES.map((t) => {
            const on = form.trades.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => set("trades", on ? form.trades.filter((x) => x !== t) : [...form.trades, t])}
                className={cx("rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")}
              >
                {t}
              </button>
            );
          })}
        </div>
        {errors.trades ? <p className="mt-1 text-xs font-medium text-red-600">{errors.trades}</p> : null}
      </fieldset>
      <Field label="Service area" hint="Cities, counties or states"><Input value={form.service_area} onChange={(e) => set("service_area", e.target.value)} /></Field>
      <Field label="Team size">
        <Select value={form.team_size} onChange={(e) => set("team_size", e.target.value)}>
          <option value="">Choose…</option>
          <option>Just me</option>
          <option>2–3</option>
          <option>4–10</option>
          <option>11–25</option>
          <option>More than 25</option>
        </Select>
      </Field>
      <Field label="Where do your work orders come from?" hint="e.g. facility management companies, retailers, property managers, portals" className="sm:col-span-2">
        <Input value={form.dispatch_sources} onChange={(e) => set("dispatch_sources", e.target.value)} />
      </Field>
      <Field label="Work orders per month">
        <Select value={form.monthly_dispatch_volume} onChange={(e) => set("monthly_dispatch_volume", e.target.value)}>
          <option value="">Choose…</option>
          <option>Fewer than 10</option>
          <option>10–50</option>
          <option>51–150</option>
          <option>More than 150</option>
        </Select>
      </Field>
      <Field label="Plan you are interested in">
        <Select value={form.plan_interest} onChange={(e) => set("plan_interest", e.target.value)}>
          <option value="essentials">Commercial Essentials ($99/mo, 3 users)</option>
          <option value="team">Commercial Team ($199/mo, 10 users)</option>
          <option value="network">Network only (free)</option>
        </Select>
      </Field>
      <Field label="What do you use today?" hint="Spreadsheets, email folders, other software" className="sm:col-span-2">
        <Input value={form.current_tools} onChange={(e) => set("current_tools", e.target.value)} />
      </Field>
      <Field label="Anything else?" className="sm:col-span-2"><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} /></Field>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
        <span>
          FixBridge may contact me by email or phone about the commercial pilot. See the <a href="/legal/privacy" className="underline">privacy policy</a>.
          {errors.consent ? <span className="block text-xs font-medium text-red-600">{errors.consent}</span> : null}
        </span>
      </label>
      {message ? <p className="text-sm font-medium text-red-600 sm:col-span-2" role="alert">{message}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" busy={busy}>Send application</Button>
        <p className="mt-2 text-xs text-slate-500"><TriangleAlert className="mr-1 inline h-3.5 w-3.5" />Pilot sign-up only — no payment details are collected.</p>
      </div>
    </form>
  );
}
