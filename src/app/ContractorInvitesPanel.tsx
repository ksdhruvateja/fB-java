import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle,
  Inbox,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatMoney, respondInvitation } from "./managedJobs";

export type ContractorInvite = {
  id: number;
  jobId: number;
  status: string;
  bookingId?: string;
  category?: string;
  title?: string;
  description?: string;
  mediaDataUrl?: string | null;
  mediaType?: string | null;
  cityStateZip?: string;
  preferredDate?: string;
  preferredTimeSlot?: string;
  serviceTiming?: string;
  expectedNetLow?: number;
  expectedNetHigh?: number;
  jobStatus?: string;
  aiAssessment?: {
    summary?: string;
    urgency?: string;
    recommended_trade?: string;
    confidence?: number;
  };
};

const TIME_SLOT_LABELS: Record<string, string> = {
  "9-11": "9:00 AM – 11:00 AM",
  "11-2": "11:00 AM – 2:00 PM",
  "2-5": "2:00 PM – 5:00 PM",
  "5-7": "5:00 PM – 7:00 PM",
};

type Filter = "all" | "invited" | "accepted" | "declined";

function urgencyLabel(u?: string) {
  const v = String(u || "").toLowerCase();
  if (v === "emergency" || v === "critical") return "Emergency";
  if (v === "high") return "High";
  return "Standard";
}

export default function ContractorInvitesPanel({
  invites,
  hourlyRate,
  tripFee,
  focusId,
  onRefresh,
  onAccepted,
  onBid,
}: {
  invites: ContractorInvite[];
  hourlyRate?: string;
  tripFee?: string;
  focusId?: number | null;
  onRefresh: () => Promise<void>;
  onAccepted: () => void;
  onBid: (jobId: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("invited");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(focusId ?? null);

  const counts = useMemo(() => {
    const c = { all: invites.length, invited: 0, accepted: 0, declined: 0 };
    for (const inv of invites) {
      const s = String(inv.status).toLowerCase();
      if (s === "invited") c.invited += 1;
      else if (s === "accepted") c.accepted += 1;
      else if (s === "declined") c.declined += 1;
    }
    return c;
  }, [invites]);

  const list = useMemo(() => {
    if (filter === "all") return invites;
    return invites.filter((i) => String(i.status).toLowerCase() === filter);
  }, [invites, filter]);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Invitations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review scoped work and respond before the window closes.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "invited", label: "New" },
            { id: "all", label: "All" },
            { id: "accepted", label: "Accepted" },
            { id: "declined", label: "Declined" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold ${
              filter === f.id ? "bg-primary text-white" : "border border-border bg-card"
            }`}
          >
            {f.label} <span className="opacity-80">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <Inbox className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-semibold">No invitations here</p>
          <p className="mt-1 text-sm text-muted-foreground">New Managed invites will show up with distance and windows.</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {list.map((inv) => {
            const pending = String(inv.status).toLowerCase() === "invited";
            const slot =
              TIME_SLOT_LABELS[String(inv.preferredTimeSlot || "")] ||
              inv.preferredTimeSlot ||
              "Window TBD";
            const open = expandedId === inv.id || focusId === inv.id;
            return (
              <motion.article
                key={inv.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`overflow-hidden rounded-[1.5rem] border bg-card ${
                  pending ? "border-primary/35" : "border-border"
                }`}
              >
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                        New job invitation
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        {inv.category || "Service"}
                        {inv.title ? ` · ${inv.title}` : ""}
                      </h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
                      {pending ? <Bell className="h-3.5 w-3.5 text-primary" /> : String(inv.status) === "accepted" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5" />}
                      {pending ? "Awaiting response" : inv.status}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {inv.cityStateZip || "Service area"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Priority · </span>
                      {urgencyLabel(inv.aiAssessment?.urgency)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Property · </span>
                      Single Family Home
                    </p>
                    <p>
                      <span className="text-muted-foreground">Preferred window · </span>
                      {slot}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Your rates · </span>
                      {hourlyRate ? `$${hourlyRate}/hr` : "Set in pricing"}
                      {tripFee ? ` + $${tripFee} trip fee` : ""}
                    </p>
                    <p>
                      <span className="text-muted-foreground">FixBridge Job · </span>
                      {inv.bookingId || `FB-${inv.jobId}`}
                    </p>
                  </div>

                  {(inv.expectedNetLow != null || inv.expectedNetHigh != null) && (
                    <p className="text-sm font-medium">
                      Expected net {formatMoney(Number(inv.expectedNetLow || 0))}
                      {inv.expectedNetHigh != null ? ` – ${formatMoney(Number(inv.expectedNetHigh))}` : ""}
                    </p>
                  )}

                  {open && inv.description && (
                    <p className="rounded-xl bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">{inv.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {pending && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === inv.id}
                          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                          onClick={async () => {
                            setBusyId(inv.id);
                            await respondInvitation(inv.id, "decline");
                            setBusyId(null);
                            await onRefresh();
                          }}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={busyId === inv.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                          onClick={async () => {
                            setBusyId(inv.id);
                            const r = await respondInvitation(inv.id, "accept");
                            setBusyId(null);
                            if (r.ok) {
                              await onRefresh();
                              onAccepted();
                            }
                          }}
                        >
                          {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          View & Accept
                        </button>
                      </>
                    )}
                    {String(inv.status).toLowerCase() === "accepted" && (
                      <button
                        type="button"
                        onClick={() => onBid(inv.jobId)}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Submit estimate <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
                      onClick={() => setExpandedId(open ? null : inv.id)}
                    >
                      {open ? "Hide details" : "View Job →"}
                    </button>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      )}
    </section>
  );
}
