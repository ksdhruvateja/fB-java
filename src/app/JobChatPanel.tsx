/**
 * JobChatPanel — reusable chat component used by Homeowner, Contractor, and Admin.
 *
 * Features:
 * - Collapsed preview showing last 3 messages
 * - "Open Conversation" modal with full history
 * - Image attachment (upload + preview inline)
 * - System message styling (status updates, auto-messages)
 * - Read-only mode for Admin
 * - Real-time updates via localStorage events
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, ImagePlus, X, Maximize2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import {
  addJobMessage,
  getJobMessages,
  CHAT_BROADCAST_EVENT,
  type JobChatMessage,
} from "./jobChat";

type Role = "homeowner" | "contractor" | "admin";

interface Props {
  jobId: number;
  jobTitle?: string;
  myRole: Role;
  myName: string;
  placeholder?: string;
  readOnly?: boolean;       // admin view — no input shown
  defaultOpen?: boolean;    // open modal immediately
}

function formatTime(iso: string) {
  try {
    return format(new Date(iso), "MMM d, h:mm a");
  } catch {
    return "";
  }
}

function MessageBubble({ msg, myRole }: { msg: JobChatMessage; myRole: Role }) {
  const isSystem = msg.senderRole === "system";
  const isMine = !isSystem && msg.senderRole === myRole;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 border border-border px-3 py-1">
          {msg.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} mb-3`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
        {msg.senderName}
        {msg.createdAt && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground/60">
            {formatTime(msg.createdAt)}
          </span>
        )}
      </span>
      <div
        className={`max-w-[80%] px-3 py-2 border text-sm ${
          isMine
            ? "bg-primary/10 border-primary/30 text-foreground"
            : "bg-muted/40 border-border text-foreground"
        }`}
      >
        {msg.imageDataUrl && (
          <img
            src={msg.imageDataUrl}
            alt="Attached image"
            className="mb-2 max-h-48 w-full object-cover border border-border/50 cursor-pointer"
            onClick={() => window.open(msg.imageDataUrl, "_blank")}
            title="Click to open full size"
          />
        )}
        {msg.text && <p className="leading-relaxed">{msg.text}</p>}
      </div>
    </div>
  );
}

// ─── Chat Input Row ──────────────────────────────────────────────────────────

function ChatInput({
  jobId,
  myRole,
  myName,
  placeholder,
  onSent,
}: {
  jobId: number;
  myRole: "homeowner" | "contractor";
  myName: string;
  placeholder: string;
  onSent: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    if (!text.trim() && !imageDataUrl) return;
    addJobMessage(jobId, {
      senderRole: myRole,
      senderName: myName,
      text: text.trim(),
      ...(imageDataUrl ? { imageDataUrl } : {}),
    });
    setText("");
    setImageDataUrl(null);
    setImageName(null);
    onSent();
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      {imageDataUrl && (
        <div className="relative inline-block">
          <img src={imageDataUrl} alt="preview" className="h-20 w-auto object-cover border border-border" />
          <button
            type="button"
            onClick={() => { setImageDataUrl(null); setImageName(null); }}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
          >
            <X size={10} />
          </button>
          {imageName && <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate max-w-[12rem]">{imageName}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex-none w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          title="Attach image"
        >
          <ImagePlus size={14} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={placeholder}
          className="flex-1 border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 transition-colors"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() && !imageDataUrl}
          className={`flex-none w-8 h-8 flex items-center justify-center transition-colors ${
            text.trim() || imageDataUrl
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-primary/30 text-white/60 cursor-not-allowed"
          }`}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Full Conversation Modal ──────────────────────────────────────────────────

function ConversationModal({
  jobId,
  jobTitle,
  myRole,
  myName,
  placeholder,
  readOnly,
  onClose,
}: {
  jobId: number;
  jobTitle?: string;
  myRole: Role;
  myName: string;
  placeholder: string;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<JobChatMessage[]>(() => getJobMessages(jobId));
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = () => setMessages(getJobMessages(jobId));

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CHAT_BROADCAST_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHAT_BROADCAST_EVENT, refresh);
    };
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-lg bg-background border border-border flex flex-col"
        style={{ height: "min(640px, 90vh)" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-widest uppercase text-primary mb-0.5">Job Chat</p>
            <p className="text-sm font-medium text-foreground truncate">{jobTitle ?? `Job #${jobId}`}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors ml-3 shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare size={28} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No messages yet.</p>
              {!readOnly && (
                <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">
                  Send the first message below.
                </p>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} myRole={myRole} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!readOnly && myRole !== "admin" && (
          <div className="px-4 pb-4 shrink-0">
            <ChatInput
              jobId={jobId}
              myRole={myRole as "homeowner" | "contractor"}
              myName={myName}
              placeholder={placeholder}
              onSent={refresh}
            />
          </div>
        )}
        {readOnly && (
          <div className="px-4 py-3 border-t border-border bg-muted/30 shrink-0">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider text-center">
              Admin view — read only
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Collapsed Preview ───────────────────────────────────────────────────────

export default function JobChatPanel({
  jobId,
  jobTitle,
  myRole,
  myName,
  placeholder = "Type a message…",
  readOnly = false,
  defaultOpen = false,
}: Props) {
  const [messages, setMessages] = useState<JobChatMessage[]>(() => getJobMessages(jobId));
  const [modalOpen, setModalOpen] = useState(defaultOpen);

  const refresh = () => setMessages(getJobMessages(jobId));

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CHAT_BROADCAST_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHAT_BROADCAST_EVENT, refresh);
    };
  }, [jobId]);

  const preview = messages.filter((m) => m.senderRole !== "system").slice(-3);
  const nonSystemCount = messages.filter((m) => m.senderRole !== "system").length;

  return (
    <>
      <div className="mt-4 border-t border-border pt-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Job Chat
            {nonSystemCount > 0 && (
              <span className="ml-2 text-primary">{nonSystemCount} message{nonSystemCount !== 1 ? "s" : ""}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-primary border border-primary/30 px-2 py-1 hover:bg-primary hover:text-white transition-all"
          >
            <Maximize2 size={10} />
            {nonSystemCount === 0 ? "Open Chat" : "View All"}
          </button>
        </div>

        {/* Collapsed preview */}
        <div className="border border-border bg-background divide-y divide-border/50">
          {preview.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">
              {readOnly ? "No messages." : "No messages yet — start the conversation."}
            </p>
          ) : (
            preview.map((msg) => (
              <div
                key={msg.id}
                className={`px-3 py-2 text-xs ${
                  msg.senderRole === myRole
                    ? "bg-primary/5"
                    : "bg-transparent"
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-2">
                  {msg.senderName}
                </span>
                {msg.imageDataUrl && (
                  <span className="inline-flex items-center gap-1 text-primary mr-1">
                    <ImagePlus size={10} />
                    [image]
                  </span>
                )}
                <span className="text-foreground">{msg.text || ""}</span>
              </div>
            ))
          )}
          {messages.length > 3 && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full text-xs text-center py-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              + {messages.length - 3} older message{messages.length - 3 !== 1 ? "s" : ""}
            </button>
          )}
        </div>

        {/* Inline quick send (non-admin, collapsed) */}
        {!readOnly && myRole !== "admin" && (
          <div className="mt-2">
            <ChatInput
              jobId={jobId}
              myRole={myRole as "homeowner" | "contractor"}
              myName={myName}
              placeholder={placeholder}
              onSent={refresh}
            />
          </div>
        )}
      </div>

      {/* Full modal */}
      <AnimatePresence>
        {modalOpen && (
          <ConversationModal
            jobId={jobId}
            jobTitle={jobTitle}
            myRole={myRole}
            myName={myName}
            placeholder={placeholder}
            readOnly={readOnly || myRole === "admin"}
            onClose={() => setModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
