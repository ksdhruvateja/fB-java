import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Search, CheckSquare, DollarSign, User, Bell, LogOut,
  MapPin, Clock, Star, ChevronRight, TrendingUp,
  FileCheck, AlertCircle, Wrench, Zap, Flame, Sun, Moon,
  BarChart2, Shield, Phone, Mail,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";

type DashTab = "find" | "work" | "earnings" | "profile";

const NAV_ITEMS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "find", label: "Find Jobs", icon: Search },
  { id: "work", label: "My Work", icon: CheckSquare },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "profile", label: "My Profile", icon: User },
];

const AVAILABLE_JOBS = [
  { id: 1, tag: "PLUMBING", title: "Kitchen sink drain clog — backed up", location: "Park Slope, Brooklyn", dist: "2.1 mi", posted: "1h ago", est: "$150–$320", bids: 2, urgent: false, ai: true },
  { id: 2, tag: "PLUMBING · URGENT", title: "Pipe burst under bathroom vanity", location: "Astoria, Queens", dist: "0.8 mi", posted: "25m ago", est: "$280–$520", bids: 1, urgent: true, ai: true },
  { id: 3, tag: "PLUMBING", title: "Water heater not heating — 40 gal tank", location: "Flushing, Queens", dist: "3.4 mi", posted: "4h ago", est: "$400–$850", bids: 3, urgent: false, ai: true },
  { id: 4, tag: "PLUMBING", title: "Toilet running constantly — won't stop", location: "Mineola, Long Island", dist: "5.2 mi", posted: "2h ago", est: "$80–$180", bids: 0, urgent: false, ai: false },
  { id: 5, tag: "PLUMBING · URGENT", title: "Sewer smell throughout basement", location: "Jamaica, Queens", dist: "4.1 mi", posted: "3h ago", est: "$320–$700", bids: 2, urgent: true, ai: true },
  { id: 6, tag: "PLUMBING", title: "Outdoor spigot replacement — 2 units", location: "Huntington, Long Island", dist: "7.8 mi", posted: "1d ago", est: "$120–$240", bids: 4, urgent: false, ai: true },
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

function FindTab() {
  const [filter, setFilter] = useState("all");
  const filters = ["all", "plumbing", "urgent", "nearby"];
  const [accepted, setAccepted] = useState<number[]>([]);

  const filtered = filter === "urgent"
    ? AVAILABLE_JOBS.filter((j) => j.urgent)
    : filter === "nearby"
    ? AVAILABLE_JOBS.filter((j) => parseFloat(j.dist) < 3)
    : AVAILABLE_JOBS;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
            Find Jobs
          </h2>
          <p className="text-sm text-muted-foreground">Active repair requests matching your trade in NYC & Long Island.</p>
        </div>
        <div className="flex items-center gap-1 bg-card border border-border p-1">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Job list */}
        <div className="xl:col-span-2 space-y-3">
          {filtered.map((job, i) => {
            const ref = useRef<HTMLDivElement>(null);
            const inView = useInView(ref, { once: true });
            const isAccepted = accepted.includes(job.id);
            return (
              <motion.div
                key={job.id}
                ref={ref}
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.07 }}
                className={`bg-card border p-5 group transition-colors ${
                  isAccepted ? "border-green-500/40 bg-green-50/30" : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-[10px] tracking-wider text-primary uppercase">{job.tag}</span>
                      {job.urgent && (
                        <span className="font-mono text-[9px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 uppercase tracking-wider">
                          Urgent
                        </span>
                      )}
                      {job.ai && (
                        <span className="font-mono text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 uppercase tracking-wider">
                          AI Assessed
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mb-2">{job.title}</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1">
                        <MapPin size={10} className="text-muted-foreground" />
                        <span className="font-mono text-[11px] text-muted-foreground">{job.location}</span>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        <Clock size={10} className="inline mr-1" />{job.posted}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{job.dist} away</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{job.est}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{job.bids} bids so far</p>
                    </div>
                    {isAccepted ? (
                      <span className="font-mono text-[10px] text-green-600 border border-green-500/30 bg-green-50 px-3 py-1.5">
                        ✓ Accepted
                      </span>
                    ) : (
                      <button
                        onClick={() => setAccepted((a) => [...a, job.id])}
                        className="font-mono text-[11px] bg-primary text-white px-3 py-1.5 hover:bg-primary/90 transition-colors"
                      >
                        I Can Do This →
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
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

      <div className="grid grid-cols-3 gap-3 mb-8">
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

function ProfileTab() {
  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Profile
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Your verified contractor profile visible to homeowners.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Profile card */}
          <div className="bg-card border border-border p-6">
            <div className="flex items-start gap-5 mb-6">
              <div className="w-16 h-16 bg-sky-400 rounded-full flex items-center justify-center text-white text-2xl font-bold [font-family:'Barlow_Condensed',sans-serif] shrink-0">
                JP
              </div>
              <div>
                <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground">James Park</h3>
                <p className="font-mono text-[11px] text-primary mb-1">Master Plumber · License #NY-00231847</p>
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
  isDark,
  onToggleDark,
}: {
  onLogout: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("find");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${
          sidebarOpen ? "w-56" : "w-16"
        } shrink-0`}
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
              onClick={() => setActiveTab(id)}
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
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card shrink-0">
          <div>
            <p className="text-sm font-medium text-foreground">James Park</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-primary uppercase tracking-wider">Master Plumber</span>
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span className="font-mono text-[10px] text-green-600">Active</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <div className="w-8 h-8 bg-sky-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
              JP
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
            {activeTab === "find" && <FindTab />}
            {activeTab === "work" && <WorkTab />}
            {activeTab === "earnings" && <EarningsTab />}
            {activeTab === "profile" && <ProfileTab />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
