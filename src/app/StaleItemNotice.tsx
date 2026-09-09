import { STALE_CONTENT_MESSAGE } from "./navigateFromNotification";

export default function StaleItemNotice({
  onBack,
  message = STALE_CONTENT_MESSAGE,
}: {
  onBack: () => void;
  message?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center">
      <p className="text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
      >
        Go back
      </button>
    </div>
  );
}
