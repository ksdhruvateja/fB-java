import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AuthMascotVariant = "homeowner" | "contractor" | "admin";
export type AuthMascotMood =
  | "idle"
  | "focus-email"
  | "focus-password"
  | "focus-text"
  | "peek"
  | "error"
  | "loading"
  | "success"
  | "welcome";

export type AuthMascotFocusField = "email" | "password" | "text" | null;

type AuthMascotContextValue = {
  variant: AuthMascotVariant;
  mood: AuthMascotMood;
  focusField: AuthMascotFocusField;
  typingTick: number;
  title: string;
  subtitle: string;
  setMood: (mood: AuthMascotMood) => void;
  setFocusField: (field: AuthMascotFocusField) => void;
  pulseTyping: (field?: AuthMascotFocusField) => void;
  setCopy: (copy: { title?: string; subtitle?: string }) => void;
};

const AuthMascotContext = createContext<AuthMascotContextValue | null>(null);

export function AuthMascotProvider({
  variant,
  initialTitle,
  initialSubtitle,
  children,
}: {
  variant: AuthMascotVariant;
  initialTitle: string;
  initialSubtitle: string;
  children: ReactNode;
}) {
  const [mood, setMoodState] = useState<AuthMascotMood>("idle");
  const [focusField, setFocusFieldState] = useState<AuthMascotFocusField>(null);
  const [typingTick, setTypingTick] = useState(0);
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);

  const setMood = useCallback((next: AuthMascotMood) => {
    setMoodState(next);
  }, []);

  const setFocusField = useCallback((field: AuthMascotFocusField) => {
    setFocusFieldState(field);
    if (field === "email") setMoodState("focus-email");
    else if (field === "password") setMoodState("focus-password");
    else if (field === "text") setMoodState("focus-text");
    else setMoodState((m) => (m === "loading" || m === "error" ? m : "idle"));
  }, []);

  const pulseTyping = useCallback((field?: AuthMascotFocusField) => {
    if (field) setFocusFieldState(field);
    setTypingTick((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      variant,
      mood,
      focusField,
      typingTick,
      title,
      subtitle,
      setMood,
      setFocusField,
      pulseTyping,
      setCopy: (copy: { title?: string; subtitle?: string }) => {
        if (copy.title !== undefined) setTitle(copy.title);
        if (copy.subtitle !== undefined) setSubtitle(copy.subtitle);
      },
    }),
    [variant, mood, focusField, typingTick, title, subtitle, setMood, setFocusField, pulseTyping],
  );

  return <AuthMascotContext.Provider value={value}>{children}</AuthMascotContext.Provider>;
}

export function useAuthMascot() {
  const ctx = useContext(AuthMascotContext);
  if (!ctx) {
    throw new Error("useAuthMascot must be used within AuthMascotProvider");
  }
  return ctx;
}

export function useAuthMascotOptional() {
  return useContext(AuthMascotContext);
}
