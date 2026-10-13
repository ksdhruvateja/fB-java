import { useState, type FormEvent } from "react";
import { CheckCircle2, Clock, HardHat, Home, Loader2, Mail, Newspaper } from "lucide-react";
import { brand } from "../../config/brand";
import NeedHelpButton from "../NeedHelpButton";
import { PageHero } from "./PublicLayout";

export const CONTACT_CATEGORIES = [
  "General Support",
  "Homeowner Assistance",
  "Contractor Partnerships",
  "Business Inquiries",
  "Press & Media",
] as const;

type Fields = { name: string; email: string; phone: string; category: string; subject: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Enter your name.";
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (f.phone.trim() && !/^[0-9+().\-\s]{7,40}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number or leave it blank.";
  if (!(CONTACT_CATEGORIES as readonly string[]).includes(f.category)) e.category = "Choose an inquiry type.";
  if (f.subject.trim().length < 3) e.subject = "Enter a short subject.";
  if (f.message.trim().length < 10) e.message = "Tell us a little more (at least 10 characters).";
  return e;
}

export default function ContactPage({
  initialCategory,
  user,
  authToken,
}: {
  initialCategory?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  authToken?: string | null;
}) {
  const [fields, setFields] = useState<Fields>({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    category: initialCategory && (CONTACT_CATEGORIES as readonly string[]).includes(initialCategory) ? initialCategory : "",
    subject: "",
    message: "",
  });
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(fields);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Please check the highlighted fields.");
      document.getElementById(`contact-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setStatus("sending");
    setFormError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ ...fields, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; ticketNumber?: string | null; message?: string; errors?: Errors };
      if (!res.ok || !data.ok) {
        if (data.errors) setErrors(data.errors);
        setFormError(data.message || "We could not send your message. Please try again.");
        setStatus("error");
        return;
      }
      setTicketNumber(data.ticketNumber || null);
      setStatus("sent");
    } catch {
      setFormError(`We could not reach FixBridge. Check your connection, or email ${brand.supportEmail}.`);
      setStatus("error");
    }
  };

  const input =
    "w-full border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary aria-[invalid=true]:border-red-500";

  const field = (key: keyof Fields, label: string, el: React.ReactNode, hint?: string) => (
    <div className="grid gap-1.5">
      <label htmlFor={`contact-${key}`} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {el}
      {errors[key] ? (
        <p id={`contact-${key}-error`} className="text-xs text-red-600 dark:text-red-400">
          {errors[key]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  const aria = (key: keyof Fields) => ({
    id: `contact-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `contact-${key}-error` : undefined,
  });

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={<>How can we <span className="text-primary">help?</span></>}
        intro="Send us a message and the FixBridge team will reply by email. For help with an existing request, signed-in homeowners can also use Help & Support in their dashboard."
      />
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {status === "sent" ? (
            <div role="status" className="flex flex-col items-start gap-3 border border-border bg-card p-8">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
              <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">Message received</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Thanks, {fields.name.split(" ")[0] || "there"}. We will reply to <strong className="text-foreground">{fields.email}</strong>.
                {ticketNumber ? (
                  <>
                    {" "}Your reference number is <strong className="text-foreground">{ticketNumber}</strong>.
                  </>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFields((f) => ({ ...f, subject: "", message: "" }));
                  setStatus("idle");
                  setTicketNumber(null);
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="grid gap-5 border border-border bg-card p-5 sm:p-8" aria-describedby={formError ? "contact-form-error" : undefined}>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("name", "Name", <input {...aria("name")} className={input} autoComplete="name" value={fields.name} onChange={(e) => set("name")(e.target.value)} maxLength={120} required />)}
                {field("email", "Email", <input {...aria("email")} className={input} type="email" autoComplete="email" value={fields.email} onChange={(e) => set("email")(e.target.value)} maxLength={200} required />)}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("phone", "Phone (optional)", <input {...aria("phone")} className={input} type="tel" autoComplete="tel" value={fields.phone} onChange={(e) => set("phone")(e.target.value)} maxLength={40} />)}
                {field(
                  "category",
                  "Inquiry type",
                  <select {...aria("category")} className={input} value={fields.category} onChange={(e) => set("category")(e.target.value)} required>
                    <option value="">Choose one…</option>
                    {CONTACT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {field("subject", "Subject", <input {...aria("subject")} className={input} value={fields.subject} onChange={(e) => set("subject")(e.target.value)} maxLength={200} required />)}
              {field(
                "message",
                "Message",
                <textarea {...aria("message")} className={`${input} min-h-36`} value={fields.message} onChange={(e) => set("message")(e.target.value)} maxLength={5000} rows={6} required />,
                "Please don’t include payment card numbers or passwords."
              )}
              {/* Honeypot for bots: hidden from people and assistive technology. */}
              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
                </label>
              </div>
              {formError ? (
                <p id="contact-form-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {formError}
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  By sending, you agree that FixBridge may use these details to respond to your inquiry.
                </p>
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="inline-flex items-center justify-center gap-2 bg-primary px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-primary/90 disabled:opacity-70 [font-family:'Barlow_Condensed',sans-serif]"
                >
                  {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {status === "sending" ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="grid content-start gap-3">
          {[
            { icon: <Home size={18} aria-hidden />, title: "Homeowner Assistance", body: "Questions about a request, a quote or your HomeCare Pro plan." },
            { icon: <HardHat size={18} aria-hidden />, title: "Contractor Partnerships", body: "Joining the network or questions about jobs and payouts." },
            { icon: <Newspaper size={18} aria-hidden />, title: "Press & Media", body: "Interviews, information and media requests." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 border border-border p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                <span className="block text-sm text-muted-foreground">{item.body}</span>
              </span>
            </div>
          ))}
          <div className="grid gap-3 border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Mail size={16} className="text-primary" aria-hidden />
              <a href={`mailto:${brand.supportEmail}`} className="font-medium underline">{brand.supportEmail}</a>
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              Messages are answered by email. For safety emergencies, contact emergency services or your utility first.
            </p>
            <NeedHelpButton variant="button" label="Chat with us" />
          </div>
        </aside>
      </section>
    </>
  );
}
