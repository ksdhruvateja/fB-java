import { useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  AUTH0_ENABLED,
  AUTH0_RETURN_KEY,
  AUTH0_ROLE_KEY,
} from "../config/auth0";
import { clearSession, signInWithAuth0, type AuthUser, type UserRole } from "./auth";

type Props = {
  currentUser: AuthUser | null;
  onAuthenticated: (user: AuthUser) => void;
  onSyncFailed: (message: string) => void;
};

function readPendingRole(): UserRole | null {
  const role = sessionStorage.getItem(AUTH0_ROLE_KEY);
  if (role === "homeowner") return role;
  return null;
}

export default function Auth0SessionSync({
  currentUser,
  onAuthenticated,
  onSyncFailed,
}: Props) {
  const { isAuthenticated, isLoading, getAccessTokenSilently, logout } = useAuth0();
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!AUTH0_ENABLED || isLoading || !isAuthenticated || currentUser) return;
    if (syncingRef.current) return;

    const role = readPendingRole();
    if (!role) return;

    syncingRef.current = true;

    (async () => {
      try {
        const accessToken = await getAccessTokenSilently();
        const result = await signInWithAuth0(accessToken, role);
        if (!result.ok) {
          clearSession();
          sessionStorage.removeItem(AUTH0_ROLE_KEY);
          sessionStorage.removeItem(AUTH0_RETURN_KEY);
          await logout({ logoutParams: { returnTo: window.location.origin } });
          onSyncFailed(result.message);
          return;
        }

        sessionStorage.removeItem(AUTH0_ROLE_KEY);
        sessionStorage.removeItem(AUTH0_RETURN_KEY);
        onAuthenticated(result.user);
      } catch {
        clearSession();
        sessionStorage.removeItem(AUTH0_ROLE_KEY);
        sessionStorage.removeItem(AUTH0_RETURN_KEY);
        try {
          await logout({ logoutParams: { returnTo: window.location.origin } });
        } catch {
          // ignore logout failures
        }
        onSyncFailed("Could not complete sign-in. Please try again.");
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [
    currentUser,
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    logout,
    onAuthenticated,
    onSyncFailed,
  ]);

  return null;
}

export function readAuth0ReturnPage(): string | null {
  return sessionStorage.getItem(AUTH0_RETURN_KEY);
}
