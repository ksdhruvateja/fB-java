import { useEffect, type ReactNode } from "react";
import "./commercial.css";
import { AdminLogin, CompanyLogin, LoginChooser, SetPassword } from "./AuthPages";
import AdminApp from "./admin/AdminApp";
import Landing from "./Landing";
import { InvoiceDetailPage, InvoicesPage } from "./portal/Invoices";
import { IntakePage, JobsPage } from "./portal/Jobs";
import { JobDetailPage } from "./portal/JobDetail";
import { CustomersPage, ExceptionsPage, SettingsPage, TeamPage } from "./portal/Setup";
import { PortalShell, useDark } from "./portal/Shell";
import { TodayPage } from "./portal/Today";
import { navigate, usePath } from "./router";

/**
 * FixBridge Commercial: a separate site under /commercial with its own sign-in, company portal
 * and admin panel. Nothing here shares state, accounts or admin screens with the homeowner and
 * contractor marketplace.
 */
export default function CommercialApp() {
  const path = usePath();
  useDark();

  useEffect(() => {
    const onSignedOut = (e: Event) => {
      const who = (e as CustomEvent).detail;
      if (who === "admin" && path.startsWith("/commercial/admin") && path !== "/commercial/admin/login") navigate("/commercial/admin/login", { replace: true });
    };
    window.addEventListener("commercial-signed-out", onSignedOut);
    return () => window.removeEventListener("commercial-signed-out", onSignedOut);
  }, [path]);

  return <div className="fbc min-h-svh">{route(path)}</div>;
}

function route(path: string): ReactNode {
  if (path === "/commercial/login") return <LoginChooser />;
  if (path === "/commercial/login/owner") return <CompanyLogin key="owner" role="owner" />;
  if (path === "/commercial/login/office") return <CompanyLogin key="office" role="office" />;
  if (path === "/commercial/login/technician") return <CompanyLogin key="technician" role="technician" />;
  if (path === "/commercial/set-password") return <SetPassword />;
  if (path === "/commercial/admin/login") return <AdminLogin />;
  if (path.startsWith("/commercial/admin")) return <AdminApp path={path} />;
  if (path.startsWith("/commercial/app")) return <PortalShell path={path}>{portalPage(path)}</PortalShell>;
  return <Landing />;
}

function portalPage(path: string) {
  const rest = path.slice("/commercial/app".length);
  const job = rest.match(/^\/jobs\/(\d+)$/);
  if (job) return <JobDetailPage key={job[1]} id={Number(job[1])} />;
  const invoice = rest.match(/^\/invoices\/(\d+)$/);
  if (invoice) return <InvoiceDetailPage key={invoice[1]} id={Number(invoice[1])} />;
  switch (rest) {
    case "/jobs": return <JobsPage />;
    case "/intake": return <IntakePage />;
    case "/invoices": return <InvoicesPage />;
    case "/exceptions": return <ExceptionsPage />;
    case "/customers": return <CustomersPage />;
    case "/team": return <TeamPage />;
    case "/settings": return <SettingsPage />;
    default: return <TodayPage />;
  }
}
