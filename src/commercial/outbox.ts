/**
 * Offline outbox for field actions (On my way, Check in, Check out, notes, photos). When the phone
 * has no signal the action is kept with the time it happened and sent when the connection returns.
 * Each action carries a client id so the server records it once even if it is sent twice.
 */
import { NetworkError, api } from "./api";

const KEY = "fixbridge-commercial-outbox";

export interface OutboxItem {
  id: string;
  path: string;
  body: Record<string, unknown>;
  label: string;
  queued_at: string;
  last_error?: string;
}

function load(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function save(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable */
  }
  window.dispatchEvent(new Event("commercial-outbox"));
}

export const outbox = {
  items: load,
  count: () => load().length,
};

const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Sends a field action now, or queues it if offline. Returns the server response, or
 * { queued: true } when it was saved for later.
 */
export async function sendFieldAction(path: string, body: Record<string, unknown>, label: string) {
  const item: OutboxItem = {
    id: newId(),
    path,
    body: { ...body, client_action_id: body.client_action_id || newId(), occurred_at: body.occurred_at || new Date().toISOString() },
    label,
    queued_at: new Date().toISOString(),
  };
  if (!navigator.onLine) {
    save([...load(), item]);
    return { queued: true };
  }
  try {
    return await api.post(path, item.body);
  } catch (e) {
    if (e instanceof NetworkError) {
      save([...load(), item]);
      return { queued: true };
    }
    throw e;
  }
}

let flushing = false;
/** Sends queued actions in order. Stops at the first one that still cannot reach the server. */
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let items = load();
    while (items.length) {
      const [next, ...rest] = items;
      try {
        await api.post(next.path, next.body);
        items = rest;
        save(items);
      } catch (e) {
        if (e instanceof NetworkError) break;
        // The server refused it (e.g. already checked out from another phone): keep it visible with the reason.
        items = [...rest, { ...next, last_error: e instanceof Error ? e.message : String(e) }];
        save(items);
        if (items.every((i) => i.last_error)) break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function discardOutboxItem(id: string) {
  save(load().filter((i) => i.id !== id));
}

let installed = false;
export function installOutboxSync() {
  if (installed) return;
  installed = true;
  window.addEventListener("online", () => void flushOutbox());
  setInterval(() => void flushOutbox(), 30_000);
  void flushOutbox();
}
