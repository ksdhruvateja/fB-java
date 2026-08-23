import { useMemo, useState } from "react";
import { Loader2, Mail, Pencil, Save, X } from "lucide-react";
import type { AuthUser } from "./auth";
import ContractorApplicationForm, {
  type ContractorApplicationDocs,
} from "./ContractorApplicationForm";
import {
  applicationFromUser,
  applicationToProfileFields,
  listContractorMissingInfo,
  type ContractorApplication,
} from "./contractorApplication";
import { adminRequestContractorInfo, adminUpdateContractorProfile } from "./managedJobs";

const emptyDocs = (): ContractorApplicationDocs => ({
  w9: null,
  license: null,
  insurance: null,
  businessRegistration: null,
  businessLicense: null,
  idDoc: null,
  diversityCert: null,
});

export default function AdminContractorEditPanel({
  contractor,
  readOnly,
  onUpdated,
  onMessage,
}: {
  contractor: AuthUser;
  readOnly?: boolean;
  onUpdated: () => void | Promise<void>;
  onMessage: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [application, setApplication] = useState<ContractorApplication>(() =>
    applicationFromUser(contractor)
  );
  const [docs, setDocs] = useState<ContractorApplicationDocs>(emptyDocs);
  const [note, setNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const missing = useMemo(() => listContractorMissingInfo(contractor), [contractor]);

  const startEdit = () => {
    setApplication(applicationFromUser(contractor));
    setDocs(emptyDocs());
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!contractor.id || readOnly) return;
    setBusy(true);
    try {
      const profile = applicationToProfileFields(application);
      const payload: Record<string, unknown> = {
        name: profile.name || contractor.name,
        phone: profile.phone,
        address: profile.address,
        contactEmail: profile.contactEmail,
        companyName: profile.companyName,
        companyDetails: profile.companyDetails,
        insuranceDetails: profile.insuranceDetails,
        trade: profile.trade,
        licenseNumber: profile.licenseNumber,
        visitFee: profile.visitFee,
        emergencyVisitFee: profile.emergencyVisitFee,
        minimumLaborFee: profile.minimumLaborFee,
        serviceZips: profile.serviceZips,
        travelRadiusMiles: profile.travelRadiusMiles,
        contractorApplication: application,
      };
      if (docs.license) {
        payload.licenseDocumentName = docs.license.name;
        payload.licenseDocumentData = docs.license.data;
      }
      if (docs.insurance) {
        payload.insuranceDocumentName = docs.insurance.name;
        payload.insuranceDocumentData = docs.insurance.data;
      }
      if (docs.idDoc) {
        payload.idDocumentName = docs.idDoc.name;
        payload.idDocumentData = docs.idDoc.data;
      }
      if (docs.w9) {
        payload.w9DocumentName = docs.w9.name;
        payload.w9DocumentData = docs.w9.data;
      }
      if (docs.businessRegistration) {
        payload.businessRegistrationName = docs.businessRegistration.name;
        payload.businessRegistrationData = docs.businessRegistration.data;
      }
      if (docs.businessLicense) {
        payload.businessLicenseName = docs.businessLicense.name;
        payload.businessLicenseData = docs.businessLicense.data;
      }
      if (docs.diversityCert) {
        payload.diversityDocumentName = docs.diversityCert.name;
        payload.diversityDocumentData = docs.diversityCert.data;
      }

      const r = await adminUpdateContractorProfile(Number(contractor.id), payload);
      if (!r.ok) {
        onMessage(r.message || "Could not save contractor profile.");
        return;
      }
      onMessage(r.message || `${contractor.name} profile updated.`);
      setEditing(false);
      setDocs(emptyDocs());
      await onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const openRequest = () => {
    setSelectedItems(missing);
    setNote("");
    setRequestOpen(true);
  };

  const sendRequest = async () => {
    if (!contractor.id || readOnly) return;
    setBusy(true);
    try {
      const r = await adminRequestContractorInfo(Number(contractor.id), {
        items: selectedItems,
        message: note.trim() || undefined,
      });
      if (!r.ok) {
        onMessage(r.message || "Could not send info request.");
        return;
      }
      onMessage(r.message || "Info request sent.");
      setRequestOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">
            {missing.length} missing or expiring item{missing.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
            {missing.slice(0, 8).map((item) => (
              <li key={item}>{item}</li>
            ))}
            {missing.length > 8 ? <li>…and {missing.length - 8} more</li> : null}
          </ul>
          {!readOnly && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={openRequest}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                <Mail className="h-3.5 w-3.5" />
                Email request for information
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-700/40 bg-white/70 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-white dark:bg-background/40 dark:text-amber-100"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit details now
              </button>
            </div>
          )}
        </div>
      )}

      {!missing.length && !editing && !readOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit contractor details
          </button>
          <button
            type="button"
            onClick={openRequest}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            <Mail className="h-3.5 w-3.5" />
            Email info request
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Edit contractor application</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                type="button"
                disabled={busy || readOnly}
                onClick={() => void saveEdit()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF4D1C] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save changes
              </button>
            </div>
          </div>
          <ContractorApplicationForm
            mode="profile"
            value={application}
            onChange={setApplication}
            docs={docs}
            onDocsChange={setDocs}
            existingDocs={{
              w9: contractor.w9DocumentName,
              license: contractor.licenseDocumentName,
              insurance: contractor.insuranceDocumentName,
              businessRegistration: contractor.businessRegistrationName,
              businessLicense: contractor.businessLicenseName,
              idDoc: contractor.idDocumentName,
            }}
            accountEmail={contractor.email}
          />
        </div>
      )}

      {requestOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-lg font-bold">Request information</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email {contractor.name} ({contractor.email}) to update selected items.
                </p>
              </div>
              <button type="button" className="rounded-lg p-1.5 hover:bg-muted" onClick={() => setRequestOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {(missing.length ? missing : ["Please review and complete your contractor profile."]).map((item) => {
                const checked = selectedItems.includes(item);
                return (
                  <label key={item} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[#FF4D1C]"
                      checked={checked}
                      onChange={() =>
                        setSelectedItems((prev) =>
                          checked ? prev.filter((x) => x !== item) : [...prev, item]
                        )
                      }
                    />
                    <span>{item}</span>
                  </label>
                );
              })}
              <label className="block text-sm">
                <span className="font-medium">Optional note</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context for the contractor…"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                onClick={() => setRequestOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || readOnly || selectedItems.length === 0}
                onClick={() => void sendRequest()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
