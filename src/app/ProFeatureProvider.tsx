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
  busy,
  onUpgrade,
  onProActivated,
  children,
}: {
  planCode?: string | null;
  homeCareSubscription?: HomeCareSubscription | null;
  busy?: boolean;
  onUpgrade: (planCode: string) => void | Promise<void>;
  onProActivated?: (feature: ProFeatureId | null) => void;
  children: ReactNode;
}) {
  const isPro = hasProEntitlement(planCode, homeCareSubscription);
  const [modalFeature, setModalFeature] = useState<ProFeatureId | null>(null);
  const [modalSource, setModalSource] = useState<string | undefined>();
  const [pendingFeature, setPendingFeature] = useState<ProFeatureId | null>(null);
  const [disabledNotice, setDisabledNotice] = useState<string | null>(null);
  const prevProRef = useRef(isPro);

  const openUpgrade = useCallback((feature: ProFeatureId, source?: string) => {
    trackProFeatureEvent("pro_feature_clicked", { feature, source });
    setPendingFeature(feature);
    setModalFeature(feature);
    setModalSource(source);
  }, []);

  const closeUpgrade = useCallback(() => {
    setModalFeature(null);
    setModalSource(undefined);
  }, []);

  const requestFeature = useCallback(
    (feature: ProFeatureId, source?: string) => {
      if (hasProEntitlement(planCode, homeCareSubscription)) return true;
      openUpgrade(feature, source);
      return false;
    },
    [planCode, homeCareSubscription, openUpgrade]
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
      if (hasProEntitlement(planCode, homeCareSubscription)) return;
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
  }, [planCode, homeCareSubscription, openUpgrade]);

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
      planCode,
      pendingFeature,
      requestFeature,
      openUpgrade,
      closeUpgrade,
      consumePendingFeature,
    }),
    [isPro, planCode, pendingFeature, requestFeature, openUpgrade, closeUpgrade, consumePendingFeature]
  );

  return (
    <ProFeatureContext.Provider value={value}>
      {children}
      <UpgradeToProModal
        open={modalFeature != null}
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
            <button type="button" className="mt-4 rounded-xl bg-[#FF4D1C] px-4 py-2 text-sm font-medium text-white" onClick={() => setDisabledNotice(null)}>
              OK
            </button>
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
