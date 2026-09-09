/** Provider communication guidance for FixBridge-Managed jobs — contractor-facing only. */

export const MANAGED_PRICING_GUIDANCE = [
  {
    question: "How much will this cost?",
    response:
      "FixBridge handles pricing and approvals. I'll send my diagnosis and scope through FixBridge, and you'll receive the price there.",
  },
  {
    question: "How much are you charging FixBridge?",
    response:
      "My contractor pricing is handled directly with FixBridge. They'll provide your approved customer price.",
  },
  {
    question: "Can I pay you directly?",
    response:
      "For this FixBridge job, payment has to stay through FixBridge so the job, approval and warranty record stay protected.",
  },
  {
    question: "Can you do extra work?",
    response:
      "I can document it and submit a change request. FixBridge will send you the additional price for approval before I do the extra work.",
  },
] as const;

export default function ManagedPricingGuidance({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-muted/20 space-y-2 ${compact ? "p-3" : "p-4"}`}>
      <p className={`font-semibold text-foreground ${compact ? "text-xs" : "text-sm"}`}>
        Managed job pricing — what to say to customers
      </p>
      <p className={`text-muted-foreground ${compact ? "text-[11px]" : "text-xs"}`}>
        For FixBridge-Managed jobs, discuss the work — not customer pricing. Use these responses when asked:
      </p>
      <ul className={`space-y-2 ${compact ? "text-[11px]" : "text-xs"}`}>
        {MANAGED_PRICING_GUIDANCE.map((item) => (
          <li key={item.question} className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="font-medium text-foreground">{item.question}</p>
            <p className="mt-0.5 text-muted-foreground italic">&ldquo;{item.response}&rdquo;</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
