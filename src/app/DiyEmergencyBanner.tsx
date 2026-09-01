import { emergencyBannerCopy } from "./diySafetyCopy";

export default function DiyEmergencyBanner() {
  const copy = emergencyBannerCopy();
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-600/40 bg-red-600/10 p-4 text-red-950 dark:text-red-50"
    >
      <p className="text-sm font-bold uppercase tracking-wide">{copy.title}</p>
      <p className="mt-2 text-sm leading-relaxed">{copy.body}</p>
    </div>
  );
}
