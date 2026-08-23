import type { ComponentType, SVGProps } from "react";
import UilAward from "@iconscout/react-unicons/icons/uil-award";
import UilBath from "@iconscout/react-unicons/icons/uil-bath";
import UilBolt from "@iconscout/react-unicons/icons/uil-bolt";
import UilBorderOut from "@iconscout/react-unicons/icons/uil-border-out";
import UilBox from "@iconscout/react-unicons/icons/uil-box";
import UilBriefcase from "@iconscout/react-unicons/icons/uil-briefcase";
import UilBrushAlt from "@iconscout/react-unicons/icons/uil-brush-alt";
import UilBug from "@iconscout/react-unicons/icons/uil-bug";
import UilBuilding from "@iconscout/react-unicons/icons/uil-building";
import UilCheckCircle from "@iconscout/react-unicons/icons/uil-check-circle";
import UilCircuit from "@iconscout/react-unicons/icons/uil-circuit";
import UilClipboardNotes from "@iconscout/react-unicons/icons/uil-clipboard-notes";
import UilConstructor from "@iconscout/react-unicons/icons/uil-constructor";
import UilDesktop from "@iconscout/react-unicons/icons/uil-desktop";
import UilDollarSign from "@iconscout/react-unicons/icons/uil-dollar-sign";
import UilDrill from "@iconscout/react-unicons/icons/uil-drill";
import UilEstate from "@iconscout/react-unicons/icons/uil-estate";
import UilExternalLinkAlt from "@iconscout/react-unicons/icons/uil-external-link-alt";
import UilFileAlt from "@iconscout/react-unicons/icons/uil-file-alt";
import UilFileContract from "@iconscout/react-unicons/icons/uil-file-contract";
import UilFileUploadAlt from "@iconscout/react-unicons/icons/uil-file-upload-alt";
import UilFire from "@iconscout/react-unicons/icons/uil-fire";
import UilFlower from "@iconscout/react-unicons/icons/uil-flower";
import UilGlass from "@iconscout/react-unicons/icons/uil-glass";
import UilHardHat from "@iconscout/react-unicons/icons/uil-hard-hat";
import UilHome from "@iconscout/react-unicons/icons/uil-home";
import UilKeySkeleton from "@iconscout/react-unicons/icons/uil-key-skeleton";
import UilLayerGroup from "@iconscout/react-unicons/icons/uil-layer-group";
import UilLightbulb from "@iconscout/react-unicons/icons/uil-lightbulb";
import UilLock from "@iconscout/react-unicons/icons/uil-lock";
import UilMap from "@iconscout/react-unicons/icons/uil-map";
import UilMapMarker from "@iconscout/react-unicons/icons/uil-map-marker";
import UilPaintTool from "@iconscout/react-unicons/icons/uil-paint-tool";
import UilPhone from "@iconscout/react-unicons/icons/uil-phone";
import UilPlug from "@iconscout/react-unicons/icons/uil-plug";
import UilScrew from "@iconscout/react-unicons/icons/uil-screw";
import UilSetting from "@iconscout/react-unicons/icons/uil-setting";
import UilShield from "@iconscout/react-unicons/icons/uil-shield";
import UilShieldCheck from "@iconscout/react-unicons/icons/uil-shield-check";
import UilShovel from "@iconscout/react-unicons/icons/uil-shovel";
import UilSignAlt from "@iconscout/react-unicons/icons/uil-sign-alt";
import UilSnowflake from "@iconscout/react-unicons/icons/uil-snowflake";
import UilSun from "@iconscout/react-unicons/icons/uil-sun";
import UilSwatchbook from "@iconscout/react-unicons/icons/uil-swatchbook";
import UilTagAlt from "@iconscout/react-unicons/icons/uil-tag-alt";
import UilTemperatureHalf from "@iconscout/react-unicons/icons/uil-temperature-half";
import UilTrashAlt from "@iconscout/react-unicons/icons/uil-trash-alt";
import UilTrees from "@iconscout/react-unicons/icons/uil-trees";
import UilTrowel from "@iconscout/react-unicons/icons/uil-trowel";
import UilUser from "@iconscout/react-unicons/icons/uil-user";
import UilUsersAlt from "@iconscout/react-unicons/icons/uil-users-alt";
import UilWater from "@iconscout/react-unicons/icons/uil-water";
import UilWindow from "@iconscout/react-unicons/icons/uil-window";
import UilWrench from "@iconscout/react-unicons/icons/uil-wrench";

export type Unicon = ComponentType<
  SVGProps<SVGSVGElement> & { color?: string; size?: string | number }
>;

/** IconScout Unicons mapped to contractor trades. */
export const TRADE_ICONS: Record<string, Unicon> = {
  Appliances: UilPlug,
  Awnings: UilSun,
  Carpentry: UilScrew,
  "Concrete and Asphalt": UilTrowel,
  "Doors and Hardware": UilKeySkeleton,
  Electrical: UilBolt,
  Environmental: UilFlower,
  Equipment: UilSetting,
  "Finishes and Fixtures": UilSwatchbook,
  "Fire Life Safety": UilFire,
  Flooring: UilLayerGroup,
  "Gates and Fences": UilBorderOut,
  "General Contractor": UilHardHat,
  Handyman: UilWrench,
  HVAC: UilTemperatureHalf,
  Janitorial: UilBrushAlt,
  Landscaping: UilTrees,
  Lighting: UilLightbulb,
  Locks: UilLock,
  Painting: UilPaintTool,
  "Pest Control": UilBug,
  Plumbing: UilBath,
  "Professional Services": UilBriefcase,
  Refrigeration: UilSnowflake,
  "Roofing and Siding": UilHome,
  Security: UilShield,
  Signage: UilSignAlt,
  Snow: UilSnowflake,
  Technology: UilDesktop,
  "Temporary Protection": UilShieldCheck,
  "Waste Management": UilTrashAlt,
  Welding: UilDrill,
  "Windows and Glass": UilWindow,
};

export const SECTION_ICONS = {
  welcome: UilHardHat,
  company: UilBuilding,
  classifications: UilTagAlt,
  address: UilMapMarker,
  contact: UilUser,
  documents: UilFileAlt,
  trades: UilConstructor,
  serviceAreas: UilMap,
  licensing: UilShieldCheck,
  experience: UilDollarSign,
  attestation: UilCheckCircle,
} as const;

export function UniconBadge({
  icon: Icon,
  size = 18,
  className = "",
}: {
  icon: Unicon;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ${className}`}
    >
      <Icon size={size} color="currentColor" aria-hidden />
    </span>
  );
}

export function TradeIcon({
  trade,
  size = 16,
  className = "",
}: {
  trade: string;
  size?: number;
  className?: string;
}) {
  const Icon = TRADE_ICONS[trade] || UilAppsFallback;
  return <Icon size={size} color="currentColor" className={className} aria-hidden />;
}

/** Fallback when a trade has no mapped icon. */
function UilAppsFallback(props: SVGProps<SVGSVGElement> & { color?: string; size?: string | number }) {
  return <UilBox {...props} />;
}

export {
  UilAward,
  UilBuilding,
  UilCheckCircle,
  UilClipboardNotes,
  UilConstructor,
  UilDollarSign,
  UilEstate,
  UilExternalLinkAlt,
  UilFileAlt,
  UilFileContract,
  UilFileUploadAlt,
  UilHardHat,
  UilMap,
  UilMapMarker,
  UilPhone,
  UilShieldCheck,
  UilTagAlt,
  UilUser,
  UilUsersAlt,
  UilWater,
  UilWrench,
};
