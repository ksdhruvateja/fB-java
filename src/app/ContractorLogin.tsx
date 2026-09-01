import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { signInUser, signUpUser, saveSession, updateUserProfile, type AuthUser } from "./auth";
import ForgotPasswordModal from "./ForgotPasswordModal";
import GoogleSignInButton from "./GoogleSignInButton";
import { signInWithGoogle } from "./marketingApi";
import {
  AuthShell,
  AuthPanel,
  AuthTabs,
  AuthFieldLabel,
  AuthError,
  AuthSwitchCard,
} from "./AuthShell";
import { AuthEmailField, AuthPasswordField, AuthPrimaryButton } from "./AuthFormFields";
import { AuthMobileActions } from "./AuthMobileActions";
import ContractorApplicationForm, {
  type ContractorApplicationDocs,
  emptyContractorApplicationDocs,
} from "./ContractorApplicationForm";
import InsuranceComplianceNotice from "./InsuranceComplianceNotice";
import ContractorAgreementComplianceNotice from "./ContractorAgreementComplianceNotice";
import {
  applicationToProfileFields,
  emptyContractorApplication,
  validateContractorApplication,
  type ContractorApplication,
} from "./contractorApplication";

const emptyDocs = emptyContractorApplicationDocs;

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
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [application, setApplication] = useState<ContractorApplication>(() => emptyContractorApplication());
  const [docs, setDocs] = useState<ContractorApplicationDocs>(emptyDocs);
  const [googleShellAccount, setGoogleShellAccount] = useState(false);

  const handleGoogleCredential = async (credential: string) => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        role: "contractor",
        intent: tab,
        agreeContractorAgreementV4: application.agreeContractorAgreementV4 === true,
      };
      const data = await signInWithGoogle(credential, body, "contractor");
      if (!data.ok) {
        if (data.code === "CONTRACTOR_AGREEMENT_REQUIRED") {
          setError("Accept the FixBridge Contractor Agreement before continuing with Google.");
        } else if (data.code === "ACCOUNT_SUSPENDED") {
          setError(data.message || "This account is not active.");
        } else {
          setError(data.message || "We couldn't sign you in with Google. Please try again.");
        }
        setLoading(false);
        return;
      }
      saveSession(data.token, data.user);
      if (data.needsContractorApplication) {
        const profile = data.googleProfile || {};
        setEmail(String(profile.email || data.user.email || ""));
        setPassword("");
        setApplication((prev) => ({
          ...prev,
          contactName: String(profile.name || prev.contactName || ""),
          companyEmail: String(profile.email || prev.companyEmail || ""),
          contactEmail: String(profile.email || prev.contactEmail || ""),
        }));
        setGoogleShellAccount(true);
        setTab("signup");
        setLoading(false);
        return;
      }
      onLogin(data.user);
    } catch {
      setError("We couldn't sign you in with Google. Please try again.");
    } finally {
      setLoading(false);
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
      if (googleShellAccount) {
        const result = await updateUserProfile({
          name: profile.name || app.contactName,
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
          diversityDocumentName: docs.diversityCert?.name,
          diversityDocumentData: docs.diversityCert?.data,
        });
        setLoading(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onLogin(result.user);
        return;
      }

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
        diversityDocumentName: docs.diversityCert?.name,
        diversityDocumentData: docs.diversityCert?.data,
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

  return (
    <>
      {showForgot && <ForgotPasswordModal role="contractor" onClose={() => setShowForgot(false)} />}

      <AuthShell
        onBack={onBack}
        contentWide={tab === "signup"}
        split={{
          role: "contractor",
          title: "Grow your business with real jobs.",
          subtitle: "Contractor portal",
          body: "Get matched with homeowners in your trade and service area nationwide. Free to join — pay when you win.",
        }}
      >
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <AuthPanel variant="split">
            <h1 className="hidden text-[26px] font-bold tracking-tight text-primary sm:text-[28px] lg:block">
              {tab === "login" ? "Log in" : "Apply"}
            </h1>
            <p className="mt-2 hidden text-[15px] leading-relaxed text-neutral-500 lg:block">
              Enter your credentials to access your contractor account.
            </p>

            <AuthTabs
              variant="split"
              value={tab}
              onChange={(t) => {
                setTab(t);
                setError("");
                setGoogleShellAccount(false);
                if (t === "signup") {
                  setEmail("");
                  setPassword("");
                  setApplication(emptyContractorApplication());
                  setDocs(emptyDocs());
                }
              }}
              tabs={[
                { id: "login", label: "Sign In" },
                { id: "signup", label: "Apply" },
              ]}
            />

            <p className="mt-4 text-lg font-bold text-neutral-900 lg:hidden">
              {tab === "login" ? "Log in" : "Apply"}
            </p>
            <p className="mt-1 text-sm text-neutral-500 lg:hidden">
              Enter your credentials to access your contractor account.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-3">
                <GoogleSignInButton
                  disabled={loading || (tab === "signup" && !application.agreeContractorAgreementV4)}
                  text={tab === "signup" ? "signup_with" : "signin_with"}
                  onCredential={(cred) => void handleGoogleCredential(cred)}
                />
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200" />
                  or
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
              </div>

              {tab === "signup" && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 space-y-4">
                  <ContractorAgreementComplianceNotice
                    compact
                    showCheckbox
                    agreeChecked={application.agreeContractorAgreementV4}
                    onAgreeChange={(checked) =>
                      setApplication((prev) => ({ ...prev, agreeContractorAgreementV4: checked }))
                    }
                  />
                  <InsuranceComplianceNotice compact />
                  <ContractorApplicationForm
                    mode="signup"
                    value={application}
                    onChange={setApplication}
                    docs={docs}
                    onDocsChange={setDocs}
                    accountEmail={email}
                  />
                </div>
              )}

              <div className={tab === "signup" ? "rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 space-y-4" : "space-y-4"}>
                {tab === "signup" && (
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-neutral-500">
                    Account login
                  </p>
                )}
                <AuthEmailField
                  value={email}
                  onChange={setEmail}
                  placeholder="you@email.com"
                  label="Email address"
                />
                {!googleShellAccount && (
                <AuthPasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPass}
                  onToggleShow={() => setShowPass((s) => !s)}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                />
                )}
                {googleShellAccount && (
                  <p className="text-xs text-neutral-500">
                    Signed in with Google as {email}. Complete your application below.
                  </p>
                )}
              </div>

              {tab === "login" && (
                <div className="text-right -mt-1">
                  <button type="button" onClick={() => setShowForgot(true)} className="text-[11px] font-semibold text-primary hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              <AuthError message={error} />
              {loading && (
                <p className="text-center text-xs text-neutral-500">Signing you in…</p>
              )}

              <AuthMobileActions>
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
              </AuthMobileActions>
            </form>

            <AuthSwitchCard
              variant="split"
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
