import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import UpgradeToProModal from "./UpgradeToProModal";
import {
  hasProEntitlement,
  trackProFeatureEvent,
  type ProFeatureId,
} from "./proFeatures";
import type { HomeCareSubscription } from "./auth";
import { FEATURE_DISABLED_EVENT, PRO_REQUIRED_EVENT, type ProRequiredDetail } from "./proFeatureEvents";
import { PAID_HOME_CARE_PLAN_CODE } from "./subscriptionCatalog";

type ProFeatureContextValue = {
  isPro: boolean;
  entitlementReady: boolean;
  paymentIssue: boolean;
  planCode?: string | null;
  pendingFeature: ProFeatureId | null;
  requestFeature: (feature: ProFeatureId, source?: string) => boolean;
  openUpgrade: (feature: ProFeatureId, source?: string) => void;
  closeUpgrade: () => void;
  consumePendingFeature: () => ProFeatureId | null;
};

const ProFeatureContext = createContext<ProFeatureContextValue | null>(null);

export function ProFeatureProvider({
  planCode,
  homeCareSubscription,
  entitlementReady = homeCareSubscription != null,
  busy,
  onUpgrade,
  onManageBilling,
  onProActivated,
  children,
}: {
  planCode?: string | null;
  homeCareSubscription?: HomeCareSubscription | null;
  entitlementReady?: boolean;
  busy?: boolean;
  onUpgrade: (planCode: string) => void | Promise<void>;
  onManageBilling?: () => void | Promise<void>;
  onProActivated?: (feature: ProFeatureId | null) => void;
  children: ReactNode;
}) {
  const isPro = hasProEntitlement(planCode, homeCareSubscription);
  const paymentIssue = Boolean(homeCareSubscription?.paymentIssue) && !isPro;
  const [modalFeature, setModalFeature] = useState<ProFeatureId | null>(null);
  const [modalSource, setModalSource] = useState<string | undefined>();
  const [pendingFeature, setPendingFeature] = useState<ProFeatureId | null>(null);
  const [disabledNotice, setDisabledNotice] = useState<string | null>(null);
  const prevProRef = useRef(isPro);

  const openUpgrade = useCallback((feature: ProFeatureId, source?: string) => {
    if (!entitlementReady || isPro) return;
    if (paymentIssue) {
      setDisabledNotice("There's a problem with your HomeCare Pro billing. Update your payment method — you don't need to subscribe again.");
      return;
    }
    trackProFeatureEvent("pro_feature_clicked", { feature, source });
    setPendingFeature(feature);
    setModalFeature(feature);
    setModalSource(source);
  }, [entitlementReady, isPro, paymentIssue]);

  const closeUpgrade = useCallback(() => {
    setModalFeature(null);
    setModalSource(undefined);
  }, []);

  const requestFeature = useCallback(
    (feature: ProFeatureId, source?: string) => {
      if (!entitlementReady) return false;
      if (hasProEntitlement(planCode, homeCareSubscription)) return true;
      openUpgrade(feature, source);
      return false;
    },
    [entitlementReady, planCode, homeCareSubscription, openUpgrade]
  );

  const consumePendingFeature = useCallback(() => {
    const next = pendingFeature;
    setPendingFeature(null);
    return next;
  }, [pendingFeature]);

  useEffect(() => {
    function onProRequired(e: Event) {
      const detail = (e as CustomEvent<ProRequiredDetail>).detail;
      if (!detail) return;
      if (!entitlementReady || hasProEntitlement(planCode, homeCareSubscription)) return;
      openUpgrade(detail.feature || "document_vault", detail.source);
    }
    function onFeatureDisabled(e: Event) {
      const detail = (e as CustomEvent<ProRequiredDetail>).detail;
      setDisabledNotice(detail?.message || "This feature is currently unavailable.");
    }
    window.addEventListener(PRO_REQUIRED_EVENT, onProRequired);
    window.addEventListener(FEATURE_DISABLED_EVENT, onFeatureDisabled);
    return () => {
      window.removeEventListener(PRO_REQUIRED_EVENT, onProRequired);
      window.removeEventListener(FEATURE_DISABLED_EVENT, onFeatureDisabled);
    };
  }, [entitlementReady, planCode, homeCareSubscription, openUpgrade]);

  useEffect(() => {
    if (!prevProRef.current && isPro) {
      trackProFeatureEvent("pro_subscription_completed", { feature: pendingFeature || undefined });
      closeUpgrade();
      onProActivated?.(pendingFeature);
    }
    prevProRef.current = isPro;
  }, [isPro, pendingFeature, closeUpgrade, onProActivated]);

  const value = useMemo(
    (): ProFeatureContextValue => ({
      isPro,
      entitlementReady,
      paymentIssue,
      planCode,
      pendingFeature,
      requestFeature,
      openUpgrade,
      closeUpgrade,
      consumePendingFeature,
    }),
    [isPro, entitlementReady, paymentIssue, planCode, pendingFeature, requestFeature, openUpgrade, closeUpgrade, consumePendingFeature]
  );

  return (
    <ProFeatureContext.Provider value={value}>
      {children}
      <UpgradeToProModal
        open={entitlementReady && !isPro && !paymentIssue && modalFeature != null}
        feature={modalFeature || "maintenance_calendar"}
        source={modalSource}
        busy={busy}
        onClose={closeUpgrade}
        onUpgrade={() => onUpgrade(PAID_HOME_CARE_PLAN_CODE)}
      />
      {disabledNotice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <p className="text-sm font-semibold">Feature unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">{disabledNotice}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {paymentIssue && onManageBilling ? (
                <button type="button" className="rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" onClick={() => { setDisabledNotice(null); void onManageBilling(); }}>
                  Update payment method
                </button>
              ) : null}
              <button type="button" className="rounded-xl border border-border px-4 py-2 text-sm font-medium" onClick={() => setDisabledNotice(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ProFeatureContext.Provider>
  );
}

export function useProFeature() {
  const ctx = useContext(ProFeatureContext);
  if (!ctx) {
    throw new Error("useProFeature must be used within ProFeatureProvider");
  }
  return ctx;
}

/** Safe outside provider — returns permissive defaults for tests/storybook. */
export function useProFeatureOptional() {
  return useContext(ProFeatureContext);
}
