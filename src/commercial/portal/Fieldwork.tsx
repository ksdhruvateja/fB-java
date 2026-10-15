import { useEffect, useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, CloudOff, LogIn, LogOut, MapPin, MessageSquarePlus, PhoneCall, Truck, XCircle } from "lucide-react";
import { api, CHECKIN_LABEL, OUTCOME_LABEL, type CUser, type Visit } from "../api";
import { outbox, sendFieldAction } from "../outbox";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Textarea, compressImage, cx, when } from "../ui";
import type { JobBundle } from "./JobDetail";
import { useSession } from "./Shell";

export function Fieldwork({ bundle, team, onChange }: { bundle: JobBundle; team: CUser[]; onChange: () => void }) {
  const { user, isOffice } = useSession();
  const j = bundle.job;
  const [startOpen, setStartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(outbox.items());
  useEffect(() => {
    const sync = () => setPending(outbox.items());
    window.addEventListener("commercial-outbox", sync);
    return () => window.removeEventListener("commercial-outbox", sync);
  }, []);
  const closed = ["completed", "invoiced", "paid"].includes(j.status);
  const visits: Visit[] = bundle.visits;
  const mine = visits.filter((v) => (v.technician_user_id === user.id || isOffice) && ["scheduled", "en_route", "on_site"].includes(v.status));
  const done = (result: any) => {
    // Offline: keep the page as it is; the queued action shows below and syncs later.
    if (result?.queued) return setNotice("Saved on this phone. It will be sent as soon as you have signal.");
    setNotice("");
    onChange();
  };
  useEffect(() => {
    const synced = () => { if (!outbox.count()) { setNotice(""); onChange(); } };
    window.addEventListener("commercial-outbox", synced);
    return () => window.removeEventListener("commercial-outbox", synced);
  }, [onChange]);

  return (
    <Card
      title="Site visits"
      actions={!closed ? <Button size="sm" tone={visits.length ? "secondary" : "primary"} onClick={() => setStartOpen(true)}>{visits.length ? "Start return visit" : "Start visit"}</Button> : null}
    >
      {notice ? <p className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><CloudOff className="h-4 w-4" />{notice}</p> : null}
      {pending.filter((p) => p.path.includes("/visits/") || p.path.includes(`/jobs/${j.id}/`)).map((p) => (
        <p key={p.id} className="mb-2 rounded-md bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
          Waiting to sync: {p.label} ({when(p.queued_at)}){p.last_error ? <span className="block font-medium text-red-600">Not accepted: {p.last_error}</span> : null}
        </p>
      ))}
      {mine.map((v) => <ActiveVisit key={v.id} visit={v} bundle={bundle} onDone={done} />)}
      {visits.length ? (
        <ul className="mt-2 space-y-2">
          {visits.filter((v) => !mine.includes(v)).map((v) => <VisitSummary key={v.id} visit={v} />)}
        </ul>
      ) : <p className="text-sm text-slate-500">No visits yet.{j.checkin_method !== "none" ? ` This customer requires check-in: ${CHECKIN_LABEL[j.checkin_method]}.` : ""}</p>}
      <StartVisitModal open={startOpen} onClose={() => setStartOpen(false)} bundle={bundle} team={team} onDone={() => { setStartOpen(false); onChange(); }} />
    </Card>
  );
}

function VisitSummary({ visit: v }: { visit: Visit }) {
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Visit {v.visit_number}</span>
        <span className="text-slate-500">· {v.technician_name || "Technician"}</span>
        {v.outcome ? <Badge tone={v.outcome === "completed" ? "green" : v.outcome === "no_access" ? "red" : "orange"}>{OUTCOME_LABEL[v.outcome]}</Badge> : <Badge>{v.status.replace("_", " ")}</Badge>}
        <CheckinBadge status={v.external_checkin_status} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {v.en_route_at ? `On the way ${when(v.en_route_at)} · ` : ""}{v.arrived_at ? `Arrived ${when(v.arrived_at)}` : "Not arrived"}{v.departed_at ? ` · Left ${when(v.departed_at)}` : ""}
        {v.arrival_lat != null ? " · location recorded" : v.arrived_at ? ` · ${v.arrival_location_note || "no location"}` : ""}
      </p>
      {v.external_checkin_note || v.external_checkin_reference ? <p className="mt-1 text-xs">Customer check-in: {[v.external_checkin_reference && `ref ${v.external_checkin_reference}`, v.external_checkin_note].filter(Boolean).join(" — ")}</p> : null}
      {v.work_performed ? <p className="mt-2 whitespace-pre-line">{v.work_performed}</p> : null}
      {v.parts_needed ? <p className="mt-1 text-xs"><span className="font-semibold">Parts needed:</span> {v.parts_needed}</p> : null}
      {v.notes ? <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{v.notes}</p> : null}
    </li>
  );
}

function CheckinBadge({ status }: { status: string }) {
  if (!status || status === "not_required") return null;
  const tone = status === "confirmed" ? "green" : status === "pending" ? "amber" : "red";
  const label = status === "confirmed" ? "Customer check-in confirmed" : status === "pending" ? "Customer check-in not recorded" : `Customer check-in ${status}`;
  return <Badge tone={tone}>{label}</Badge>;
}

function ActiveVisit({ visit: v, bundle, onDone }: { visit: Visit; bundle: JobBundle; onDone: (r: any) => void }) {
  const j = bundle.job;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [checkinOpen, setCheckinOpen] = useState<"" | "external_checkin" | "external_checkout">("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [shareLocation, setShareLocation] = useState(true);

  async function act(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(action);
    setError(null);
    try {
      onDone(await sendFieldAction(`/visits/${v.id}/action`, { action, ...extra }, `Visit ${v.visit_number}: ${label}`));
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  async function checkIn() {
    let coords: { lat?: number; lng?: number; location_note?: string } = { location_note: "Location not shared" };
    if (shareLocation && "geolocation" in navigator) {
      setBusy("check_in");
      coords = await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, location_note: `±${Math.round(p.coords.accuracy)} m` }),
          () => resolve({ location_note: "Location unavailable or not allowed" }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
        )
      );
    }
    await act("check_in", coords, "Check in");
  }

  return (
    <div className="mb-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">Visit {v.visit_number}</span>
        <span className="text-sm text-slate-600 dark:text-slate-400">{v.technician_name}</span>
        <Badge tone={v.status === "on_site" ? "green" : v.status === "en_route" ? "blue" : "slate"}>{v.status === "on_site" ? `On site since ${when(v.arrived_at)}` : v.status === "en_route" ? "On the way" : "Not started"}</Badge>
        <CheckinBadge status={v.external_checkin_status} />
      </div>
      {j.access_instructions && v.status !== "on_site" ? <p className="mt-2 text-sm"><span className="font-semibold">Access:</span> {j.access_instructions}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {v.status === "scheduled" ? (
          <Button size="xl" tone="secondary" onClick={() => act("on_my_way", {}, "On my way")} busy={busy === "on_my_way"}><Truck className="h-6 w-6" />On my way</Button>
        ) : null}
        {v.status === "scheduled" || v.status === "en_route" ? (
          <div>
            <Button size="xl" className="w-full" onClick={checkIn} busy={busy === "check_in"}><LogIn className="h-6 w-6" />Check in</Button>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} /> <MapPin className="h-3.5 w-3.5" />Record my location (optional)
            </label>
          </div>
        ) : null}
        {v.status === "on_site" && v.external_checkin_status === "pending" ? (
          <Button size="xl" tone="secondary" onClick={() => setCheckinOpen("external_checkin")}><PhoneCall className="h-6 w-6" />Customer check-in</Button>
        ) : null}
        {v.status === "on_site" ? (
          <Button size="xl" tone="success" onClick={() => setCheckoutOpen(true)}><LogOut className="h-6 w-6" />Check out</Button>
        ) : null}
      </div>
      {v.status === "on_site" && j.checkin_method !== "none" && v.external_checkin_status === "pending" ? (
        <p className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          Check in with the customer too ({CHECKIN_LABEL[j.checkin_method]}). {j.checkin_instructions}
        </p>
      ) : null}
      {v.status !== "scheduled" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <PhotoButton jobId={j.id} visitId={v.id} onDone={onDone} />
          <Button tone="secondary" onClick={() => setNoteOpen(true)}><MessageSquarePlus className="h-4 w-4" />Note</Button>
          {v.status === "on_site" && v.external_checkin_status !== "pending" && j.checkin_method !== "none" ? (
            <Button tone="ghost" size="sm" onClick={() => setCheckinOpen("external_checkin")}>Update customer check-in</Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3"><Button tone="ghost" size="sm" onClick={() => act("cancel", {}, "Cancel visit")}>Cancel this visit</Button></div>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>

      <ExternalCheckinModal open={!!checkinOpen} kind={checkinOpen || "external_checkin"} method={j.checkin_method} instructions={j.checkin_instructions} onClose={() => setCheckinOpen("")}
        onSubmit={async (body) => { await act(checkinOpen || "external_checkin", body, checkinOpen === "external_checkout" ? "Customer check-out" : "Customer check-in"); setCheckinOpen(""); }} />
      <CheckoutModal open={checkoutOpen} visit={v} checkinRequired={j.checkin_method !== "none"} onClose={() => setCheckoutOpen(false)}
        onSubmit={async (body, checkout) => {
          if (checkout) await act("external_checkout", checkout, "Customer check-out");
          await act("check_out", body, "Check out");
          setCheckoutOpen(false);
        }} />
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Add a note">
        <NoteForm onSubmit={async (note) => { await act("note", { note }, "Note"); setNoteOpen(false); }} />
      </Modal>
    </div>
  );
}

function NoteForm({ onSubmit }: { onSubmit: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return (
    <>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you found, who you spoke to, what is next…" autoFocus />
      <Button className="mt-3" onClick={() => onSubmit(note)} disabled={!note.trim()}>Save note</Button>
    </>
  );
}

function PhotoButton({ jobId, visitId, onDone }: { jobId: number; visitId: number; onDone: (r: any) => void }) {
  const [stage, setStage] = useState("during");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setBusy(true);
    setError("");
    try {
      for (const file of files.slice(0, 10)) {
        const dataUrl = await compressImage(file);
        if (!navigator.onLine && dataUrl.length > 1_500_000) {
          setError("This photo is too large to keep offline. Take it again when you have signal.");
          continue;
        }
        onDone(await sendFieldAction(`/jobs/${jobId}/files`, { dataUrl, name: file.name, stage, visit_id: visitId }, `Photo (${stage})`));
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-auto" aria-label="Photo stage">
        <option value="before">Before</option><option value="during">During</option><option value="after">After / completion</option><option value="document">Document / receipt</option>
      </Select>
      <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900", busy && "opacity-60")}>
        <Camera className="h-4 w-4" />{busy ? "Uploading…" : "Add photo"}
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFile} disabled={busy} />
      </label>
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </span>
  );
}

function ExternalCheckinModal({ open, kind, method, instructions, onClose, onSubmit }: { open: boolean; kind: string; method: string; instructions: string; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const [status, setStatus] = useState("confirmed");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "external_checkout" ? "check-out" : "check-in";
  return (
    <Modal open={open} onClose={onClose} title={`Customer ${label}`}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{CHECKIN_LABEL[method] || "Customer system"}{instructions ? ` — ${instructions}` : ""}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setStatus("confirmed")} className={cx("flex items-center justify-center gap-2 rounded-lg border-2 p-4 font-semibold", status === "confirmed" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200")}><CheckCircle2 className="h-5 w-5" />Confirmed</button>
        <button type="button" onClick={() => setStatus("failed")} className={cx("flex items-center justify-center gap-2 rounded-lg border-2 p-4 font-semibold", status === "failed" ? "border-red-600 bg-red-50 text-red-800" : "border-slate-200")}><XCircle className="h-5 w-5" />Did not work</button>
      </div>
      <button type="button" onClick={() => setStatus("exception")} className={cx("mt-2 w-full rounded-lg border-2 p-2 text-sm", status === "exception" ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200")}>Exception (dispatcher told me to skip it, site has no system, …)</button>
      <div className="mt-3 space-y-3">
        <Field label="Confirmation / reference number"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="IVR confirmation, portal code…" /></Field>
        <Field label={status === "confirmed" ? "Note (optional)" : "What happened? (required)"}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === "confirmed" ? "" : "e.g. IVR line busy three times; called dispatcher Pat at 9:12 who logged it manually"} />
        </Field>
      </div>
      <Button className="mt-4 w-full" size="lg" busy={busy} disabled={status !== "confirmed" && note.trim().length < 3}
        onClick={async () => { setBusy(true); try { await onSubmit({ status, reference, note, method }); setReference(""); setNote(""); setStatus("confirmed"); } finally { setBusy(false); } }}>
        Save customer {label}
      </Button>
    </Modal>
  );
}

function CheckoutModal({ open, visit, checkinRequired, onClose, onSubmit }: { open: boolean; visit: Visit; checkinRequired: boolean; onClose: () => void; onSubmit: (b: any, checkout?: any) => Promise<void> }) {
  const [outcome, setOutcome] = useState("completed");
  const [work, setWork] = useState("");
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState("");
  const [extStatus, setExtStatus] = useState("confirmed");
  const [extRef, setExtRef] = useState("");
  const [extNote, setExtNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const needsCheckout = checkinRequired && visit.external_checkout_status === "pending";
  return (
    <Modal open={open} onClose={onClose} title={`Check out — visit ${visit.visit_number}`}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Outcome</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setOutcome(k)} className={cx("rounded-lg border-2 p-3 text-sm font-semibold", outcome === k ? "border-primary bg-primary/10" : "border-slate-200 dark:border-slate-700")}>{v}</button>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 space-y-3">
        <Field label={outcome === "completed" ? "Work performed (required)" : "What you did / found"}><Textarea value={work} onChange={(e) => setWork(e.target.value)} placeholder="Replaced flapper and wax ring; tested 10 flushes; no leaks." /></Field>
        {outcome === "parts_needed" ? <Field label="Parts needed (required)"><Textarea value={parts} onChange={(e) => setParts(e.target.value)} /></Field> : null}
        <Field label="Notes for the office"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field>
        {needsCheckout ? (
          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-medium">Customer check-out</p>
            <Select className="mt-2" value={extStatus} onChange={(e) => setExtStatus(e.target.value)}>
              <option value="confirmed">Confirmed</option><option value="failed">Did not work</option><option value="exception">Exception</option><option value="not_required">Not required for this visit</option>
            </Select>
            <Input className="mt-2" placeholder="Confirmation / reference" value={extRef} onChange={(e) => setExtRef(e.target.value)} />
            {extStatus === "failed" || extStatus === "exception" ? <Textarea className="mt-2" placeholder="What happened? (required)" value={extNote} onChange={(e) => setExtNote(e.target.value)} /> : null}
          </div>
        ) : null}
        {outcome === "completed" ? <p className="text-xs text-slate-500">Add “after” photos before checking out — the completion package needs them.</p> : null}
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4 w-full" size="lg" tone="success" busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSubmit({ outcome, work_performed: work, notes, parts_needed: parts }, needsCheckout ? { status: extStatus, reference: extRef, note: extNote } : undefined);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}>
        Check out
      </Button>
    </Modal>
  );
}

function StartVisitModal({ open, onClose, bundle, team, onDone }: { open: boolean; onClose: () => void; bundle: JobBundle; team: CUser[]; onDone: () => void }) {
  const { user, isOffice } = useSession();
  const [tech, setTech] = useState<string>(String(user.id));
  const [sameTrip, setSameTrip] = useState("");
  const [when_, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const openTrips = bundle.visits.filter((v) => ["en_route", "on_site"].includes(v.status));
  return (
    <Modal open={open} onClose={onClose} title={bundle.visits.length ? "Start a return visit" : "Start a visit"}>
      {bundle.visits.length ? <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Earlier visits stay on the job’s history.</p> : null}
      <div className="space-y-3">
        {isOffice ? (
          <Field label="Technician">
            <Select value={tech} onChange={(e) => setTech(e.target.value)}>
              {team.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role}){u.invited ? " — invite pending" : ""}</option>)}
            </Select>
          </Field>
        ) : null}
        {openTrips.length ? (
          <Field label="Joining a technician already on this job?">
            <Select value={sameTrip} onChange={(e) => setSameTrip(e.target.value)}>
              <option value="">No — this is a new trip</option>
              {openTrips.map((v) => <option key={v.id} value={v.id}>Yes — same trip as visit {v.visit_number} ({v.technician_name})</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Scheduled for (optional)"><Input type="datetime-local" value={when_} onChange={(e) => setWhen(e.target.value)} /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      <Button className="mt-4 w-full" size="lg" busy={busy}
        onClick={async () => {
          if (!navigator.onLine) return setError(new Error("Starting a visit needs signal. You can check in offline once it is started."));
          setBusy(true);
          setError(null);
          try {
            await api.post(`/jobs/${bundle.job.id}/visits`, { technician_user_id: Number(tech), same_trip_as: sameTrip ? Number(sameTrip) : undefined, scheduled_for: when_ ? new Date(when_).toISOString() : undefined });
            onDone();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}>
        Start visit
      </Button>
    </Modal>
  );
}
