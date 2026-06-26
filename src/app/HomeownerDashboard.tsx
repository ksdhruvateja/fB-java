import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  PlusCircle, Briefcase, MessageSquare, Phone,
  Bell, LogOut, Zap, Wrench, Flame, PaintBucket,
  Home, Layers, Hammer, ChevronRight, Star, Clock,
  CheckCircle, AlertCircle, Send, MapPin, DollarSign,
  Mail, FileText, Sun, Moon,
} from "lucide-react";

type DashTab = "post" | "jobs" | "ai" | "contact";

const NAV_ITEMS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "post", label: "Post a Job", icon: PlusCircle },
  { id: "jobs", label: "My Jobs", icon: Briefcase },
  { id: "ai", label: "AI Assistance", icon: MessageSquare },
  { id: "contact", label: "Contact Us", icon: Phone },
];

const CATEGORIES = [
  { icon: Wrench, label: "Plumbing" },
  { icon: Zap, label: "Electrical" },
  { icon: Flame, label: "HVAC" },
  { icon: PaintBucket, label: "Painting" },
  { icon: Home, label: "Roofing" },
  { icon: Layers, label: "Flooring" },
  { icon: Hammer, label: "Carpentry" },
  { icon: Home, label: "General" },
];

const URGENCY_OPTS = [
  { val: "low", label: "Not Urgent", desc: "Within a few weeks", color: "text-green-600" },
  { val: "medium", label: "This Week", desc: "Within 7 days", color: "text-yellow-600" },
  { val: "high", label: "Urgent", desc: "Within 48 hours", color: "text-orange-600" },
  { val: "emergency", label: "Emergency", desc: "Today / ASAP", color: "text-red-600" },
];

const MY_JOBS = [
  {
    id: 1,
    title: "Kitchen sink drain clog",
    category: "Plumbing",
    posted: "Jun 22, 2024",
    bids: 4,
    status: "open",
    est: "$180–$340",
    topBid: "$195",
    aiAssessed: true,
  },
  {
    id: 2,
    title: "Furnace not heating evenly — 2nd floor",
    category: "HVAC",
    posted: "Jun 18, 2024",
    bids: 7,
    status: "in-progress",
    est: "$280–$520",
    topBid: "$310",
    aiAssessed: true,
    contractor: "Ed Kowalski HVAC",
  },
  {
    id: 3,
    title: "Bathroom tile re-grouting",
    category: "General",
    posted: "May 30, 2024",
    bids: 5,
    status: "completed",
    est: "$300–$600",
    topBid: "$385",
    aiAssessed: true,
    saved: "$215",
    rating: 5,
  },
  {
    id: 4,
    title: "Outdoor deck board replacement",
    category: "Carpentry",
    posted: "Jun 24, 2024",
    bids: 0,
    status: "open",
    est: "Pending AI",
    topBid: "—",
    aiAssessed: false,
  },
];

const CHAT_MESSAGES = [
  { role: "user", text: "My bathroom faucet is dripping constantly. It started about a week ago." },
  { role: "ai", label: "Assessment", text: "A constantly dripping faucet is usually a worn cartridge, O-ring, or washer. It's low urgency but wastes water — a typical NYC household loses 3,000+ gallons/year from a drip." },
  { role: "ai", label: "Cost Estimate", text: "NYC area repair range: $85–$200. Faucet cartridge replacement if DIY-able: $15–$40 in parts. Licensed plumber visit: $95–$185 including labor." },
  { role: "ai", label: "Next Steps", text: "Ready to post this for bids? I'll include the assessment in your job listing so contractors come prepared with the right parts." },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-green-100 text-green-700 border-green-200" },
    "in-progress": { label: "In Progress", className: "bg-blue-100 text-blue-700 border-blue-200" },
    completed: { label: "Completed", className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = map[status] ?? map.open;
  return (
    <span className={`font-mono text-[10px] tracking-wider uppercase border px-2 py-0.5 ${className}`}>
      {label}
    </span>
  );
}

function PostTab() {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={28} className="text-green-600" />
        </div>
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-3xl uppercase text-foreground mb-2">
          Job Posted!
        </h3>
        <p className="text-muted-foreground text-sm max-w-sm mb-6">
          Your job has been posted and our AI is generating an assessment. You'll start receiving
          bids from vetted contractors within 48 hours.
        </p>
        <button
          onClick={() => { setSubmitted(false); setSelectedCat(null); setUrgency(null); setDescription(""); }}
          className="bg-primary text-white px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Post Another Job
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Post a Repair Job
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Describe your problem — our AI will assess it and vetted contractors will bid.
      </p>

      {/* Step 1: Category */}
      <div className="mb-8">
        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
          Step 1 — Select Trade Category
        </p>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => setSelectedCat(label)}
              className={`flex flex-col items-center gap-2 py-4 px-2 border transition-all duration-150 ${
                selectedCat === label
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              <Icon size={18} />
              <span className="font-mono text-[10px] tracking-wider uppercase">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Description */}
      <div className="mb-8">
        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
          Step 2 — Describe the Problem
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. My kitchen sink drain is completely clogged. Water backs up within 30 seconds of running the tap. I've tried drain cleaner — no luck. The smell started yesterday."
          rows={5}
          className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="font-mono text-[10px] text-muted-foreground">
            More detail = better AI assessment + more accurate bids
          </p>
          <button className="font-mono text-[10px] text-primary hover:underline flex items-center gap-1">
            <FileText size={11} />
            Upload Photo
          </button>
        </div>
      </div>

      {/* Step 3: Urgency */}
      <div className="mb-10">
        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
          Step 3 — How Urgent Is This?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {URGENCY_OPTS.map(({ val, label, desc, color }) => (
            <button
              key={val}
              onClick={() => setUrgency(val)}
              className={`flex flex-col items-start gap-1 p-4 border text-left transition-all ${
                urgency === val
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <span className={`text-sm font-medium ${urgency === val ? "text-primary" : "text-foreground"}`}>
                {label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => selectedCat && description && urgency && setSubmitted(true)}
          className="flex-1 bg-primary text-white py-3.5 font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 group"
        >
          Post Job & Get AI Assessment
          <ChevronRight size={15} className="transition-transform group-hover:translate-x-1" />
        </button>
        <button className="border border-border text-muted-foreground px-5 py-3.5 text-sm hover:border-foreground/30 transition-colors">
          Save Draft
        </button>
      </div>
    </div>
  );
}

function JobsTab() {
  const total = MY_JOBS.length;
  const active = MY_JOBS.filter((j) => j.status === "open" || j.status === "in-progress").length;
  const completed = MY_JOBS.filter((j) => j.status === "completed").length;
  const totalBids = MY_JOBS.reduce((s, j) => s + j.bids, 0);

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Jobs
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Track posted jobs, bids received, and repair history.</p>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Posted", val: total, icon: Briefcase },
          { label: "Active Jobs", val: active, icon: AlertCircle },
          { label: "Completed", val: completed, icon: CheckCircle },
          { label: "Total Bids Received", val: totalBids, icon: Star },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="bg-card border border-border p-4">
            <Icon size={14} className="text-primary mb-2" />
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-foreground leading-none mb-1">
              {val}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* Job cards */}
      <div className="space-y-3">
        {MY_JOBS.map((job, i) => {
          const ref = useRef<HTMLDivElement>(null);
          const inView = useInView(ref, { once: true });
          return (
            <motion.div
              key={job.id}
              ref={ref}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08 }}
              className="bg-card border border-border p-5 hover:border-primary/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                      {job.category}
                    </span>
                    <StatusBadge status={job.status} />
                    {!job.aiAssessed && (
                      <span className="font-mono text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 uppercase tracking-wider">
                        AI Pending
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">{job.title}</p>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      <Clock size={10} className="inline mr-1" />
                      Posted {job.posted}
                    </span>
                    {job.contractor && (
                      <span className="font-mono text-[11px] text-blue-600">
                        → {job.contractor}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground leading-none">
                      {job.bids}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">bids</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">{job.topBid}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">top bid</p>
                  </div>
                  {job.saved && (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-green-600">{job.saved}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">saved</p>
                    </div>
                  )}
                  {job.status === "completed" && job.rating && (
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} size={11} fill="#FF4D1C" className="text-primary" />
                      ))}
                    </div>
                  )}
                  {job.bids > 0 && job.status !== "completed" && (
                    <button className="font-mono text-[11px] text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary hover:text-white transition-all opacity-0 group-hover:opacity-100">
                      View Bids
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function AITab() {
  const [messages, setMessages] = useState(CHAT_MESSAGES);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", text: input }]);
    const q = input;
    setInput("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          label: "AI Response",
          text: `I understand your question about "${q}". Let me help you assess this. Based on typical NYC-area jobs with similar descriptions, this sounds like a repair that would cost approximately $150–$400 and require a licensed professional. Shall I post this as a job for contractor bids?`,
        },
      ]);
    }, 800);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="mb-6">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
          AI Assistance
        </h2>
        <p className="text-sm text-muted-foreground">
          Describe any repair problem — get an instant assessment, cost estimate, and next steps.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto border border-border bg-card p-5 space-y-4 mb-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] p-4 ${
                msg.role === "user"
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-background border border-border"
              }`}
            >
              {msg.label && (
                <p className="font-mono text-[10px] tracking-[0.15em] text-primary uppercase mb-1.5">
                  {msg.label}
                </p>
              )}
              <p className="text-sm text-foreground leading-relaxed">{msg.text}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Describe your repair problem…"
          className="flex-1 border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
        />
        <button
          onClick={handleSend}
          className="bg-primary text-white px-4 py-3 hover:bg-primary/90 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function ContactTab() {
  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Contact & Support
      </h2>
      <p className="text-sm text-muted-foreground mb-8">We're here to help with anything on the platform.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {[
          { icon: MessageSquare, label: "Live Chat", desc: "Usually responds in under 2 min", cta: "Start Chat", primary: true },
          { icon: Mail, label: "Email Support", desc: "support@fixbridge.ai · 4–6h response", cta: "Send Email", primary: false },
          { icon: Phone, label: "Phone", desc: "(212) 555-0182 · Mon–Fri 9am–6pm EST", cta: "Call Now", primary: false },
        ].map(({ icon: Icon, label, desc, cta, primary }) => (
          <div key={label} className="bg-card border border-border p-6 flex flex-col gap-3">
            <Icon size={20} className="text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground mb-0.5">{label}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <button
              className={`text-sm font-medium px-4 py-2 transition-colors mt-auto ${
                primary
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "border border-border text-foreground hover:border-foreground/30"
              }`}
            >
              {cta}
            </button>
          </div>
        ))}
      </div>

      <div className="border border-border bg-card p-6 mb-6">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">
          Send a Message
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Subject</label>
              <input
                type="text"
                placeholder="Issue with bid received"
                className="w-full border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Related Job</label>
              <select className="w-full border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60">
                <option>Kitchen sink drain clog</option>
                <option>Furnace repair</option>
                <option>General inquiry</option>
              </select>
            </div>
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Message</label>
            <textarea
              rows={4}
              placeholder="Describe your issue or question…"
              className="w-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 resize-none"
            />
          </div>
          <button className="bg-primary text-white px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
            Send Message
          </button>
        </div>
      </div>

      <div className="bg-muted/50 border border-border p-5">
        <p className="font-mono text-[11px] tracking-wider text-foreground uppercase mb-3">
          Quick FAQs
        </p>
        <div className="space-y-2">
          {[
            "How long until I get my first bid?",
            "Can I reject a bid after accepting?",
            "What does the booking fee cover?",
            "How are contractors vetted?",
          ].map((q) => (
            <button key={q} className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground py-2 border-b border-border/50 last:border-0 transition-colors text-left">
              {q}
              <ChevronRight size={14} className="shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomeownerDashboard({
  onLogout,
  isDark,
  onToggleDark,
}: {
  onLogout: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("post");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${
          sidebarOpen ? "w-56" : "w-16"
        } shrink-0`}
      >
        {/* Logo */}
        <div className="border-b border-border px-4 py-4 flex items-center gap-2 h-16">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="flex items-center gap-1.5 group"
          >
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-foreground">F</span>
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-primary">B</span>
            {sidebarOpen && (
              <span className="font-mono text-[9px] bg-primary text-white px-1 py-0.5 ml-0.5">AI</span>
            )}
          </button>
        </div>

        {/* Nav items */}
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
              {sidebarOpen && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User + logout */}
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

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card shrink-0">
          <div>
            <p className="text-sm font-medium text-foreground">Maria Santos</p>
            <div className="flex items-center gap-1">
              <MapPin size={10} className="text-primary" />
              <p className="font-mono text-[11px] text-muted-foreground">Astoria, Queens</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <div className="w-8 h-8 bg-orange-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
              M
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "post" && <PostTab />}
            {activeTab === "jobs" && <JobsTab />}
            {activeTab === "ai" && <AITab />}
            {activeTab === "contact" && <ContactTab />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
