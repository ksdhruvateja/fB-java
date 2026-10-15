import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, Clock, Inbox, MapPin, Receipt, RotateCcw, ShieldQuestion, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { api, STATUS_LABEL, type Job } from "../api";
import { Link } from "../router";
import { Badge, Card, ErrorNote, Spinner, cx, money, priorityTone, statusTone, useLoad, when } from "../ui";
import { PageTitle, useSession } from "./Shell";

export function TodayPage() {
  const { user, isOffice, canSeeMoney } = useSession();
  const { data, error, loading } = useLoad(() => api.get("/today"), []);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} />;
  const d = data!;
  const b = d.buckets;
  const urgent = b.overdue.length + b.needs_review.length + d.invoice_problems.length + d.my_exceptions.length;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageTitle
        title="Today"
        subtitle={`${greeting}, ${user.name.split(" ")[0] || "there"}. ${urgent ? `${urgent} item${urgent === 1 ? "" : "s"} need attention first.` : "Nothing urgent right now."}`}
        actions={isOffice ? <Link to="/commercial/app/intake" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"><Inbox className="h-4 w-4" />New dispatch</Link> : null}
      />

      {d.active_visits.length ? (
        <Card title={isOffice ? "Technicians in the field" : "Your visits"} className="mb-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.active_visits.map((v: any) => (
              <li key={v.id}>
                <Link to={`/commercial/app/jobs/${v.job_id}`} className="flex items-center gap-3 rounded-2xl bg-muted p-4 hover:border-primary ">
                  <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", v.status === "on_site" ? "bg-emerald-100 text-emerald-700" : v.status === "en_route" ? "bg-sky-100 text-sky-700" : "bg-muted text-muted-foreground")}>
                    {v.status === "on_site" ? <MapPin className="h-5 w-5" /> : v.status === "en_route" ? <Truck className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{v.site_name || v.site_address || v.job_number}</span>
                    <span className="block truncate text-xs text-muted-foreground">WO {v.external_wo_number} · Visit {v.visit_number} · {v.status === "on_site" ? "On site" : v.status === "en_route" ? "On the way" : "Scheduled"}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {(() => {
        const list = [
          { show: !isOffice, icon: <MapPin className="h-4 w-4" />, tone: "orange" as const, title: "Assigned to you", jobs: b.assigned_to_me || [] },
          { show: true, icon: <Clock className="h-4 w-4" />, tone: "red" as const, title: "Overdue", jobs: b.overdue },
          { show: isOffice, icon: <ShieldQuestion className="h-4 w-4" />, tone: "red" as const, title: "Dispatches to review", jobs: b.needs_review, showFlags: true },
          { show: isOffice, icon: <ClipboardCheck className="h-4 w-4" />, tone: "amber" as const, title: "Reviewed — accept with an ETA", jobs: b.awaiting_acceptance },
          { show: true, icon: <CalendarClock className="h-4 w-4" />, tone: "orange" as const, title: "Due today", jobs: b.due_today },
          { show: true, icon: <RotateCcw className="h-4 w-4" />, tone: "orange" as const, title: "Return visits & proposals", jobs: b.return_visits },
          { show: true, icon: <ShieldQuestion className="h-4 w-4" />, tone: "amber" as const, title: "Waiting for approval", jobs: b.awaiting_approval },
          { show: isOffice, icon: <ClipboardCheck className="h-4 w-4" />, tone: "green" as const, title: "Work done — finish the completion package", jobs: b.ready_to_close },
          { show: isOffice && canSeeMoney, icon: <Receipt className="h-4 w-4" />, tone: "green" as const, title: "Ready to invoice", jobs: b.ready_to_invoice },
        ].filter((x) => x.show);
        const empty = list.filter((x) => !x.jobs.length);
        return (
          <>
            {empty.length ? (
              <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-card px-5 py-3.5 text-sm text-muted-foreground dark:text-muted-foreground">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">All clear:</span>
                {empty.map((x) => x.title.split(" — ")[0]).join(" · ")}
              </p>
            ) : null}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {list.filter((x) => x.jobs.length).map((x) => <Bucket key={x.title} icon={x.icon} tone={x.tone} title={x.title} jobs={x.jobs} empty="" showFlags={x.showFlags} />)}

        {isOffice && canSeeMoney ? (
          <Card title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-red-600" />Invoice problems</span>}>
            {d.invoice_problems.length ? (
              <ul className="divide-y divide-border">
                {d.invoice_problems.map((i: any) => (
                  <li key={i.id} className="py-2">
                    <Link to={`/commercial/app/invoices/${i.id}`} className="flex items-center justify-between gap-2">
                      <span><span className="font-semibold">{i.invoice_number}</span> <span className="text-xs text-muted-foreground">· {i.job_number} · {i.site_name}</span></span>
                      <Badge tone="red">{i.status === "delivery_failed" ? "Bounced" : "Disputed"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No bounced or disputed invoices.</p>}
            {d.unpaid_invoices.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {d.unpaid_invoices.length} sent invoice{d.unpaid_invoices.length === 1 ? "" : "s"} unpaid ({money(d.unpaid_invoices.reduce((s: number, i: any) => s + Number(i.total) - Number(i.amount_paid), 0))}).{" "}
                <Link to="/commercial/app/invoices" className="font-semibold text-primary">Review</Link>
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />{isOffice ? "Open exceptions" : "Exceptions assigned to you"}</span>}>
          {d.exceptions.length ? (
            <ul className="divide-y divide-border">
              {d.exceptions.slice(0, 8).map((e: any) => (
                <li key={e.id} className="py-2 text-sm">
                  <Link to={e.job_id ? `/commercial/app/jobs/${e.job_id}` : "/commercial/app/exceptions"} className="block">
                    <span className="font-medium">{e.title}</span>
                    {e.assigned_user_id === user.id ? <Badge tone="orange" className="ml-2">You</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No open exceptions.</p>}
          <Link to="/commercial/app/exceptions" className="mt-3 inline-block text-sm font-semibold text-primary">All exceptions</Link>
        </Card>
      </div>
          </>
        );
      })()}
    </>
  );
}

function Bucket({ title, jobs, empty, icon, tone, showFlags }: { title: string; jobs: Job[]; empty: string; icon: ReactNode; tone: "red" | "amber" | "orange" | "green"; showFlags?: boolean }) {
  const colors = { red: "text-red-600", amber: "text-amber-600", orange: "text-orange-600", green: "text-emerald-600" };
  return (
    <Card title={<span className="flex items-center gap-2"><span className={colors[tone]}>{icon}</span>{title}{jobs.length ? <Badge tone={tone === "green" ? "green" : tone === "red" ? "red" : "amber"}>{jobs.length}</Badge> : null}</span>}>
      {jobs.length ? (
        <ul className="divide-y divide-border">
          {jobs.slice(0, 8).map((j) => <JobRow key={j.id} job={j} showFlags={showFlags} />)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{empty}</p>}
      {jobs.length > 8 ? <Link to="/commercial/app/jobs" className="mt-2 inline-block text-sm font-semibold text-primary">+{jobs.length - 8} more</Link> : null}
    </Card>
  );
}

export function JobRow({ job, showFlags }: { job: Job; showFlags?: boolean }) {
  const open = (job.flags || []).filter((f) => !f.resolved && f.severity === "blocking");
  return (
    <li className="py-2">
      <Link to={`/commercial/app/jobs/${job.id}`} className="-mx-2 block rounded-xl px-2 py-1 hover:bg-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{job.site_name || job.site_address || "Site not set"}</span>
          {job.priority !== "routine" ? <Badge tone={priorityTone(job.priority)}>{job.priority}</Badge> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>{job.job_number}</span>
          <span>WO {job.external_wo_number || "—"}</span>
          {job.due_at ? <span>Due {when(job.due_at, job.timezone)}</span> : null}
          <span className="sr-only">{STATUS_LABEL[job.status]}</span>
        </div>
        {showFlags && open.length ? <p className="mt-1 text-xs font-medium text-red-600">{open.map((f) => f.message).join(" · ")}</p> : null}
      </Link>
    </li>
  );
}

export { statusTone };
