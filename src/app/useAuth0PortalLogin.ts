import { useAuth0 } from "@auth0/auth0-react";
import {
  AUTH0_ENABLED,
  AUTH0_RETURN_KEY,
  AUTH0_ROLE_KEY,
} from "../config/auth0";
import type { UserRole } from "./auth";

type PortalRole = Extract<UserRole, "homeowner">;

/** Auth0 Universal Login — homeowners only. Contractors use native email/Google signup. */
export function useAuth0PortalLogin(role: PortalRole = "homeowner") {
  const { loginWithRedirect, isLoading, error } = useAuth0();

  const startAuth = (mode: "login" | "signup") => {
    if (!AUTH0_ENABLED) return;

    sessionStorage.setItem(AUTH0_ROLE_KEY, role);
    sessionStorage.setItem(AUTH0_RETURN_KEY, "homeowner-dashboard");

    return loginWithRedirect({
      authorizationParams:
        mode === "signup" ? { screen_hint: "signup" } : undefined,
    });
  };

  return {
    enabled: AUTH0_ENABLED,
    isLoading,
    error,
    startLogin: () => startAuth("login"),
    startSignup: () => startAuth("signup"),
  };
}
