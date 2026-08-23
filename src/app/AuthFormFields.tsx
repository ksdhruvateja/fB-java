import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { AuthFieldLabel } from "./AuthShell";
import { useAuthMascotOptional } from "./AuthMascotContext";

export const authFieldClass =
  "w-full rounded-2xl border border-neutral-200/90 bg-neutral-50/80 px-4 py-3.5 pl-11 text-[15px] text-foreground placeholder:text-neutral-400 outline-none transition focus:border-primary/50 focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-border dark:bg-muted/30 dark:focus:bg-background";

function wireMascotInput(
  mascot: ReturnType<typeof useAuthMascotOptional>,
  field: "email" | "password" | "text",
  extra?: {
    onFocus?: () => void;
    onBlur?: () => void;
    onChange?: (value: string) => void;
  },
) {
  return {
    onFocus: () => {
      if (field === "password") {
        mascot?.setFocusField("password");
      } else if (field === "email") {
        mascot?.setFocusField("email");
      } else {
        mascot?.setFocusField("text");
      }
      extra?.onFocus?.();
    },
    onBlur: () => {
      mascot?.setFocusField(null);
      extra?.onBlur?.();
    },
    onChange: (value: string) => {
      mascot?.pulseTyping(field);
      extra?.onChange?.(value);
    },
  };
}

type EmailFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  label?: string;
};

export function AuthEmailField({
  value,
  onChange,
  placeholder = "you@example.com",
  required = true,
  autoComplete = "email",
  label = "Email address",
}: EmailFieldProps) {
  const mascot = useAuthMascotOptional();
  const handlers = wireMascotInput(mascot, "email", { onChange });

  return (
    <div>
      <AuthFieldLabel soft required={required}>
        {label}
      </AuthFieldLabel>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
        <input
          type="email"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            handlers.onChange(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={handlers.onFocus}
          onBlur={handlers.onBlur}
          required={required}
          autoComplete={autoComplete}
          className={authFieldClass}
        />
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  label?: string;
};

export function AuthPasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  placeholder = "••••••••",
  required = true,
  autoComplete = "current-password",
  label = "Password",
}: PasswordFieldProps) {
  const mascot = useAuthMascotOptional();

  const handleFocus = () => {
    mascot?.setFocusField("password");
    mascot?.setMood(show ? "peek" : "focus-password");
  };

  const handleChange = (next: string) => {
    mascot?.pulseTyping("password");
    if (!show) mascot?.setMood("focus-password");
    onChange(next);
  };

  return (
    <div>
      <AuthFieldLabel soft required={required}>
        {label}
      </AuthFieldLabel>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
        <input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => mascot?.setFocusField(null)}
          required={required}
          autoComplete={autoComplete}
          className={`${authFieldClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => {
            onToggleShow();
            mascot?.setMood(show ? "focus-password" : "peek");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-muted"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export function AuthTextField({
  value,
  onChange,
  label = "Full name",
  placeholder = "Your full name",
  icon: Icon = UserRound,
  required,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  icon?: typeof UserRound;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const mascot = useAuthMascotOptional();
  const handlers = wireMascotInput(mascot, "text", { onChange });

  return (
    <div>
      <AuthFieldLabel soft required={required}>
        {label}
      </AuthFieldLabel>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
        <input
          {...rest}
          type="text"
          placeholder={placeholder}
          value={value}
          required={required}
          onChange={(e) => {
            handlers.onChange(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={handlers.onFocus}
          onBlur={handlers.onBlur}
          className={authFieldClass}
        />
      </div>
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  loading,
  disabled,
}: {
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-4 text-[15px] font-semibold text-white shadow-[0_16px_40px_rgba(23,23,23,0.18)] transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary dark:shadow-[0_16px_40px_rgba(255,77,28,0.25)] dark:hover:bg-primary/90"
    >
      {children}
    </button>
  );
}
