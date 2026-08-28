import type { AuthUser } from "./auth";
import { applicationFromUser, type ContractorApplication } from "./contractorApplication";
import { getStoredToken } from "./auth";

export function contractorSearchBlob(c: AuthUser): string {
  const app = (c.contractorApplication || {}) as Record<string, unknown>;
  return [
    c.name,
    c.email,
    c.trade,
    c.companyName,
    c.phone,
    c.contactEmail,
    c.address,
    c.licenseNumber,
    c.companyDetails,
    c.insuranceDetails,
    Array.isArray(c.serviceZips) ? c.serviceZips.join(" ") : "",
    app.legalBusinessName,
    app.dbaTradeName,
    app.ein,
    app.businessType,
    app.unionStatus,
    app.diversityClassifications,
    app.contactName,
    app.contactPhone,
    app.contactEmail,
    app.companyPhone,
    app.companyEmail,
    Array.isArray(app.primaryServices) ? app.primaryServices.join(" ") : "",
    Array.isArray(app.serviceStates) ? app.serviceStates.join(" ") : "",
    app.serviceZips,
    app.licenseNumber,
    app.website,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function fetchAdminUser(userId: number | string): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok || !data.user) return null;
    return data.user as AuthUser;
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value?: string | number | null | boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{display}</span>
    </div>
  );
}

export function ContractorApplicationAdminView({
  user,
  onViewDocument,
}: {
  user: AuthUser;
  onViewDocument: (name: string, data?: string) => void;
}) {
  const app: ContractorApplication = applicationFromUser(user);
  const docs = [
    { label: "License", name: user.licenseDocumentName, data: user.licenseDocumentData },
    { label: "Insurance / COI", name: user.insuranceDocumentName, data: user.insuranceDocumentData },
    { label: "Government ID", name: user.idDocumentName, data: user.idDocumentData },
    { label: "W-9", name: user.w9DocumentName, data: user.w9DocumentData },
    { label: "Business Registration", name: user.businessRegistrationName, data: user.businessRegistrationData },
    { label: "Business License", name: user.businessLicenseName, data: user.businessLicenseData },
  ].filter((d) => d.name);

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
          <Row label="Legal name" value={app.legalBusinessName || user.companyName} />
          <Row label="DBA" value={app.dbaTradeName} />
          <Row label="Entity" value={app.businessType} />
          <Row label="Tax ID type" value={app.taxIdType?.toUpperCase()} />
          <Row label="Tax ID" value={app.ein} />
          <Row label="Years in business" value={app.yearsInBusiness} />
          <Row label="Union status" value={app.unionStatus} />
          <Row label="Diversity" value={app.diversityClassifications} />
          <Row label="Website" value={app.website} />
        </div>
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact & address</p>
          <Row label="Contact" value={app.contactName || user.name} />
          <Row label="Title" value={app.contactTitle} />
          <Row label="Email" value={app.contactEmail || user.contactEmail || user.email} />
          <Row label="Phone" value={`${app.contactPhone || user.phone || ""}${app.contactPhoneType ? ` (${app.contactPhoneType})` : ""}`} />
          <Row
            label="Address"
            value={[app.businessAddress, app.businessSuite, app.businessCity, app.businessState, app.businessZip]
              .filter(Boolean)
              .join(", ") || user.address}
          />
          <Row
            label="USPS address"
            value={user.addressVerified ? "USPS verified ✓" : "Address not verified"}
          />
        </div>
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trades & area</p>
          <Row label="Trades" value={(app.primaryServices || []).join(", ") || user.trade} />
          <Row label="ZIPs" value={app.serviceZips || (Array.isArray(user.serviceZips) ? user.serviceZips.join(", ") : "")} />
          <Row label="Radius (mi)" value={app.maxServiceRadius || user.travelRadiusMiles} />
          <Row label="Available days" value={app.availableDays} />
          <Row label="Emergency avail." value={app.emergencyAvailability} />
          <Row label="Services note" value={app.servicesDescription} />
        </div>
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">License, insurance & pricing</p>
          <Row label="License #" value={app.licenseNumber || user.licenseNumber} />
          <Row label="License state" value={app.licenseState} />
          <Row label="License exp." value={app.licenseExpiration || user.licenseExpiresAt} />
          <Row label="GL insurance" value={app.generalLiability} />
          <Row label="Coverage" value={app.coverageAmount} />
          <Row label="Insurance exp." value={app.insuranceExpiration || user.insuranceExpiresAt} />
          <Row label="Workers' comp" value={app.workersComp} />
          <Row label="Facility years" value={app.facilityYears} />
          <Row label="Commercial exp." value={app.commercialExperience} />
          <Row label="Hourly rate" value={app.standardHourlyRate || user.minimumLaborFee} />
          <Row label="Emergency rate" value={app.emergencyHourlyRate || user.emergencyVisitFee} />
          <Row label="Trip fee" value={app.tripFee || user.visitFee} />
          <Row label="Material markup %" value={app.materialMarkup} />
          <Row label="Min charge" value={app.minimumServiceCharge} />
          <Row label="Background checks" value={app.backgroundChecks} />
          <Row label="Safety / certs" value={[app.safetyTraining, app.certifications].filter(Boolean).join(" · ")} />
        </div>
      </div>

      {(app.previousClients || app.referenceContacts) && (
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">References</p>
          <Row label="Previous clients" value={app.previousClients} />
          <Row label="Reference contacts" value={app.referenceContacts} />
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Documents</p>
        {docs.length === 0 ? (
          <p className="text-xs text-amber-600">No verification files uploaded</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => onViewDocument(d.name!, d.data)}
                className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-xs transition hover:bg-muted-foreground/10"
              >
                {d.label}
                {d.name ? ` · ${d.name}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
