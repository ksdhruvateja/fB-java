import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Bell, Loader2, FileCheck, DollarSign } from "lucide-react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { getDemoUser, signInUser, signUpUser, signInWithGoogle, type AuthUser } from "./auth";
import ForgotPasswordModal from "./ForgotPasswordModal";
import { brand } from "../config/brand";
import {
  AuthShell,
  AuthPanel,
  AuthTabs,
  AuthFieldLabel,
  AuthError,
  AuthSwitchCard,
} from "./AuthShell";
import { AuthEmailField, AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";
import ContractorApplicationForm, {
  type ContractorApplicationDocs,
} from "./ContractorApplicationForm";
import {
  applicationToProfileFields,
  emptyContractorApplication,
  validateContractorApplication,
  type ContractorApplication,
} from "./contractorApplication";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

const emptyDocs = (): ContractorApplicationDocs => ({
  w9: null,
  license: null,
  insurance: null,
  businessRegistration: null,
  businessLicense: null,
  idDoc: null,
  diversityCert: null,
});

export default function ContractorLogin({
  onLogin,
  onBack,
  onGoHomeowner,
  onGoStaff,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
  onGoHomeowner: () => void;
  onGoStaff: () => void;
}) {
  const demoUser = getDemoUser("contractor");
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState(demoUser.password);
  const [showForgot, setShowForgot] = useState(false);
  const [application, setApplication] = useState<ContractorApplication>(() => emptyContractorApplication());
  const [docs, setDocs] = useState<ContractorApplicationDocs>(emptyDocs);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google sign-in failed. Please try again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signInWithGoogle(response.credential, "contractor");
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Google sign-in failed. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        const result = await signInUser("contractor", email, password);
        setLoading(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onLogin(result.user);
        return;
      }

      const app = {
        ...application,
        companyEmail: application.companyEmail.trim() || email.trim(),
        contactEmail: application.contactEmail.trim() || email.trim(),
      };
      const validationError = validateContractorApplication(app, {
        w9: docs.w9,
        license: docs.license,
        insurance: docs.insurance,
      });
      if (validationError) {
        setLoading(false);
        setError(validationError);
        return;
      }

      const profile = applicationToProfileFields(app);
      const result = await signUpUser({
        role: "contractor",
        name: profile.name || app.contactName,
        email,
        password,
        trade: profile.trade,
        licenseNumber: profile.licenseNumber,
        phone: profile.phone,
        address: profile.address,
        contactEmail: profile.contactEmail,
        companyName: profile.companyName,
        companyDetails: profile.companyDetails,
        insuranceDetails: profile.insuranceDetails,
        serviceZips: profile.serviceZips,
        travelRadiusMiles: profile.travelRadiusMiles,
        visitFee: profile.visitFee,
        emergencyVisitFee: profile.emergencyVisitFee,
        minimumLaborFee: profile.minimumLaborFee,
        contractorApplication: app as unknown as Record<string, unknown>,
        licenseDocumentName: docs.license?.name,
        licenseDocumentData: docs.license?.data,
        insuranceDocumentName: docs.insurance?.name,
        insuranceDocumentData: docs.insurance?.data,
        idDocumentName: docs.idDoc?.name,
        idDocumentData: docs.idDoc?.data,
        w9DocumentName: docs.w9?.name,
        w9DocumentData: docs.w9?.data,
        businessRegistrationName: docs.businessRegistration?.name,
        businessRegistrationData: docs.businessRegistration?.data,
        businessLicenseName: docs.businessLicense?.name,
        businessLicenseData: docs.businessLicense?.data,
      });
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onLogin(result.user);
    } catch {
      setLoading(false);
      setError("Something went wrong. Please try again.");
    }
  };

  const contractorTitles = {
    login: "Welcome back, pro",
    signup: "Join the network",
  } as const;
  const contractorSubtitles = {
    login: "Sign in to view job matches, submit bids, and track your earnings.",
    signup: `Apply free — company, insurance, W-9, and pricing required to join ${brand.productName}.`,
  } as const;

  return (
    <>
      {showForgot && <ForgotPasswordModal role="contractor" onClose={() => setShowForgot(false)} />}

      <AuthShell
        onBack={onBack}
        contentWide={tab === "signup"}
        loading={loading}
        error={Boolean(error)}
        mascot={{
          variant: "contractor",
          title: contractorTitles[tab],
          subtitle: contractorSubtitles[tab],
          badges: (
            <>
              <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur dark:bg-card/80 dark:text-foreground">
                60% close rate
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur dark:bg-card/80 dark:text-foreground">
                312+ active pros
              </span>
              <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm dark:bg-primary">
                $0 monthly fee
              </span>
            </>
          ),
          features: (
            <ul className="space-y-2.5 rounded-2xl border border-white/60 bg-white/50 p-4 text-left shadow-sm backdrop-blur dark:border-border dark:bg-card/60">
              {[
                { icon: Bell, text: "Matched jobs in your trade & area" },
                { icon: FileCheck, text: "Full specs before you bid" },
                { icon: DollarSign, text: "$0 to join or stay listed" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-neutral-700 dark:text-muted-foreground">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={14} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          ),
        }}
      >
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <AuthPanel>
            <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 sm:text-[28px] dark:text-foreground">
              {tab === "login" ? "Contractor sign in" : "Contractor application"}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600 dark:text-muted-foreground">
              {contractorSubtitles[tab]}
            </p>

            <AuthTabs
              value={tab}
              onChange={(t) => {
                setTab(t);
                setError("");
              }}
              tabs={[
                { id: "login", label: "Sign In" },
                { id: "signup", label: "Apply" },
              ]}
            />

            {tab === "login" && (
              <div className="mt-5">
                {GOOGLE_ENABLED ? (
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setError("Google sign-in failed. Please try again.")}
                      text="continue_with"
                      shape="pill"
                      theme="outline"
                      size="large"
                      width="380"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-center">
                    <p className="text-sm font-medium">Continue with Google</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Available when Google Sign-In is configured</p>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">or email</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {tab === "signup" && (
                <ContractorApplicationForm
                  mode="signup"
                  value={application}
                  onChange={setApplication}
                  docs={docs}
                  onDocsChange={setDocs}
                  accountEmail={email}
                />
              )}

              <div className={tab === "signup" ? "rounded-xl border border-border bg-muted/20 p-4 space-y-4" : "space-y-4"}>
                {tab === "signup" && (
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                    Account login
                  </p>
                )}
                <AuthEmailField
                  value={email}
                  onChange={setEmail}
                  placeholder="james@yourcompany.com"
                  label="Email address"
                />
                <AuthPasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPass}
                  onToggleShow={() => setShowPass((s) => !s)}
                />
              </div>

              {tab === "login" && (
                <div className="text-right -mt-1">
                  <button type="button" onClick={() => setShowForgot(true)} className="text-[11px] font-semibold text-primary hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              <AuthError message={error} />

              <AuthPrimaryButton loading={loading}>
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    {tab === "login" ? "Access contractor dashboard" : "Submit application"}
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </AuthPrimaryButton>
            </form>

            <AuthSwitchCard
              prompt="Looking to hire a contractor instead?"
              actionLabel="Sign in as a Homeowner →"
              onAction={onGoHomeowner}
              secondary={
                <button type="button" onClick={onGoStaff} className="text-xs font-semibold text-primary hover:underline">
                  Staff member? Sign in as Staff →
                </button>
              }
            />
          </AuthPanel>
        </motion.div>
      </AuthShell>
    </>
  );
}
