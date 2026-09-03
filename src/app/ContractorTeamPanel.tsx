import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Users, X } from "lucide-react";
import {
  fetchContractorEmployees,
  saveContractorEmployee,
  type ContractorEmployee,
} from "./managedJobs";

const ROLES = ["Field Technician", "Technician", "Dispatcher", "Manager", "Owner"];

export default function ContractorTeamPanel({
  companyName,
}: {
  companyName: string;
  workspace?: unknown;
  onChange?: (next: unknown) => void;
}) {
  const [employees, setEmployees] = useState<ContractorEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ContractorEmployee | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Field Technician");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetchContractorEmployees();
    if (!r.ok) setError(r.message || "Could not load team.");
    else setEmployees(r.employees || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setRole("Field Technician");
    setPhone("");
    setEmail("");
    setTrade("");
    setPhotoPreview(null);
    setShowAdd(true);
  };

  const openEdit = (member: ContractorEmployee) => {
    setEditing(member);
    setName(member.fullName);
    setRole(member.jobTitle || "Field Technician");
    setPhone(member.primaryPhone || member.phones[0]?.value || "");
    setEmail(member.primaryEmail || member.emails[0]?.value || "");
    setTrade(member.trade || "");
    setPhotoPreview(member.photoUrl || null);
    setShowAdd(true);
  };

  const saveMember = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      fullName: name.trim(),
      jobTitle: role,
      trade: trade.trim() || null,
      phones: phone.trim() ? [{ value: phone.trim(), isPrimary: true, customerVisible: true }] : [],
      emails: email.trim() ? [{ value: email.trim(), isPrimary: true, customerVisible: false }] : [],
      active: editing ? editing.active : true,
    };
    if (photoPreview?.startsWith("data:image/")) {
      const [, mime, data] = photoPreview.match(/^data:(image\/[a-z+]+);base64,(.+)$/i) || [];
      if (mime && data) {
        body.photoData = data;
        body.photoMime = mime;
      }
    } else if (photoPreview === null && editing?.hasPhoto) {
      body.photoData = null;
      body.photoMime = null;
    }
    const r = await saveContractorEmployee(body, editing?.id);
    setSaving(false);
    if (!r.ok) {
      setError(r.message || "Could not save team member.");
      return;
    }
    setShowAdd(false);
    await refresh();
  };

  const toggleActive = async (member: ContractorEmployee) => {
    setSaving(true);
    await saveContractorEmployee({ ...member, active: !member.active, fullName: member.fullName }, member.id);
    setSaving(false);
    await refresh();
  };

  const fieldCount = employees.filter((t) => t.active && ["Field Technician", "Technician"].includes(t.jobTitle || "")).length;

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Team</h1>
          <p className="mt-1 text-lg font-semibold">{companyName}</p>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            {employees.length} team member{employees.length === 1 ? "" : "s"} · {fieldCount} field technician
            {fieldCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add employee
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
        </p>
      ) : (
        <ul className="space-y-3">
          {employees.map((m) => (
            <li key={m.id} className="rounded-[1.25rem] border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" className="h-12 w-12 rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-sm font-semibold">
                      {m.fullName.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <p className="text-base font-semibold">{m.fullName}</p>
                    <p className="text-sm text-muted-foreground">{m.jobTitle || "Team member"}</p>
                    {m.trade && <p className="mt-1 text-xs text-muted-foreground">{m.trade}</p>}
                    {(m.primaryPhone || m.primaryEmail) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[m.primaryPhone, m.primaryEmail].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    m.active
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                <button type="button" className="text-primary hover:underline" onClick={() => openEdit(m)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  disabled={saving}
                  onClick={() => void toggleActive(m)}
                >
                  {m.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{editing ? "Edit employee" : "Add employee"}</p>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Primary phone (customer-visible)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Email (internal by default)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              placeholder="Trade / specialty"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
            />
            <div>
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1_500_000) {
                    setError("Photo must be under 1.5 MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setPhotoPreview(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm"
                onClick={() => photoRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {photoPreview ? "Replace profile photo" : "Upload profile photo"}
              </button>
              {photoPreview ? (
                <img src={photoPreview} alt="" className="mt-2 h-24 w-24 rounded-xl border border-border object-cover" />
              ) : null}
            </div>
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void saveMember()}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save employee"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
