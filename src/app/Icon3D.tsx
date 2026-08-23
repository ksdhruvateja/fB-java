import { useEffect, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { useTilt } from "./shared";

export type Icon3DTone = "coral" | "ink" | "steel" | "sand";
export type Icon3DSize = "sm" | "md" | "lg" | "responsive";

const TONE: Record<
  Icon3DTone,
  { face: string; edge: string; deep: string; icon: string; glow: string }
> = {
  coral: {
    face: "linear-gradient(145deg, #FF7A4D 0%, #FF4D1C 48%, #E03A0C 100%)",
    edge: "#C4320A",
    deep: "#9A2808",
    icon: "#FFFFFF",
    glow: "rgba(255, 77, 28, 0.35)",
  },
  ink: {
    face: "linear-gradient(145deg, #3A3A3A 0%, #1A1A1A 55%, #0A0A0A 100%)",
    edge: "#050505",
    deep: "#000000",
    icon: "#FFFFFF",
    glow: "rgba(0, 0, 0, 0.28)",
  },
  steel: {
    face: "linear-gradient(145deg, #F4F4F5 0%, #D4D4D8 50%, #A1A1AA 100%)",
    edge: "#71717A",
    deep: "#52525B",
    icon: "#18181B",
    glow: "rgba(24, 24, 27, 0.18)",
  },
  sand: {
    face: "linear-gradient(145deg, #FFFFFF 0%, #F4F4F5 55%, #E4E4E7 100%)",
    edge: "#D4D4D8",
    deep: "#A1A1AA",
    icon: "#FF4D1C",
    glow: "rgba(0, 0, 0, 0.12)",
  },
};

const SIZE: Record<"sm" | "md" | "lg", { box: number; icon: number; depth: number; radius: number }> = {
  sm: { box: 44, icon: 18, depth: 7, radius: 11 },
  md: { box: 56, icon: 22, depth: 9, radius: 14 },
  lg: { box: 68, icon: 26, depth: 11, radius: 16 },
};

function useBreakpointSize(size: Icon3DSize): "sm" | "md" | "lg" {
  const [resolved, setResolved] = useState<"sm" | "md" | "lg">(() => {
    if (size !== "responsive") return size;
    if (typeof window === "undefined") return "md";
    if (window.matchMedia("(min-width: 1024px)").matches) return "lg";
    if (window.matchMedia("(min-width: 640px)").matches) return "md";
    return "sm";
  });

  useEffect(() => {
    if (size !== "responsive") {
      setResolved(size);
      return;
    }
    const mqSm = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (mqLg.matches) setResolved("lg");
      else if (mqSm.matches) setResolved("md");
      else setResolved("sm");
    };
    sync();
    mqSm.addEventListener("change", sync);
    mqLg.addEventListener("change", sync);
    return () => {
      mqSm.removeEventListener("change", sync);
      mqLg.removeEventListener("change", sync);
    };
  }, [size]);

  return size === "responsive" ? resolved : size;
}

function useCanTilt() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCan(hover.matches && !reduce.matches);
    sync();
    hover.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      hover.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);
  return can;
}

/** Soft extruded 3D glyph — scales cleanly on phone and laptop. */
export function Icon3D({
  icon: Icon,
  tone = "coral",
  size = "responsive",
  className = "",
  label,
}: {
  icon: LucideIcon;
  tone?: Icon3DTone;
  size?: Icon3DSize;
  className?: string;
  label?: string;
}) {
  const t = TONE[tone];
  const resolved = useBreakpointSize(size);
  const s = SIZE[resolved];
  const canTilt = useCanTilt();
  const { ref, handleMove, handleLeave } = useTilt(9);

  const shellStyle: CSSProperties = {
    width: s.box + s.depth,
    height: s.box + s.depth,
  };

  return (
    <div
      className={`relative inline-flex shrink-0 items-start justify-start ${className}`}
      style={shellStyle}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <div
        ref={canTilt ? ref : undefined}
        onMouseMove={canTilt ? handleMove : undefined}
        onMouseLeave={canTilt ? handleLeave : undefined}
        className="relative will-change-transform"
        style={{
          width: s.box,
          height: s.box,
          transformStyle: "preserve-3d",
          transition: canTilt ? "transform 0.18s ease-out" : undefined,
          filter: `drop-shadow(0 ${Math.round(s.depth * 0.85)}px ${Math.round(s.depth * 1.4)}px ${t.glow})`,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            borderRadius: s.radius,
            background: t.deep,
            transform: `translate3d(${s.depth}px, ${s.depth}px, 0)`,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            borderRadius: s.radius,
            background: t.edge,
            transform: `translate3d(${s.depth * 0.5}px, ${s.depth * 0.5}px, 0)`,
          }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{
            borderRadius: s.radius,
            background: t.face,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.38), inset 0 -2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-3 -left-3 h-[65%] w-[65%] rounded-full opacity-45"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9) 0%, transparent 62%)",
            }}
          />
          <Icon
            size={s.icon}
            strokeWidth={2.2}
            color={t.icon}
            className="relative z-[1]"
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}
