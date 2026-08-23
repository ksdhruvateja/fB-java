import { motion } from "motion/react";
import { HardHat, Home, Shield } from "lucide-react";
import type { AuthMascotMood, AuthMascotVariant } from "./AuthMascotContext";

type Props = {
  variant: AuthMascotVariant;
  mood: AuthMascotMood;
  compact?: boolean;
};

function eyeOffset(mood: AuthMascotMood) {
  switch (mood) {
    case "focus-email":
      return { x: 4, y: 6 };
    case "focus-password":
    case "peek":
      return { x: -2, y: 8 };
    case "error":
      return { x: 0, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function MascotFace({ mood, compact }: { mood: AuthMascotMood; compact?: boolean }) {
  const { x, y } = eyeOffset(mood);
  const coverEyes = mood === "focus-password";
  const peek = mood === "peek";
  const size = compact ? 0.72 : 1;

  return (
    <motion.div
      animate={
        mood === "error"
          ? { x: [0, -6, 6, -4, 4, 0] }
          : mood === "loading"
            ? { y: [0, -4, 0] }
            : { x: 0, y: 0 }
      }
      transition={
        mood === "error"
          ? { duration: 0.45 }
          : mood === "loading"
            ? { repeat: Infinity, duration: 1.2 }
            : { type: "spring", stiffness: 260, damping: 18 }
      }
      className="relative"
      style={{ scale: size }}
    >
      <div className="relative h-44 w-44">
        <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-[#FF6B3D] via-[#FF4D1C] to-[#E63E0F] shadow-[0_24px_60px_rgba(255,77,28,0.35)]" />
        <div className="absolute inset-[10px] rounded-[2rem] bg-[#FFF8F4]/95" />

        {!coverEyes && !peek && (
          <>
            <motion.span
              animate={{ x: -14 + x, y: 36 + y }}
              className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full bg-neutral-900"
            />
            <motion.span
              animate={{ x: 14 + x, y: 36 + y }}
              className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full bg-neutral-900"
            />
          </>
        )}

        {coverEyes && (
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 34, opacity: 1 }}
            className="absolute inset-x-6 top-0 flex justify-center gap-3"
          >
            <span className="h-10 w-12 rounded-full bg-[#FFB091]" />
            <span className="h-10 w-12 rounded-full bg-[#FFB091]" />
          </motion.div>
        )}

        {peek && (
          <div className="absolute inset-x-8 top-[34px] flex justify-between">
            <span className="h-3 w-8 rounded-full bg-neutral-900" />
            <span className="h-3 w-3 rounded-full bg-neutral-900" />
          </div>
        )}

        <motion.div
          animate={{
            scaleX: mood === "success" || mood === "welcome" ? 1.15 : mood === "error" ? 0.85 : 1,
            scaleY: mood === "success" || mood === "welcome" ? 1.1 : 1,
          }}
          className={`absolute left-1/2 top-[78px] h-3 -translate-x-1/2 rounded-full bg-neutral-900 ${
            mood === "error" ? "w-8 rotate-12" : mood === "success" || mood === "welcome" ? "w-12" : "w-10"
          }`}
        />

        {mood === "loading" && (
          <div className="absolute -right-3 top-8 flex gap-1 rounded-full bg-white px-2 py-1 shadow-md">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
                className="h-1.5 w-1.5 rounded-full bg-primary"
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function VariantBadge({ variant }: { variant: AuthMascotVariant }) {
  const config = {
    homeowner: { icon: Home, label: "Homeowner portal" },
    contractor: { icon: HardHat, label: "Contractor portal" },
    admin: { icon: Shield, label: "Staff access" },
  }[variant];
  const Icon = config.icon;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur dark:border-border dark:bg-card/80 dark:text-foreground">
      <Icon size={14} className="text-primary" />
      {config.label}
    </span>
  );
}

export default function AuthMascot({ variant, mood, compact }: Props) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-3" : "gap-5"}`}>
      <VariantBadge variant={variant} />
      <MascotFace mood={mood} compact={compact} />
    </div>
  );
}
