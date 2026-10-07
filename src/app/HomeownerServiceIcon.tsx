import {
  Refrigerator, Hammer, Brush, Construction, Zap, Wrench, Leaf,
  Lightbulb, Bug, Droplets, Wind, Paintbrush, House, Layers, DoorOpen,
  Fence, CarFront, LockKeyhole, Snowflake, PanelsTopLeft, BrickWall, Router,
  Bath, CookingPot, WashingMachine, Plug, CircleHelp, type LucideIcon,
} from "lucide-react";

const icons: Array<[RegExp, LucideIcon]> = [
  [/bathroom|bath/i, Bath], [/kitchen|oven|dishwasher/i, CookingPot],
  [/washer|dryer|laundry/i, WashingMachine], [/appliance|refrigerator|fridge/i, Refrigerator], [/carpent/i, Hammer],
  [/clean|janitorial/i, Brush], [/concrete|asphalt|driveway/i, Construction],
  [/outlet|switch/i, Plug], [/electric|breaker|power/i, Zap], [/handyman/i, Wrench], [/landscap|yard|lawn/i, Leaf],
  [/light/i, Lightbulb], [/pest|prevention|treatment/i, Bug], [/water damage|plumb|drain|pipe|faucet|toilet|leak|water pressure|water heater/i, Droplets],
  [/hvac|heat|cooling|\bac\b|thermostat|air filter/i, Wind], [/paint/i, Paintbrush], [/roof|gutter/i, House],
  [/floor/i, Layers], [/garage/i, CarFront], [/door|hardware/i, DoorOpen],
  [/fence|gate/i, Fence], [/lock|security/i, LockKeyhole], [/snow/i, Snowflake],
  [/window|glass/i, PanelsTopLeft], [/siding|drywall|wall/i, BrickWall], [/smart|technology/i, Router],
];

export default function HomeownerServiceIcon({ name, fallbackName, className = "h-14 w-14" }: {
  name: string;
  fallbackName?: string;
  className?: string;
}) {
  const Icon = icons.find(([pattern]) => pattern.test(name))?.[1]
    || icons.find(([pattern]) => pattern.test(fallbackName || ""))?.[1] || CircleHelp;
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center text-primary ${className}`}>
    <Icon className="h-7 w-7" strokeWidth={1.4} />
  </span>;
}
