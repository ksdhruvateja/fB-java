import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Plus, Send, X } from "lucide-react";
import { useIsMobile } from "./components/ui/use-mobile";
import {
  createConversation,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  readFileAsAttachment,
  sendMessage,
  type AttachmentInput,
  type Conversation,
  type ThreadMessage,
} from "./messagingApi";
import { formatRelativeTime } from "./notificationsApi";
import { getStoredToken } from "./auth";

type Role = "homeowner" | "contractor" | "admin";

const ADMIN_FILTERS = [
  { id: "all", label: "All" },
  { id: "homeowners", label: "Homeowners" },
  { id: "contractors", label: "Contractors" },
  { id: "unread", label: "Unread" },
  { id: "job", label: "Job-related" },
];

function AttachmentPreview({ att }: { att: ThreadMessage["attachments"][0] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!att.isImage) return;
    let cancelled = false;
    const token = getStoredToken();
    void fetch(att.downloadUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((b) => {
        if (!cancelled) setSrc(URL.createObjectURL(b));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (src) URL.revokeObjectURL(src);
    };
  }, [att.downloadUrl, att.isImage]);

  if (att.isImage && src) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        <img src={src} alt={att.fileName} className="max-h-40 rounded-lg border border-border object-cover" />
      </a>
    );
  }
  if (att.isPdf || !att.isImage) {
    return (
      <a
        href={att.downloadUrl}
        onClick={(e) => {
          e.preventDefault();
          const token = getStoredToken();
          void fetch(att.downloadUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
            .then((r) => r.blob())
            .then((b) => {
              const url = URL.createObjectURL(b);
              window.open(url, "_blank");
            });
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium"
      >
        <FileText className="h-4 w-4" />
        {att.fileName}
      </a>
    );
  }
  return null;
}

export default function MessagesPanel({
  role,
  initialConversationId,
  startWith,
  onUnreadChange,
}: {
  role: Role;
  initialConversationId?: number | null;
  startWith?: { homeownerUserId?: number; contractorUserId?: number; jobId?: number; subject?: string };
  onUnreadChange?: () => void;
}) {
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialConversationId || null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMobileThread, setShowMobileThread] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendLockRef = useRef(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetchConversations(filter, search);
      setConversations(r.conversations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, [filter, search]);

  const loadThread = useCallback(async (id: number) => {
    setLoadingThread(true);
    setError(null);
    try {
      const r = await fetchConversation(id);
      setActiveConv(r.conversation);
      setMessages(r.messages || []);
      await markConversationRead(id);
      onUnreadChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation.");
    } finally {
      setLoadingThread(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedId(initialConversationId);
      if (isMobile) setShowMobileThread(true);
    }
  }, [initialConversationId, isMobile]);

  useEffect(() => {
    if (!startWith) return;
    void (async () => {
      try {
        const r = await createConversation({
          subject: startWith.subject,
          jobId: startWith.jobId,
          homeownerUserId: startWith.homeownerUserId,
          contractorUserId: startWith.contractorUserId,
        });
        setSelectedId(r.conversation.id);
        if (isMobile) setShowMobileThread(true);
        await loadList();
      } catch {
        /* may already exist — user can pick from list */
      }
    })();
  }, [startWith, isMobile, loadList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = (id: number) => {
    setSelectedId(id);
    if (isMobile) setShowMobileThread(true);
  };

  const handleSend = async () => {
    if (!selectedId || sendLockRef.current) return;
    const text = body.trim();
    if (!text && pendingAttachments.length === 0) return;
    sendLockRef.current = true;
    setSending(true);
    setError(null);
    const draftBody = body;
    const draftAtts = [...pendingAttachments];
    setBody("");
    setPendingAttachments([]);
    try {
      const key = `msg-${selectedId}-${Date.now()}`;
      await sendMessage(selectedId, draftBody, draftAtts, key);
      await loadThread(selectedId);
      await loadList();
    } catch (e) {
      setBody(draftBody);
      setPendingAttachments(draftAtts);
      setError(e instanceof Error ? e.message : "Message couldn't be sent. Try again.");
    } finally {
      setSending(false);
      sendLockRef.current = false;
    }
  };

  const startNew = async () => {
    try {
      const r = await createConversation({ subject: "Message FixBridge Support" });
      setSelectedId(r.conversation.id);
      if (isMobile) setShowMobileThread(true);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start conversation.");
    }
  };

  const listPane = (
    <div className={`flex flex-col ${isMobile && showMobileThread ? "hidden" : "flex"} min-h-0`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversations</p>
        {role !== "admin" ? (
          <button type="button" onClick={() => void startNew()} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        ) : null}
      </div>
      {role === "admin" ? (
        <div className="space-y-2 border-b border-border p-2">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search name, job #, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {ADMIN_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  filter === f.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {loadingList ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : conversations.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <p>No messages yet.</p>
          {role !== "admin" ? (
            <button type="button" className="mt-3 font-semibold text-primary" onClick={() => void startNew()}>
              Message FixBridge Support
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-3 text-left hover:bg-muted/40 ${
                  selectedId === c.id ? "bg-muted/60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{c.counterpartyName || "FixBridge Support"}</p>
                  {c.unreadCount > 0 ? (
                    <span className="rounded-full bg-[#FF4D1C] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  ) : null}
                </div>
                {c.jobLabel ? <p className="text-xs text-primary">{c.jobLabel}</p> : null}
                {c.subject ? <p className="truncate text-xs text-muted-foreground">{c.subject}</p> : null}
                {c.lastMessagePreview ? (
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</p>
                ) : null}
                {c.lastMessageAt ? (
                  <p className="text-[10px] text-muted-foreground">{formatRelativeTime(c.lastMessageAt)}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const threadPane = (
    <div className={`flex min-h-0 flex-1 flex-col ${isMobile && !showMobileThread ? "hidden" : "flex"}`}>
      {selectedId && activeConv ? (
        <>
          <div className="flex items-center gap-2 border-b border-border px-3 py-3">
            {isMobile ? (
              <button type="button" onClick={() => setShowMobileThread(false)} className="text-sm font-semibold text-primary">
                ← Back
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{activeConv.counterpartyName || "FixBridge Support"}</p>
              {activeConv.jobLabel ? <p className="text-xs text-primary">Job {activeConv.jobLabel}</p> : null}
              {activeConv.subject ? <p className="truncate text-xs text-muted-foreground">{activeConv.subject}</p> : null}
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {loadingThread ? (
              <p className="text-sm text-muted-foreground">Loading messages…</p>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole === role;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        mine ? "bg-primary text-white" : "bg-muted"
                      }`}
                    >
                      {!mine && m.senderDisplayName ? (
                        <p className="mb-1 text-[10px] font-semibold opacity-80">{m.senderDisplayName}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      {m.attachments?.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {m.attachments.map((a) => (
                            <AttachmentPreview key={a.id} att={a} />
                          ))}
                        </div>
                      ) : null}
                      <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                        {formatRelativeTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
          {error ? <p className="px-3 text-xs text-red-700">{error}</p> : null}
          {pendingAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3">
              {pendingAttachments.map((a, i) => (
                <span key={`${a.fileName}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                  {a.fileName}
                  <button type="button" onClick={() => setPendingAttachments((p) => p.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  void (async () => {
                    const next: AttachmentInput[] = [];
                    for (const f of files.slice(0, 5 - pendingAttachments.length)) {
                      try {
                        next.push(await readFileAsAttachment(f));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Invalid file.");
                      }
                    }
                    if (next.length) setPendingAttachments((p) => [...p, ...next].slice(0, 5));
                  })();
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="rounded-xl border border-border p-2.5"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Type a message…"
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="button"
                disabled={sending || (!body.trim() && pendingAttachments.length === 0)}
                onClick={() => void handleSend()}
                className="rounded-xl bg-primary p-2.5 text-white disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Select a conversation to view messages.
        </div>
      )}
    </div>
  );

  return (
    <section className="mx-auto flex h-[min(72vh,720px)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black uppercase">Messages</h1>
        <p className="text-xs text-muted-foreground">
          {role === "admin" ? "Homeowner and contractor communications" : "Chat with FixBridge Support"}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(240px,34%)_1fr]">
        {listPane}
        {threadPane}
      </div>
    </section>
  );
}
