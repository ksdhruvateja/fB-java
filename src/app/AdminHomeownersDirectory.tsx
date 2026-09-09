import { useEffect, useState } from "react";
import { Loader2, Mail, Search } from "lucide-react";
import {
  listAdminCustomers,
  listAdminMarketingSubscribers,
  type CustomerDirectoryRow,
  type MarketingSubscriberRow,
} from "./marketingApi";
import { displayPlanLabel, isPaidHomeCarePlan } from "./subscriptionCatalog";
import type { SubscriberCustomer } from "./platformApi";

type DirectoryTab = "all" | "marketing";

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FF4D1C]/30";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function signupLabel(method?: string) {
  const m = String(method || "email").toLowerCase();
  if (m === "google") return "Google";
  if (m === "guest") return "Guest report";
  return "Email";
}

export default function AdminHomeownersDirectory({
  legacyCustomers,
  isReadOnly,
  onOpenProfile,
  onSendPasswordReset,
  onSendInvoice,
  onUpgrade,
}: {
  legacyCustomers?: SubscriberCustomer[];
  isReadOnly?: boolean;
  onOpenProfile: (id: number) => void;
  onSendPasswordReset: (c: { id: number; email: string }) => void;
  onSendInvoice: (c: { id: number; name: string; email: string }) => void;
  onUpgrade: (c: { id: number; name: string }) => void;
}) {
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("all");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([]);
  const [subscribers, setSubscribers] = useState<MarketingSubscriberRow[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      if (directoryTab === "all") {
        void listAdminCustomers(search).then((r) => {
          if (r.ok) setCustomers(r.customers || []);
          setLoading(false);
        });
      } else {
        void listAdminMarketingSubscribers(search, channelFilter).then((r) => {
          if (r.ok) setSubscribers(r.subscribers || []);
          setLoading(false);
        });
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [directoryTab, search, channelFilter]);

  function renderActions(c: { id: number; name: string; email: string; planCode?: string | null }) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenProfile(c.id)}
          className="inline-flex items-center gap-1 rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition"
        >
          Open Profile
        </button>
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => onSendPasswordReset({ id: c.id, email: c.email })}
          className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 transition disabled:opacity-50"
        >
          <Mail className="h-3.5 w-3.5" />
          Send Password Reset Email
        </button>
        <button
          type="button"
          onClick={() => onSendInvoice({ id: c.id, name: c.name, email: c.email })}
          className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 transition"
        >
          Send invoice
        </button>
        {!isPaidHomeCarePlan(c.planCode) ? (
          <button
            type="button"
            onClick={() => onUpgrade({ id: c.id, name: c.name })}
            className="inline-flex items-center gap-1 rounded bg-[#FF4D1C] hover:bg-[#FF4D1C]/90 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
          >
            Upgrade to HomeCare Pro
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic">HomeCare Pro active</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border/60 bg-muted/30 px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Customer directory</h3>
            <p className="text-xs text-muted-foreground">
              All Customers lists every homeowner. Marketing Subscribers shows only current promotional opt-ins.
            </p>
          </div>
          <div className="flex rounded-lg border border-border bg-background p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDirectoryTab("all")}
              className={`rounded-md px-3 py-1.5 transition ${directoryTab === "all" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              All Customers
            </button>
            <button
              type="button"
              onClick={() => setDirectoryTab("marketing")}
              className={`rounded-md px-3 py-1.5 transition ${directoryTab === "marketing" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              Marketing Subscribers
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative max-w-lg flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, or ID…"
              className={`${fieldClass} pl-9`}
            />
          </div>
          {directoryTab === "marketing" && (
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className={`${fieldClass} w-44`}
            >
              <option value="">All channels</option>
              <option value="email">Email subscribers</option>
              <option value="sms">SMS subscribers</option>
              <option value="both">Email + SMS</option>
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : directoryTab === "all" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground text-xs font-medium uppercase">
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Account</th>
                <th className="px-6 py-3">Signup Method</th>
                <th className="px-6 py-3">Marketing</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {customers.length > 0 ? (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10">
                    <td className="px-6 py-4">
                      <p className="font-medium">{c.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">#{c.id}</p>
                    </td>
                    <td className="px-6 py-4">{c.email}</td>
                    <td className="px-6 py-4 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-6 py-4 capitalize">{c.accountStatus || "active"}</td>
                    <td className="px-6 py-4">{signupLabel(c.signupMethod)}</td>
                    <td className="px-6 py-4">{c.marketingSummary || "None"}</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">{fmtDate(c.createdAt)}</td>
                    <td className="px-6 py-4 text-right">{renderActions(c)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    {search.trim() ? "No customers match that search." : "No customer homeowners registered yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground text-xs font-medium uppercase">
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Email Marketing</th>
                <th className="px-6 py-3">SMS Marketing</th>
                <th className="px-6 py-3">Consent Source</th>
                <th className="px-6 py-3">Last Updated</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {subscribers.length > 0 ? (
                subscribers.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/10">
                    <td className="px-6 py-4">
                      <p className="font-medium">{s.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">#{s.id}</p>
                    </td>
                    <td className="px-6 py-4">{s.email}</td>
                    <td className="px-6 py-4 text-muted-foreground">{s.phone || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={s.emailMarketing ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                        {s.emailMarketing ? "Subscribed" : "Unsubscribed"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={s.smsMarketing ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                        {s.smsMarketing ? "Subscribed" : "Unsubscribed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{s.lastConsentSource || "—"}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {fmtDate(s.emailOptInAt || s.smsOptInAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {renderActions({
                        id: s.id,
                        name: s.name,
                        email: s.email,
                        planCode: s.planCode,
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    {search.trim() || channelFilter
                      ? "No marketing subscribers match that filter."
                      : "No customers currently opted into marketing."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {legacyCustomers && legacyCustomers.length > 0 && directoryTab === "all" && customers.length === 0 && !loading && (
        <p className="px-6 pb-4 text-xs text-muted-foreground">
          Tip: legacy subscription list has {legacyCustomers.length} record(s) — new directory API may need a refresh.
        </p>
      )}
    </div>
  );
}
