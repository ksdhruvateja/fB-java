import HomeownerServiceArtwork from "./HomeownerServiceArtwork";
import { homeownerServiceArtwork } from "./homeownerServiceArtworkMap";

export const BOOKING_CONFIRMED_IMAGE = "/brand/services/booking-confirmed.png";

// All category imagery uses the same licensed local photo identity.
export function serviceImageFor(name?: string | null, serviceId?: string | null) {
  return homeownerServiceArtwork(String(name || ""), serviceId).src;
}

export function ServiceThumb({ name, serviceId, category, className = "h-14 w-16" }: {
  name?: string | null; serviceId?: string | null; category?: string | null; className?: string;
}) {
  return <HomeownerServiceArtwork name={String(name || "")} serviceId={serviceId} category={category} sizes="80px" decorative className={"shrink-0 rounded-xl " + className} />;
}
