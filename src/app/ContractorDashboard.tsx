import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Search, CheckSquare, DollarSign, User, Bell, LogOut,
  MapPin, Clock, Star, ChevronRight, TrendingUp,
  FileCheck, AlertCircle, Wrench, Zap, Flame, Sun, Moon,
  BarChart2, Shield, Phone, Mail, MessageSquare, Send, Menu, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import type { AuthUser } from "./auth";
import { addJobMessage, getJobMessages, type JobChatMessage } from "./jobChat";
import {
  contractorCanDoJob,
  getJobBoardJobs,
  type JobBoardItem,
} from "./jobBoard";

type DashTab = "find" | "work" | "earnings" | "profile";

const NAV_ITEMS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "find", label: "Find Jobs", icon: Search },
  { id: "work", label: "My Work", icon: CheckSquare },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "profile", label: "My Profile", icon: User },
];

const COMPLETED_JOBS = [
  { id: 1, title: "Kitchen faucet cartridge replacement", location: "Astoria, QNS", date: "Jun 20, 2024", payout: "$195", rating: 5, review: "James was on time, fixed it in 45 minutes, very professional." },
  { id: 2, title: "Bathroom supply line replacement", location: "Park Slope, BK", date: "Jun 15, 2024", payout: "$285", rating: 5, review: "Did a great job, clean work. Will definitely hire again." },
  { id: 3, title: "Pipe burst emergency repair", location: "Flushing, QNS", date: "Jun 10, 2024", payout: "$520", rating: 4, review: "Quick response for an emergency. Solid work." },
  { id: 4, title: "Water heater installation — 50 gal", location: "Mineola, LI", date: "Jun 3, 2024", payout: "$780", rating: 5, review: "Excellent — walked me through everything. Highly recommend." },
  { id: 5, title: "Toilet replacement + wax ring", location: "Jamaica, QNS", date: "May 28, 2024", payout: "$310", rating: 5, review: "Perfect job, fair price." },
];

const MONTHLY_EARNINGS = [
  { month: "Jan", earned: 2800 },
  { month: "Feb", earned: 3200 },
  { month: "Mar", earned: 2600 },
  { month: "Apr", earned: 4100 },
  { month: "May", earned: 3800 },
  { month: "Jun", earned: 4820 },
];

const AREA_NEIGHBORHOODS = [
  { name: "Astoria, Queens", jobs: 8, dist: "0.8 mi", hot: true },
  { name: "Park Slope, Brooklyn", jobs: 6, dist: "2.1 mi", hot: true },
  { name: "Flushing, Queens", jobs: 4, dist: "3.4 mi", hot: false },
  { name: "Jamaica, Queens", jobs: 5, dist: "4.1 mi", hot: false },
  { name: "Mineola, Long Island", jobs: 3, dist: "5.2 mi", hot: false },
  { name: "Huntington, Long Island", jobs: 2, dist: "7.8 mi", hot: false },
];

function FindJobCard({
  job,
  index,
  isAccepted,
  isCancelled,
  cancellationReason,
  onAccept,
  onCancel,
  user,
}: {
  job: JobBoardItem;
  index: number;
  isAccepted: boolean;
  isCancelled: boolean;
  cancellationReason?: string;
  onAccept: () => void;
  onCancel: (reason: string) => void;
  user: AuthUser | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [question, setQuestion] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [messages, setMessages] = useState<JobChatMessage[]>(() => getJobMessages(job.id));
  const contractorName = user?.name || "Contractor";

  useEffect(() => {
    setMessages(getJobMessages(job.id));
  }, [job.id]);

  useEffect(() => {
    const onStorage = () => setMessages(getJobMessages(job.id));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [job.id]);

  const handleSendQuestion = () => {
    const message = question.trim();
    if (!message) return;
    addJobMessage(job.id, {
      senderRole: "contractor",
      senderName: contractorName,
      text: message,
    });
    setMessages(getJobMessages(job.id));
    setQuestion("");
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.07 }}
      className={`bg-card border p-5 group transition-colors ${
        isCancelled
          ? "border-red-700 bg-red-600 text-white"
          : isAccepted
            ? "border-green-500/40 bg-green-50/30"
            : "border-border hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`font-mono text-[10px] tracking-wider uppercase ${isCancelled ? "text-white" : "text-primary"}`}>
              {job.tag}
            </span>
            {job.urgent && (
              <span className={`font-mono text-[9px] border px-1.5 py-0.5 uppercase tracking-wider ${
                isCancelled
                  ? "bg-white/20 text-white border-white/40"
                  : "bg-red-100 text-red-600 border-red-200"
              }`}>
                Urgent
              </span>
            )}
            {job.ai && (
              <span className={`font-mono text-[9px] border px-1.5 py-0.5 uppercase tracking-wider ${
                isCancelled
                  ? "bg-white/10 text-white border-white/30"
                  : "bg-primary/10 text-primary border-primary/20"
              }`}>
                AI Assessed
              </span>
            )}
          </div>
          <p className={`text-sm font-medium mb-2 ${isCancelled ? "text-white" : "text-foreground"}`}>{job.title}</p>
          <div className={`mb-2 text-xs ${isCancelled ? "text-white/90" : "text-muted-foreground"}`}>
            <span className="font-mono tracking-wider uppercase">Requirements:</span>{" "}
            {job.requirements.join(" · ")}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <MapPin size={10} className={isCancelled ? "text-white/80" : "text-muted-foreground"} />
              <span className={`font-mono text-[11px] ${isCancelled ? "text-white/90" : "text-muted-foreground"}`}>{job.cityStateZip}</span>
            </div>
            <span className={`font-mono text-[11px] ${isCancelled ? "text-white/90" : "text-muted-foreground"}`}>
              <Clock size={10} className="inline mr-1" />
              {job.posted}
            </span>
            <span className={`font-mono text-[11px] ${isCancelled ? "text-white/90" : "text-muted-foreground"}`}>{job.dist} away</span>
          </div>
          {isAccepted && !isCancelled ? (
            <div className="mt-3 border border-green-200 bg-green-50/50 px-3 py-2 text-xs space-y-1">
              <p className="font-mono tracking-wider uppercase text-green-700">Accepted Job Details</p>
              <p className="text-foreground"><strong>Address:</strong> {job.fullAddress}</p>
              <p className="text-foreground"><strong>Contact:</strong> {job.contactName} · {job.contactPhone}</p>
            </div>
          ) : isCancelled ? (
            <div className="mt-3 border border-white/40 bg-red-700 px-3 py-2 text-xs space-y-1">
              <p className="font-mono tracking-wider uppercase text-white">Job Cancelled</p>
              <p className="text-white"><strong>Reason:</strong> {cancellationReason || "No reason provided"}</p>
            </div>
          ) : (
            <div className="mt-3 border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Full address and contact number unlock after you take this job.
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <p className={`text-sm font-semibold ${isCancelled ? "text-white" : "text-foreground"}`}>{job.est}</p>
            <p className={`font-mono text-[10px] ${isCancelled ? "text-white/90" : "text-muted-foreground"}`}>{job.bids} bids so far</p>
          </div>
          {isCancelled ? (
            <span className="font-mono text-[10px] text-white border border-white/40 bg-red-700 px-3 py-1.5">
              Cancelled
            </span>
          ) : isAccepted ? (
            <span className="font-mono text-[10px] text-green-600 border border-green-500/30 bg-green-50 px-3 py-1.5">
              ✓ Accepted
            </span>
          ) : (
            <button
              onClick={onAccept}
              className="font-mono text-[11px] bg-primary text-white px-3 py-1.5 hover:bg-primary/90 transition-colors"
            >
              I Can Do This →
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        {isAccepted && !isCancelled && (
          <div className="mb-3">
            {!showCancelForm ? (
              <button
                type="button"
                onClick={() => setShowCancelForm(true)}
                className="font-mono text-[11px] text-red-600 border border-red-300 px-3 py-1.5 hover:bg-red-50 transition-colors"
              >
                Cancel This Job
              </button>
            ) : (
              <div className="border border-red-200 bg-red-50/50 p-3 space-y-2">
                <p className="font-mono text-[10px] tracking-wider uppercase text-red-700">
                  Why can&apos;t you do this job?
                </p>
                <textarea
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  rows={2}
                  placeholder="Please provide your reason for cancellation..."
                  className="w-full border border-red-200 bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-red-400 transition-colors resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const reason = cancelReasonInput.trim();
                      if (!reason) return;
                      onCancel(reason);
                      setShowCancelForm(false);
                      setCancelReasonInput("");
                    }}
                    className="text-xs bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors"
                  >
                    Confirm Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelForm(false);
                      setCancelReasonInput("");
                    }}
                    className="text-xs border border-border text-foreground px-3 py-1.5 hover:border-foreground/30 transition-colors"
                  >
                    Keep Job
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-2">
          Questions? Text in app
        </p>
        <div className="max-h-28 overflow-y-auto border border-border bg-background p-2 space-y-1 mb-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">No messages yet for this job.</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-xs px-2 py-1 border ${
                msg.senderRole === "contractor"
                  ? "bg-primary/5 border-primary/20"
                  : "bg-muted/50 border-border"
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {msg.senderName}
              </span>
              <p>{msg.text}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendQuestion()}
            placeholder="Message homeowner about scope, timing, or materials..."
            className="flex-1 border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 transition-colors"
          />
          <button
            type="button"
            onClick={handleSendQuestion}
            className="inline-flex items-center justify-center gap-1 bg-primary text-white px-3 py-2 text-xs hover:bg-primary/90 transition-colors sm:w-auto w-full"
          >
            <Send size={12} />
            Send
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function FindTab({ user }: { user: AuthUser | null }) {
  const [filter, setFilter] = useState("all");
  const filters = ["all", "plumbing", "urgent", "nearby"];
  const [accepted, setAccepted] = useState<number[]>([]);
  const [cancelled, setCancelled] = useState<Record<number, string>>({});
  const [jobs, setJobs] = useState<JobBoardItem[]>(() => getJobBoardJobs());

  useEffect(() => {
    setJobs(getJobBoardJobs());
    const onStorage = () => setJobs(getJobBoardJobs());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const eligibleJobs = jobs.filter((job) =>
    contractorCanDoJob(user?.trade, job.category),
  );

  const filtered = filter === "urgent"
    ? eligibleJobs.filter((j) => j.urgent)
    : filter === "nearby"
      ? eligibleJobs.filter((j) => parseFloat(j.dist) < 3)
      : filter === "plumbing"
        ? eligibleJobs.filter((j) => j.category === "Plumbing")
        : eligibleJobs;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
            Find Jobs
          </h2>
          <p className="text-sm text-muted-foreground">Active repair requests matching your trade in NYC & Long Island.</p>
        </div>
        <div className="flex items-center gap-1 bg-card border border-border p-1 overflow-x-auto max-w-full">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors ${
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Job list */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 && (
            <div className="border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
              No jobs currently match your selected filter and trade. Jobs posted under
              <strong> Others</strong> are visible to all contractors.
            </div>
          )}
          {filtered.map((job, i) => (
            <FindJobCard
              key={job.id}
              job={job}
              index={i}
              isAccepted={accepted.includes(job.id)}
              isCancelled={Boolean(cancelled[job.id])}
              cancellationReason={cancelled[job.id]}
              onAccept={() => setAccepted((a) => [...a, job.id])}
              onCancel={(reason) => {
                setCancelled((prev) => ({ ...prev, [job.id]: reason }));
              }}
              user={user}
            />
          ))}
        </div>

        {/* Area overview */}
        <div className="space-y-4">
          <div className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">
              Jobs Near You
            </p>
            <div className="space-y-3">
              {AREA_NEIGHBORHOODS.map(({ name, jobs, dist, hot }) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    {hot && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    {!hot && <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />}
                    <div>
                      <p className="text-xs font-medium text-foreground">{name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{dist}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground">{jobs}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">open</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 p-5">
            <p className="font-mono text-[11px] tracking-wider text-primary uppercase mb-2">Your Stats</p>
            <div className="space-y-2">
              {[
                { label: "Bid close rate", val: "62%" },
                { label: "Avg. response", val: "18 min" },
                { label: "Jobs this month", val: "6" },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg text-primary">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkTab() {
  const total = COMPLETED_JOBS.reduce((s, j) => s + parseFloat(j.payout.replace("$", "")), 0);
  const avgRating = COMPLETED_JOBS.reduce((s, j) => s + j.rating, 0) / COMPLETED_JOBS.length;

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Work History
      </h2>
      <p className="text-sm text-muted-foreground mb-8">All completed jobs and homeowner reviews.</p>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Jobs Completed", val: COMPLETED_JOBS.length.toString(), icon: CheckSquare },
          { label: "Total Earned", val: `$${total.toLocaleString()}`, icon: DollarSign },
          { label: "Avg. Rating", val: `${avgRating.toFixed(1)}★`, icon: Star },
          { label: "Repeat Clients", val: "3", icon: TrendingUp },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="bg-card border border-border p-4">
            <Icon size={14} className="text-primary mb-2" />
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-foreground leading-none mb-1">{val}</p>
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {COMPLETED_JOBS.map((job, i) => {
          const ref = useRef<HTMLDivElement>(null);
          const inView = useInView(ref, { once: true });
          return (
            <motion.div
              key={job.id}
              ref={ref}
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08 }}
              className="bg-card border border-border p-5"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1">{job.title}</p>
                  <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <MapPin size={10} className="text-muted-foreground" />
                      <span className="font-mono text-[11px] text-muted-foreground">{job.location}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      <Clock size={10} className="inline mr-1" />{job.date}
                    </span>
                  </div>
                  <div className="bg-muted/50 border border-border/50 px-4 py-3">
                    <div className="flex gap-0.5 mb-1">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} size={11} fill={s <= job.rating ? "#FF4D1C" : "none"} className={s <= job.rating ? "text-primary" : "text-muted-foreground"} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground italic">&ldquo;{job.review}&rdquo;</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground">{job.payout}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">paid</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function EarningsTab() {
  const thisMonth = 4820;
  const lastMonth = 3800;
  const allTime = MONTHLY_EARNINGS.reduce((s, m) => s + m.earned, 0);

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Earnings
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Monthly breakdown and payout history.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: "This Month", val: `$${thisMonth.toLocaleString()}`, sub: "+27% vs last month", up: true },
          { label: "Last Month", val: `$${lastMonth.toLocaleString()}`, sub: "May 2024" },
          { label: "All Time", val: `$${allTime.toLocaleString()}`, sub: "Since joining" },
        ].map(({ label, val, sub, up }) => (
          <div key={label} className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-2">{label}</p>
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none mb-1">{val}</p>
            <p className={`font-mono text-[11px] ${up ? "text-green-600" : "text-muted-foreground"}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card border border-border p-5 mb-6">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-6">Monthly Earnings — 2024</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={MONTHLY_EARNINGS} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontFamily: "DM Mono", fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontFamily: "DM Mono", fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                fontFamily: "DM Mono",
                fontSize: 11,
              }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, "Earned"]}
            />
            <Bar dataKey="earned" fill="#FF4D1C" radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent payouts */}
      <div className="bg-card border border-border">
        <div className="border-b border-border px-5 py-3">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Recent Payouts</p>
        </div>
        <div className="divide-y divide-border">
          {COMPLETED_JOBS.slice(0, 4).map((job) => (
            <div key={job.id} className="px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{job.title}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{job.date}</p>
              </div>
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-xl text-foreground">{job.payout}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user }: { user: AuthUser | null }) {
  const displayName = user?.name || "James Park";
  const trade = user?.trade || "Master Plumber";
  const license = user?.licenseNumber || "NY-00231847";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Profile
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Your verified contractor profile visible to homeowners.</p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Profile card */}
          <div className="bg-card border border-border p-6">
            <div className="flex items-start gap-5 mb-6">
              <div className="w-16 h-16 bg-sky-400 rounded-full flex items-center justify-center text-white text-2xl font-bold [font-family:'Barlow_Condensed',sans-serif] shrink-0">
                {initials}
              </div>
              <div>
                <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground">{displayName}</h3>
                <p className="font-mono text-[11px] text-primary mb-1">{trade} · License #{license}</p>
                <div className="flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map((s) => <Star key={s} size={12} fill="#FF4D1C" className="text-primary" />)}
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">4.9 (5 reviews)</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: "Service Area", value: "Queens, Brooklyn, Nassau County (Long Island)" },
                { label: "Years in Trade", value: "12 years" },
                { label: "Company", value: "Park Plumbing & Mechanical LLC" },
                { label: "Response Time", value: "Avg. 18 minutes" },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4 py-2.5 border-b border-border/50 last:border-0">
                  <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider w-32 shrink-0">{label}</p>
                  <p className="text-sm text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <button className="mt-5 border border-border text-foreground px-4 py-2 text-sm hover:border-foreground/30 transition-colors">
              Edit Profile
            </button>
          </div>

          {/* Bio */}
          <div className="bg-card border border-border p-6">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">Bio</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Licensed master plumber with 12 years of residential and light commercial experience across
              Queens, Brooklyn, and Nassau County. Specializing in leak repairs, pipe replacements, water
              heater installation, and drain clearing. Same-day availability for emergencies.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Verification badges */}
          <div className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">
              Verification Status
            </p>
            <div className="space-y-3">
              {[
                { icon: FileCheck, label: "License Verified", status: true, detail: "NY Master Plumber" },
                { icon: Shield, label: "Insurance Active", status: true, detail: "General Liability $2M" },
                { icon: CheckSquare, label: "Background Check", status: true, detail: "Cleared Jun 2024" },
                { icon: AlertCircle, label: "Workers' Comp", status: false, detail: "Upload required" },
              ].map(({ icon: Icon, label, status, detail }) => (
                <div key={label} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <Icon size={14} className={status ? "text-green-600" : "text-yellow-500"} />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{detail}</p>
                  </div>
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 border ${status ? "text-green-600 border-green-200 bg-green-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}`}>
                    {status ? "✓ OK" : "⚠ Needed"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Performance */}
          <div className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">
              Performance
            </p>
            <div className="space-y-3">
              {[
                { label: "Bid Close Rate", val: "62%" },
                { label: "Jobs Completed", val: "5" },
                { label: "On-Time Arrival", val: "100%" },
                { label: "Repeat Clients", val: "3" },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-primary">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContractorDashboard({
  onLogout,
  onOpenAdmin,
  user,
  isDark,
  onToggleDark,
}: {
  onLogout: () => void;
  onOpenAdmin: () => void;
  user: AuthUser | null;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("find");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const displayName = user?.name || "James Park";
  const trade = user?.trade || "Master Plumber";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu overlay"
        />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${sidebarOpen ? "md:w-56" : "md:w-16"} w-64 shrink-0`}
      >
        <div className="border-b border-border px-4 py-4 flex items-center gap-2 h-16">
          <button onClick={() => setSidebarOpen((s) => !s)} className="flex items-center gap-1.5">
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-foreground">F</span>
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-primary">B</span>
            {sidebarOpen && (
              <span className="font-mono text-[9px] bg-primary text-white px-1 py-0.5 ml-0.5">PRO</span>
            )}
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                activeTab === id
                  ? "bg-primary/10 text-primary border-r-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon size={17} className="shrink-0" />
              {sidebarOpen && <span className="text-sm font-medium truncate">{label}</span>}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          <button
            onClick={onToggleDark}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isDark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
            {sidebarOpen && <span className="text-xs">{isDark ? "Light mode" : "Dark mode"}</span>}
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            {sidebarOpen && <span className="text-xs">Sign Out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card shrink-0">
          <div>
            <button
              type="button"
              className="md:hidden w-8 h-8 mb-1 flex items-center justify-center border border-border text-muted-foreground"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-primary uppercase tracking-wider">{trade}</span>
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span className="font-mono text-[10px] text-green-600">Active</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                className="w-8 h-8 bg-sky-400 rounded-full flex items-center justify-center text-white text-xs font-bold"
                aria-label="Open profile menu"
              >
                {initials}
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-10 w-44 border border-border bg-card shadow-lg z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  >
                    Admin Panel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "find" && <FindTab user={user} />}
            {activeTab === "work" && <WorkTab />}
            {activeTab === "earnings" && <EarningsTab />}
            {activeTab === "profile" && <ProfileTab user={user} />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
