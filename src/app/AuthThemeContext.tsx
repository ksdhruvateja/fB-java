import { createContext, useContext, type ReactNode } from "react";

export type AuthTheme = "light" | "dark" | "split";

const AuthThemeContext = createContext<AuthTheme>("light");

export function AuthThemeProvider({ theme, children }: { theme: AuthTheme; children: ReactNode }) {
  return <AuthThemeContext.Provider value={theme}>{children}</AuthThemeContext.Provider>;
}

export function useAuthTheme() {
  return useContext(AuthThemeContext);
}
