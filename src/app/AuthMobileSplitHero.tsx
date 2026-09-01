import { motion } from "motion/react";
import { ArrowLeft, Shield, Star, MapPin, HardHat, TrendingUp, Lock, KeyRound } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { brand } from "../config/brand";
import { AUTH_ROLE_PHOTOS } from "./authRoleAssets";
import type { AuthSplitRole } from "./AuthSplitBrandPanel";

const ROLE_CHIPS: Record<AuthSplitRole, { icon: typeof Shield; label: string }[]> = {
  homeowner: [
    { icon: Shield, label: "Verified pros" },
    { icon: Star, label: "Rated & reviewed" },
    { icon: MapPin, label: "Nationwide" },
  ],
  contractor: [
    { icon: HardHat, label: "Real jobs" },
    { icon: TrendingUp, label: "Grow revenue" },
    { icon: MapPin, label: "Local leads" },
  ],
  admin: [
    { icon: Shield, label: "Secure access" },
    { icon: Lock, label: "MFA required" },
    { icon: KeyRound, label: "Staff only" },
  ],
};

export default function AuthMobileSplitHero({
  role,
  title,
  subtitle,
  body,
  onBack,
  backLabel,
}: {
  role: AuthSplitRole;
  title: string;
  subtitle?: string;
  body: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const photo = AUTH_ROLE_PHOTOS[role];
  const chips = ROLE_CHIPS[role];

  return (
    <div className="relative h-[min(46vh,22rem)] overflow-hidden lg:hidden">
      <motion.img
        src={photo}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ scale: 1.05 }}
        animate={{ scale: 1.12 }}
        transition={{ duration: 18, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1B3A]/55 via-primary/80 to-primary/95" />

      <div className="relative z-10 flex h-full flex-col px-5 pb-10 pt-4">
        <div className="flex items-center justify-between gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-md outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label={`${brand.productName} home`}
            >
              <BrandLogo variant="auth" tone="color" className="brightness-0 invert" />
            </button>
          ) : (
            <BrandLogo variant="auth" tone="color" className="brightness-0 invert" />
          )}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition active:scale-95 hover:bg-white/25"
            >
              <ArrowLeft size={14} />
              {backLabel || "Back"}
            </button>
          ) : null}
        </div>

        <div className="mt-auto">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/85"
          >
            {subtitle || `Welcome to ${brand.productName}`}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-1 text-2xl font-bold leading-tight text-white"
          >
            {title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/85"
          >
            {body}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-4 flex flex-wrap gap-2"
          >
            {chips.map((chip, i) => {
              const Icon = chip.icon;
              return (
                <motion.span
                  key={chip.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.32 + i * 0.06 }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                >
                  <Icon size={12} className="text-white/90" />
                  {chip.label}
                </motion.span>
              );
            })}
          </motion.div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="h-1 w-10 rounded-full bg-white/50"
          aria-hidden
        />
      </div>
    </div>
  );
}
