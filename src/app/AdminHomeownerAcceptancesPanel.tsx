import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { listAdminHomeownerAcceptances } from "./homeownerConsentApi";

export default function AdminHomeownerAcceptancesPanel({
  jobId,
  userId,
}: {
  jobId?: number;
  userId?: number;
}) {
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof listAdminHomeownerAcceptances>>["acceptances"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listAdminHomeownerAcceptances({ jobId, userId, limit: 100 }).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.message || "Could not load acceptance history.");
        return;
      }
      setRows(r.acceptances || []);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, userId]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading consent history…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 py-2">{error}</p>;
  }

  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground py-2">No acceptance records found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Document</th>
            <th className="px-3 py-2 font-semibold">Version</th>
            <th className="px-3 py-2 font-semibold">Homeowner</th>
            <th className="px-3 py-2 font-semibold">Related</th>
            <th className="px-3 py-2 font-semibold">Accepted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono">{row.acceptanceType}</td>
              <td className="px-3 py-2">{row.documentTitle || row.documentKey || "—"}</td>
              <td className="px-3 py-2 tabular-nums">{row.documentVersion || "—"}</td>
              <td className="px-3 py-2">
                <div>{row.userName || `User #${row.userId}`}</div>
                {row.userEmail ? (
                  <div className="text-muted-foreground">{row.userEmail}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.jobId ? `Job ${row.jobId}` : "—"}
                {row.quoteId ? ` · Quote ${row.quoteId}` : ""}
                {row.changeOrderId ? ` · CO ${row.changeOrderId}` : ""}
                {row.paymentId ? ` · Pay ${row.paymentId}` : ""}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.acceptedAt ? new Date(row.acceptedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
