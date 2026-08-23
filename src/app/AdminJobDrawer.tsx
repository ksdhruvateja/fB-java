import { useMemo, useState } from "react";
import {
  Check,
  Circle,
  MessageSquare,
  Send,
  UserPlus,
  X,
  ExternalLink,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import AdminQuoteBuilderPanel from "./AdminQuoteBuilderPanel";
import AdminHomeownerInvoicePanel from "./AdminHomeownerInvoicePanel";
import {
  STATUS_LABELS,
  formatMoney,
  retailRangeLabel,
  type Bid,
  type ManagedJob,
} from "./managedJobs";
import {
  jobBookingLabel,
  jobQueueHeadline,
  lifecycleForJob,
  relativeTime,
} from "./adminOpsHelpers";
import type { AuthUser } from "./auth";

type DrawerTab = "overview" | "quotes" | "dispatch" | "invoice";

export default function AdminJobDrawer({
  job,
  bids,
  contractors,
  open,
  onClose,
  busy,
  inviteContractorId,
  inviteRequestType,
  onInviteContractorId,
  onInviteRequestType,
  onInviteAndAssign,
  onMatch,
  onOpenProposalsTab,
  onOpenContractor,
  onOpenHomeowner,
  onOpenPayments,
  onOpenPayouts,
  onOpenAiEstimate,
  onMessage,
  onRefresh,
  dispatchCouponCode = "",
  onDispatchCouponCodeChange,
  onApplyCoupon,
  readOnly = false,
}: {
  job: ManagedJob | null;
  bids: Bid[];
  contractors: AuthUser[];
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  inviteContractorId: number | "";
  inviteRequestType: "remote_quote" | "site_visit";
  onInviteContractorId: (id: number | "") => void;
  onInviteRequestType: (t: "remote_quote" | "site_visit") => void;
  onInviteAndAssign: () => void | Promise<void>;
  onMatch: () => void | Promise<void>;
  onOpenProposalsTab?: () => void;
  onOpenContractor?: (contractorId: number) => void;
  onOpenHomeowner?: () => void;
  onOpenPayments?: () => void;
  onOpenPayouts?: () => void;
  onOpenAiEstimate?: () => void;
  onMessage: (msg: string) => void;
  onRefresh: () => void | Promise<void>;
  dispatchCouponCode?: string;
  onDispatchCouponCodeChange?: (code: string) => void;
  onApplyCoupon?: () => void | Promise<void>;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [selectedBidId, setSelectedBidId] = useState<number | null>(null);

  const lifecycle = useMemo(() => (job ? lifecycleForJob(job) : []), [job]);
  const latestBid = bids[0] || null;
  const activeBid = bids.find((b) => b.id === selectedBidId) || latestBid;
  const assignedContractor = job?.assignedContractorUserId
    ? contractors.find((c) => Number(c.id) === Number(job.assignedContractorUserId))
    : null;

  if (!open || !job) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close drawer" onClick={onClose} />
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold tracking-wide text-[#FF4D1C]">{jobBookingLabel(job)}</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold">{job.title || "Service request"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {(job.category || "Service").toString()} · {STATUS_LABELS[job.status] || job.status}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lifecycle strip */}
          <div className="overflow-x-auto border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex min-w-max items-center gap-1">
              {lifecycle.map((step, i) => (
                <div key={step.id} className="flex items-center gap-1">
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      step.state === "done"
                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                        : step.state === "current"
                          ? "bg-[#FF4D1C]/15 text-[#FF4D1C]"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.state === "done" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Circle className={`h-2.5 w-2.5 ${step.state === "current" ? "fill-current" : ""}`} />
                    )}
                    {step.label}
                  </div>
                  {i < lifecycle.length - 1 && <span className="mx-0.5 text-muted-foreground/40">→</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1 border-b border-border px-3 pt-2">
            {(
              [
                ["overview", "Overview"],
                ["quotes", "Quotes"],
                ["dispatch", "Dispatch"],
                ["invoice", "Invoice"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                  tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === "overview" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">{jobQueueHeadline(job)}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI estimate</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {job.customerRetailEstimateLow != null && job.customerRetailEstimateHigh != null
                        ? retailRangeLabel(job.customerRetailEstimateLow, job.customerRetailEstimateHigh)
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contractor quote</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {latestBid ? formatMoney(latestBid.netTotal) : "Waiting"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium">{job.contactName || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Location</span>
                    <span className="max-w-[60%] text-right font-medium">{job.cityStateZip || job.fullAddress || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Updated</span>
                    <span className="font-medium">{relativeTime(job.updatedAt || job.createdAt)}</span>
                  </div>
                  {assignedContractor && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Contractor</span>
                      <span className="font-medium">{assignedContractor.name}</span>
                    </div>
                  )}
                </div>

                {/* Cross-link hub — job is the central entity */}
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jump to</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      {
                        label: "Homeowner",
                        show: true,
                        onClick: onOpenHomeowner,
                      },
                      {
                        label: assignedContractor?.name || "Contractor",
                        show: Boolean(job.assignedContractorUserId),
                        onClick: () =>
                          job.assignedContractorUserId && onOpenContractor?.(Number(job.assignedContractorUserId)),
                      },
                      { label: "AI Estimate", show: true, onClick: onOpenAiEstimate },
                      { label: "Quotes", show: true, onClick: () => setTab("quotes") },
                      { label: "Payment", show: true, onClick: onOpenPayments },
                      { label: "Payout", show: true, onClick: onOpenPayouts },
                    ]
                      .filter((x) => x.show)
                      .map((x) => (
                        <button
                          key={x.label}
                          type="button"
                          disabled={!x.onClick}
                          onClick={() => x.onClick?.()}
                          className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-[#FF4D1C]/40 hover:text-[#FF4D1C] disabled:opacity-40"
                        >
                          {x.label}
                        </button>
                      ))}
                  </div>
                </div>

                {job.description && (
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Request</p>
                    <p className="mt-1 text-sm leading-relaxed">{job.description}</p>
                  </div>
                )}

                <div className="grid gap-2 pt-2">
                  {job.status === "bid_received" && latestBid && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBidId(latestBid.id);
                        setTab("quotes");
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      <Send className="h-4 w-4" /> Build quote
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab("dispatch")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    <UserPlus className="h-4 w-4" /> Request quote / site visit
                  </button>
                  <button
                    type="button"
                    onClick={() => onMessage("Messaging opens in the full job workspace (coming next).")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    <MessageSquare className="h-4 w-4" /> Message contractor
                  </button>
                  {onOpenProposalsTab && (
                    <button
                      type="button"
                      onClick={onOpenProposalsTab}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" /> Open in Bids & Proposals
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "quotes" && (
              <div className="space-y-4">
                {bids.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    No contractor quotes yet. Invite contractors from Dispatch.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {bids.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBidId(b.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                            activeBid?.id === b.id
                              ? "border-[#FF4D1C]/40 bg-[#FF4D1C]/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <span>Bid #{b.id}</span>
                          <span className="font-semibold tabular-nums">{formatMoney(b.netTotal)}</span>
                        </button>
                      ))}
                    </div>
                    {activeBid && (
                      <AdminQuoteBuilderPanel
                        job={job}
                        bid={activeBid}
                        busy={busy}
                        onMessage={onMessage}
                        onPublished={onRefresh}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "dispatch" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-sm font-medium">Coupon</p>
                  {job.discountCode ? (
                    <p className="text-xs text-teal-700 dark:text-teal-400">
                      Active: <span className="font-semibold">{job.discountCode}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No coupon applied.</p>
                  )}
                  {onApplyCoupon && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase"
                        placeholder="CODE"
                        value={dispatchCouponCode}
                        onChange={(e) => onDispatchCouponCodeChange?.(e.target.value.toUpperCase())}
                        disabled={readOnly}
                      />
                      <button
                        type="button"
                        disabled={busy || readOnly || !dispatchCouponCode.trim()}
                        onClick={() => void onApplyCoupon()}
                        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">How should contractors evaluate this request?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["remote_quote", "Remote quote", "Send photos & details for an off-site estimate."],
                      ["site_visit", "Site visit", "Schedule an on-site inspection before quoting."],
                    ] as const
                  ).map(([id, title, hint]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onInviteRequestType(id)}
                      className={`rounded-xl border p-3 text-left text-sm transition ${
                        inviteRequestType === id
                          ? "border-[#FF4D1C] bg-[#FF4D1C]/5 ring-1 ring-[#FF4D1C]/30"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-sm font-medium">Select contractor</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    value={inviteContractorId}
                    onChange={(e) => onInviteContractorId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Choose…</option>
                    {contractors.map((c) => (
                      <option key={String(c.id)} value={Number(c.id)}>
                        {c.name} · {c.trade || "trade?"} · {c.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !inviteContractorId}
                    onClick={() => void onInviteAndAssign()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <UserPlus className="h-4 w-4" />
                    {inviteRequestType === "site_visit" ? "Request site visit" : "Request quote"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onMatch()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Auto-match
                  </button>
                </div>
              </div>
            )}

            {tab === "invoice" && (
              <AdminHomeownerInvoicePanel
                jobId={job.id}
                readOnly={readOnly}
                onMessage={onMessage}
              />
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
