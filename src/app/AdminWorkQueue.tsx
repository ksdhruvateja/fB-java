import { useMemo } from "react";
import { Search } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";
import {
  computeAttention,
  filterWorkQueue,
  jobBookingLabel,
  jobDotTone,
  jobQueueHeadline,
  relativeTime,
  type AttentionKind,
  type QueueFilter,
} from "./adminOpsHelpers";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new_requests", label: "New" },
  { id: "needs_admin_pricing", label: "Pricing" },
  { id: "payment_pending", label: "Payment" },
  { id: "payout_ready", label: "Payout" },
  { id: "attention_required", label: "Attention" },
  { id: "urgent", label: "Urgent" },
  { id: "waiting", label: "Waiting" },
  { id: "today", label: "Today" },
];

function getHeader(filter: QueueFilter) {
  switch (filter) {
    case "new_requests":
      return {
        title: "New Requests",
        description: "New service requests that need admin attention.",
      };

    case "needs_admin_pricing":
      return {
        title: "Pricing",
        description: "Jobs that are ready for pricing or quote preparation.",
      };

    case "payment_pending":
      return {
        title: "Payment Pending",
        description: "Jobs waiting for homeowner payment.",
      };

    case "payout_ready":
      return {
        title: "Payout Ready",
        description: "Jobs that are ready for contractor payout.",
      };

    case "attention_required":
      return {
        title: "Attention Required",
        description: "Jobs that require admin action.",
      };

    case "urgent":
      return {
        title: "Urgent Jobs",
        description: "Jobs that need urgent attention.",
      };

    case "waiting":
      return {
        title: "Waiting",
        description: "Jobs currently waiting for the next step.",
      };

    case "today":
      return {
        title: "Today's Jobs",
        description: "Jobs updated or created today.",
      };

    default:
      return {
        title: "All Jobs",
        description: "All service requests in your work queue.",
      };
  }
}

const attentionFilterLabel = (filter: QueueFilter) => {
  const map: Partial<Record<AttentionKind, string>> = {
    emergency: "Emergencies",
    quotes_waiting: "Waiting on quotes",
    quotes_ready: "Ready to price",
    accepted: "Accepted",
    payments: "Payments",
    payouts: "Payouts",
  };

  return map[filter as AttentionKind] || null;
};

export default function AdminWorkQueue({
  jobs,
  filter,
  search,
  selectedJobId,
  onFilterChange,
  onSearchChange,
  onSelectJob,
}: {
  jobs: ManagedJob[];
  filter: QueueFilter;
  search: string;
  selectedJobId: number | null;
  onFilterChange: (f: QueueFilter) => void;
  onSearchChange: (q: string) => void;
  onSelectJob: (id: number) => void;
}) {
  const attention = useMemo(() => computeAttention(jobs), [jobs]);

  const rows = useMemo(
    () => filterWorkQueue(jobs, filter, search, attention),
    [jobs, filter, search, attention],
  );

  const header = getHeader(filter);

  return (
    <section className="space-y-4">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {header.title}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {header.description}
        </p>
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${filter === f.id
                ? "bg-[#FF4D1C] text-white shadow-sm"
                : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
              }`}
          >
            {f.label}
          </button>
        ))}

        {attentionFilterLabel(filter) && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            Filtered: {attentionFilterLabel(filter)}

            <button
              type="button"
              className="ml-2 underline"
              onClick={() => onFilterChange("all")}
            >
              clear
            </button>
          </span>
        )}
      </div>

      {/* SEARCH */}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <input
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#FF4D1C]/50 focus:ring-2 focus:ring-[#FF4D1C]/15"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search jobs, homeowners, booking IDs, ZIP…"
        />
      </label>

      {/* TABLE */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">Nothing in this queue</p>

            <p className="mt-1 text-sm text-muted-foreground">
              Try another filter or clear search.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              {/* TABLE HEADER */}
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="w-[170px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Booking ID
                  </th>

                  <th className="min-w-[220px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Job
                  </th>

                  <th className="w-[150px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Category
                  </th>

                  <th className="w-[180px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer
                  </th>

                  <th className="w-[220px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </th>

                  <th className="w-[150px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>

                  <th className="w-[110px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Updated
                  </th>
                </tr>
              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-border/70">
                {rows.map((job) => {
                  const selected = selectedJobId === job.id;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => onSelectJob(job.id)}
                      className={`cursor-pointer transition hover:bg-muted/50 ${selected ? "bg-[#FF4D1C]/5" : ""
                        }`}
                    >
                      {/* BOOKING ID */}
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${jobDotTone(
                              job,
                            )}`}
                          />

                          <span className="font-mono text-xs font-semibold text-[#FF4D1C]">
                            {jobBookingLabel(job)}
                          </span>
                        </div>
                      </td>

                      {/* JOB */}
                      <td className="px-4 py-4 align-middle">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {job.title || "Service request"}
                          </p>

                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {jobQueueHeadline(job)}
                          </p>
                        </div>
                      </td>

                      {/* CATEGORY */}
                      <td className="px-4 py-4 align-middle">
                        <div className="text-sm">
                          {job.category || "—"}
                        </div>
                      </td>

                      {/* CUSTOMER */}
                      <td className="px-4 py-4 align-middle">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {job.contactName || "—"}
                          </p>

                          {job.homeownerUserId ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              ID: {job.homeownerUserId}
                            </p>
                          ) : null}
                        </div>
                      </td>

                      {/* LOCATION */}
                      <td className="px-4 py-4 align-middle">
                        <p className="truncate text-sm">
                          {job.cityStateZip || job.fullAddress || "—"}
                        </p>
                      </td>

                      {/* STATUS */}
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${job.status === "draft"
                                ? "bg-slate-500/10 text-slate-700 dark:text-slate-300"
                                : job.status === "ai_review_complete"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : job.status === "awaiting_service_payment"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                          >
                            {STATUS_LABELS[job.status] || job.status}
                          </span>
                        </div>
                      </td>

                      {/* UPDATED */}
                      <td className="px-4 py-4 align-middle">
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(job.updatedAt || job.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// import { useMemo } from "react";
// import { Search } from "lucide-react";
// import type { ManagedJob } from "./managedJobs";
// import { STATUS_LABELS } from "./managedJobs";
// import {
//   computeAttention,
//   filterWorkQueue,
//   jobBookingLabel,
//   jobDotTone,
//   jobQueueHeadline,
//   relativeTime,
//   type AttentionKind,
//   type QueueFilter,
// } from "./adminOpsHelpers";

// const FILTERS: { id: QueueFilter; label: string }[] = [
//   { id: "all", label: "All" },
//   { id: "new_requests", label: "New" },
//   { id: "needs_admin_pricing", label: "Pricing" },
//   { id: "payment_pending", label: "Payment" },
//   { id: "payout_ready", label: "Payout" },
//   { id: "attention_required", label: "Attention" },
//   { id: "urgent", label: "Urgent" },
//   { id: "waiting", label: "Waiting" },
//   { id: "today", label: "Today" },
// ];

// export default function AdminWorkQueue({
//   jobs,
//   filter,
//   search,
//   selectedJobId,
//   onFilterChange,
//   onSearchChange,
//   onSelectJob,
// }: {
//   jobs: ManagedJob[];
//   filter: QueueFilter;
//   search: string;
//   selectedJobId: number | null;
//   onFilterChange: (f: QueueFilter) => void;
//   onSearchChange: (q: string) => void;
//   onSelectJob: (id: number) => void;
// }) {
//   const attention = useMemo(() => computeAttention(jobs), [jobs]);
//   const rows = useMemo(
//     () => filterWorkQueue(jobs, filter, search, attention),
//     [jobs, filter, search, attention],
//   );

//   const attentionFilterLabel = (f: QueueFilter) => {
//     const map: Partial<Record<AttentionKind, string>> = {
//       emergency: "Emergencies",
//       quotes_waiting: "Waiting on quotes",
//       quotes_ready: "Ready to price",
//       accepted: "Accepted",
//       payments: "Payments",
//       payouts: "Payouts",
//     };
//     return map[f as AttentionKind] || null;
//   };

//   return (
//     <section className="space-y-4">
//       <div>
//         <h1 className="text-2xl font-semibold tracking-tight">Work queue</h1>
//         <p className="mt-1 text-sm text-muted-foreground">
//           Live ops feed — click a row to open the job drawer without leaving this screen.
//         </p>
//       </div>

//       <div className="flex flex-wrap items-center gap-2">
//         {FILTERS.map((f) => (
//           <button
//             key={f.id}
//             type="button"
//             onClick={() => onFilterChange(f.id)}
//             className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
//               filter === f.id
//                 ? "bg-[#FF4D1C] text-white shadow-sm"
//                 : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
//             }`}
//           >
//             {f.label}
//           </button>
//         ))}
//         {attentionFilterLabel(filter) && (
//           <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
//             Filtered: {attentionFilterLabel(filter)}
//             <button type="button" className="ml-2 underline" onClick={() => onFilterChange("all")}>
//               clear
//             </button>
//           </span>
//         )}
//       </div>

//       <label className="relative block">
//         <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
//         <input
//           className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#FF4D1C]/50 focus:ring-2 focus:ring-[#FF4D1C]/15"
//           value={search}
//           onChange={(e) => onSearchChange(e.target.value)}
//           placeholder="Search jobs, homeowners, booking IDs, ZIP…"
//         />
//       </label>

//       <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
//         {rows.length === 0 ? (
//           <div className="px-6 py-14 text-center">
//             <p className="font-medium">Nothing in this queue</p>
//             <p className="mt-1 text-sm text-muted-foreground">Try another filter or clear search.</p>
//           </div>
//         ) : (
//           <ul className="divide-y divide-border/70">
//             {rows.map((job) => {
//               const selected = selectedJobId === job.id;
//               return (
//                 <li key={job.id}>
//                   <button
//                     type="button"
//                     onClick={() => onSelectJob(job.id)}
//                     className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/50 ${
//                       selected ? "bg-[#FF4D1C]/5" : ""
//                     }`}
//                   >
//                     <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${jobDotTone(job)}`} />
//                     <div className="min-w-0 flex-1">
//                       <div className="flex flex-wrap items-baseline justify-between gap-2">
//                         <p className="font-mono text-xs font-semibold text-[#FF4D1C]">{jobBookingLabel(job)}</p>
//                         <div className="flex items-center gap-2">
//                           {(job.priorityTier === "homecare_pro" || job.priorityTier === "homecare_pro_high") && (
//                             <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
//                               {job.priorityTier === "homecare_pro_high" ? "Priority" : "HomeCare Pro"}
//                             </span>
//                           )}
//                           <p className="text-xs text-muted-foreground">{relativeTime(job.updatedAt || job.createdAt)}</p>
//                         </div>
//                       </div>
//                       <p className="mt-0.5 truncate font-semibold">{job.title || job.category || "Service request"}</p>
//                       <p className="mt-0.5 text-sm text-muted-foreground">{jobQueueHeadline(job)}</p>
//                       <p className="mt-1 truncate text-xs text-muted-foreground">
//                         {job.cityStateZip || job.fullAddress || "—"} · {STATUS_LABELS[job.status] || job.status}
//                       </p>
//                     </div>
//                   </button>
//                 </li>
//               );
//             })}
//           </ul>
//         )}
//       </div>
//     </section>
//   );
// }
