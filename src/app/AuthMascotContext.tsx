import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AuthMascotVariant = "homeowner" | "contractor" | "admin";
export type AuthMascotMood =
  | "idle"
  | "focus-email"
  | "focus-password"
  | "peek"
  | "error"
  | "loading"
  | "success"
  | "welcome";

type AuthMascotContextValue = {
  variant: AuthMascotVariant;
  mood: AuthMascotMood;
  title: string;
  subtitle: string;
  setMood: (mood: AuthMascotMood) => void;
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
  const [mood, setMood] = useState<AuthMascotMood>("idle");
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);

  const value = useMemo(
    () => ({
      variant,
      mood,
      title,
      subtitle,
      setMood,
      setCopy: (copy: { title?: string; subtitle?: string }) => {
        if (copy.title !== undefined) setTitle(copy.title);
        if (copy.subtitle !== undefined) setSubtitle(copy.subtitle);
      },
    }),
    [variant, mood, title, subtitle],
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
