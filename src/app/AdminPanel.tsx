import { useMemo } from "react";
import { ArrowLeft, FileText, LogOut, ShieldCheck } from "lucide-react";
import { getStoredUsers } from "./auth";

export default function AdminPanel({
  onBack,
  onSignOut,
}: {
  onBack: () => void;
  onSignOut: () => void;
}) {
  const contractorUsers = useMemo(
    () => getStoredUsers().filter((user) => user.role === "contractor"),
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="min-h-16 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-0 bg-card">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase mb-2">
            Admin Panel
          </p>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl sm:text-4xl lg:text-5xl leading-[0.9] mb-3">
            Contractor Applications
          </h1>
          <p className="text-sm text-muted-foreground">
            Review submitted contractor details and uploaded document names.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {contractorUsers.map((contractor) => (
            <div key={`${contractor.email}-${contractor.role}`} className="border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{contractor.name}</h2>
                  <p className="font-mono text-[11px] text-muted-foreground">{contractor.email}</p>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-primary border border-primary/30 bg-primary/5 px-2 py-1">
                  {contractor.trade || "Trade not set"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-sm">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-1">
                    License Number
                  </p>
                  <p>{contractor.licenseNumber || "N/A"}</p>
                </div>
                <div className="text-sm">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-1">
                    Verification
                  </p>
                  <p className="inline-flex items-center gap-1 text-green-700">
                    <ShieldCheck size={14} />
                    Submitted
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">
                  Uploaded Documents
                </p>
                <ul className="space-y-2 text-sm">
                  {[
                    { label: "License Document", value: contractor.licenseDocumentName },
                    { label: "Insurance Document", value: contractor.insuranceDocumentName },
                    { label: "Government ID", value: contractor.idDocumentName },
                  ].map((doc) => (
                    <li key={doc.label} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 border border-border bg-background px-3 py-2">
                      <span className="text-muted-foreground">{doc.label}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <FileText size={13} className="text-primary" />
                        {doc.value || "Not uploaded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          {contractorUsers.length === 0 && (
            <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No contractor applications found.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
