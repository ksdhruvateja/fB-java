const IMAGES: Array<{ test: RegExp; src: string }> = [
  { test: /appliance|kitchen/i, src: "/brand/services/appliances.png" },
  { test: /carpenter|carpentry/i, src: "/brand/services/carpentry.png" },
  { test: /clean|janitorial/i, src: "/brand/services/cleaning.png" },
  { test: /concrete|asphalt|driveway/i, src: "/brand/services/concrete.png" },
  { test: /electric/i, src: "/brand/services/electrical.jpg" },
  { test: /handyman/i, src: "/brand/services/handyman.png" },
  { test: /landscap|yard|lawn/i, src: "/brand/services/landscaping.png" },
  { test: /light/i, src: "/brand/services/lighting.png" },
  { test: /pest/i, src: "/brand/services/pest-control.png" },
  { test: /plumb|drain|pipe|faucet|toilet/i, src: "/brand/services/plumbing.png" },
  { test: /hvac|heat|cooling|ac\b/i, src: "/brand/services/hvac.png" },
  { test: /paint/i, src: "/brand/services/painting.png" },
  { test: /roof|gutter/i, src: "/brand/services/roofing.png" },
  { test: /floor/i, src: "/brand/services/flooring.png" },
  { test: /door|hardware/i, src: "/brand/services/doors.png" },
  { test: /fence|gate/i, src: "/brand/services/fences.png" },
  { test: /garage/i, src: "/brand/services/garage.png" },
  { test: /lock|security/i, src: "/brand/services/locks.png" },
  { test: /snow/i, src: "/brand/services/snow.png" },
  { test: /window|glass/i, src: "/brand/services/windows.png" },
  { test: /siding/i, src: "/brand/services/siding.png" },
  { test: /smart|technology/i, src: "/brand/services/smart-home.png" },
  { test: /drywall|wall/i, src: "/brand/services/drywall.png" },
  { test: /water damage/i, src: "/brand/services/water-damage.png" },
];

export const BOOKING_CONFIRMED_IMAGE = "/brand/services/booking-confirmed.png";

export function serviceImageFor(name?: string | null) {
  const text = String(name || "");
  return IMAGES.find((item) => item.test.test(text))?.src || "/brand/services/home.png";
}

export function ServiceThumb({
  name,
  className = "h-14 w-16",
}: {
  name?: string | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F2EB] ${className}`}>
      <img src={serviceImageFor(name)} alt="" className="h-full w-full object-contain p-0.5" />
    </span>
  );
}
