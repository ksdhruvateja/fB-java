import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Auth0SessionSync from "./Auth0SessionSync";
import { clearSession, loadAllUsers, type AuthUser } from "./auth";
import { setAuth0SignOutHandler } from "./auth0SignOut";

type Page = "homeowner-dashboard";

type Props = {
  currentUser: AuthUser | null;
  setCurrentUser: (user: AuthUser | null) => void;
  onNavigate: (page: Page) => void;
};

export default function Auth0AppIntegration({
  currentUser,
  setCurrentUser,
  onNavigate,
}: Props) {
  const { logout, isAuthenticated } = useAuth0();

  useEffect(() => {
    const signOut = async () => {
      if (isAuthenticated) {
        await logout({ logoutParams: { returnTo: window.location.origin } });
      }
    };
    setAuth0SignOutHandler(signOut);
    return () => setAuth0SignOutHandler(null);
  }, [isAuthenticated, logout]);

  return (
    <Auth0SessionSync
      currentUser={currentUser}
      onAuthenticated={(user) => {
          setCurrentUser(user);
          loadAllUsers();
          // Auth0 is homeowners-only; contractors use native auth.
          if (user.role === "homeowner") onNavigate("homeowner-dashboard");
        }}
      onSyncFailed={() => {
        clearSession();
        setCurrentUser(null);
      }}
    />
  );
}
