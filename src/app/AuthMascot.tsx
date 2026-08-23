import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useAnimationControls, useMotionValue, useSpring, useTransform } from "motion/react";
import type { AuthMascotFocusField, AuthMascotMood, AuthMascotVariant } from "./AuthMascotContext";
import { useAuthMascotOptional } from "./AuthMascotContext";

type Props = {
  variant: AuthMascotVariant;
  mood: AuthMascotMood;
  compact?: boolean;
  focusField?: AuthMascotFocusField;
  typingTick?: number;
};

type ArmPose = { rotate: number; x: number; y: number; scale?: number };

const SKIN = "#E8B896";
const SKIN_SHADOW = "#C9956E";
const HAIR = "#2D2419";
const NAVY = "#142847";
const NAVY_DARK = "#0B1B3A";
const ORANGE = "#FF4D1C";
const GLOVE = "#FF6B3D";

function armPose(mood: AuthMascotMood, side: "left" | "right", typingTick: number): ArmPose {
  const w = typingTick % 2 === 0 ? 1 : -1;

  switch (mood) {
    case "focus-password":
      return side === "left"
        ? { rotate: -125, x: 22, y: -72, scale: 1.05 }
        : { rotate: 125, x: -22, y: -72, scale: 1.05 };
    case "peek":
      return side === "left"
        ? { rotate: -98, x: 14, y: -48 }
        : { rotate: 78, x: -8, y: -22 };
    case "focus-email":
      return side === "right"
        ? { rotate: -28, x: 28, y: -8 }
        : { rotate: 18, x: -6, y: 4 };
    case "focus-text":
      return side === "left"
        ? { rotate: -42 + w * 5, x: 10, y: 8 + (typingTick % 3) }
        : { rotate: 42 - w * 5, x: -10, y: 8 - (typingTick % 2) };
    case "loading":
      return side === "left"
        ? { rotate: -62, x: 8, y: 12 }
        : { rotate: 62, x: -8, y: 12 };
    case "error":
      return side === "left"
        ? { rotate: -145, x: 4, y: -42 }
        : { rotate: 145, x: -4, y: -42 };
    case "success":
    case "welcome":
      return side === "left"
        ? { rotate: -155, x: 0, y: -58 }
        : { rotate: 155, x: 0, y: -58 };
    default:
      // Confident contractor pose: left holds wrench, right waves
      return side === "left"
        ? { rotate: -38, x: -4, y: 6 }
        : { rotate: -118, x: 6, y: -12 };
  }
}

function pupilTarget(mood: AuthMascotMood, typingTick: number) {
  const w = typingTick % 2 === 0 ? 1 : -1;
  switch (mood) {
    case "focus-email":
      return { x: 5 + w, y: 1, scale: 1.06 };
    case "focus-text":
      return { x: w * 2, y: 2 + (typingTick % 3) * 0.4, scale: 1.1 };
    case "focus-password":
    case "peek":
      return { x: -1, y: 2, scale: 1 };
    case "error":
      return { x: 0, y: 0, scale: 0.82 };
    case "success":
    case "welcome":
      return { x: 0, y: -2, scale: 1.12 };
    default:
      return { x: Math.sin(typingTick * 0.35) * 1.5, y: Math.cos(typingTick * 0.3) * 1, scale: 1 };
  }
}

function Eye({
  cx,
  cy,
  mood,
  typingTick,
  blinking,
  hidden,
}: {
  cx: number;
  cy: number;
  mood: AuthMascotMood;
  typingTick: number;
  blinking: boolean;
  hidden?: boolean;
}) {
  const t = pupilTarget(mood, typingTick);
  if (hidden) return null;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <motion.ellipse
        animate={{ ry: blinking ? 1 : 7, rx: blinking ? 7 : 7 }}
        transition={{ duration: blinking ? 0.08 : 0.14 }}
        fill="#fff"
        stroke="#1e293b"
        strokeWidth="1.5"
        cx="0"
        cy="0"
        rx="7"
        ry="7"
      />
      {!blinking && (
        <>
          <motion.circle
            animate={{ cx: t.x, cy: t.y, r: t.scale * 3.2 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            fill="#1e293b"
          />
          <circle cx={t.x + 1.2} cy={t.y - 1.2} r="1.2" fill="#fff" opacity="0.9" />
        </>
      )}
    </g>
  );
}

function WorkGlove({ flip = 1 }: { flip?: number }) {
  return (
    <g transform={`scale(${flip}, 1)`}>
      <ellipse cx="0" cy="38" rx="11" ry="10" fill={GLOVE} />
      <rect x="-8" y="28" width="16" height="12" rx="4" fill={GLOVE} />
      <rect x="-5" y="0" width="10" height="30" rx="5" fill={GLOVE} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-7 + i * 3.5} y="42" width="3" height="10" rx="1.5" fill={GLOVE} />
      ))}
      <ellipse cx="6" cy="36" rx="3.5" ry="5" fill={GLOVE} transform="rotate(20)" />
    </g>
  );
}

function variantConfig(variant: AuthMascotVariant) {
  switch (variant) {
    case "contractor":
      return {
        badge: "PRO",
        badgeColor: "#F59E0B",
        showHardHat: true,
        showToolBelt: true,
        showWrench: true,
        showShield: false,
        showHome: false,
      };
    case "admin":
      return {
        badge: "STAFF",
        badgeColor: "#3B82F6",
        showHardHat: false,
        showToolBelt: false,
        showWrench: false,
        showShield: true,
        showHome: false,
      };
    default:
      return {
        badge: "FIX BRIDGE",
        badgeColor: ORANGE,
        showHardHat: false,
        showToolBelt: true,
        showWrench: false,
        showShield: false,
        showHome: true,
      };
  }
}

function FixBridgeProCharacter({
  mood,
  compact,
  focusField,
  typingTick,
  variant,
}: {
  mood: AuthMascotMood;
  compact?: boolean;
  focusField?: AuthMascotFocusField;
  typingTick?: number;
  variant: AuthMascotVariant;
}) {
  const tick = typingTick ?? 0;
  const coverEyes = mood === "focus-password";
  const peek = mood === "peek";
  const size = compact ? 0.55 : 1;
  const cfg = variantConfig(variant);
  const [blinking, setBlinking] = useState(false);
  const [hovered, setHovered] = useState(false);
  const bodyControls = useAnimationControls();
  const wrapRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-50, 50], [4, -4]), { stiffness: 160, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [-50, 50], [-6, 6]), { stiffness: 160, damping: 20 });

  const leftArm = armPose(mood, "left", tick);
  const rightArm = armPose(mood, "right", tick);
  const isTyping = tick > 0 && (Boolean(focusField) || mood.startsWith("focus"));

  useEffect(() => {
    if (tick <= 0) return;
    setBlinking(true);
    const t = window.setTimeout(() => setBlinking(false), 120);
    void bodyControls.start({ y: [0, -6, 0], transition: { duration: 0.22 } });
    return () => window.clearTimeout(t);
  }, [tick, bodyControls]);

  useEffect(() => {
    if (focusField || mood !== "idle") return;
    const id = window.setInterval(() => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), 110);
    }, 4500);
    return () => window.clearInterval(id);
  }, [focusField, mood]);

  const onPointerMove = (e: ReactPointerEvent) => {
    if (compact || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    mx.set(e.clientX - (rect.left + rect.width / 2));
    my.set(e.clientY - (rect.top + rect.height / 2));
  };

  return (
    <motion.div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
        setHovered(false);
      }}
      style={{
        scale: size,
        rotateX: compact ? 0 : rotateX,
        rotateY: compact ? 0 : rotateY,
        transformPerspective: 1000,
      }}
      className="relative mx-auto w-full max-w-[340px] select-none"
      aria-hidden
    >
      {/* Dribbble-style soft blobs */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[18%] h-48 w-48 -translate-x-1/2 rounded-full bg-[#FF4D1C]/20 blur-3xl"
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ repeat: Infinity, duration: 4.2, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute left-[15%] top-[35%] h-32 w-32 rounded-full bg-blue-400/15 blur-2xl"
        animate={{ x: [0, 12, 0], y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 5.5, ease: "easeInOut" }}
      />

      {/* Ground shadow */}
      <motion.div
        className="absolute bottom-[2%] left-1/2 h-4 w-[72%] -translate-x-1/2 rounded-[100%] bg-black/25 blur-md"
        animate={{
          scaleX: hovered || isTyping ? [1, 1.1, 1] : [1, 1.05, 1],
          opacity: [0.35, 0.5, 0.35],
        }}
        transition={{ repeat: Infinity, duration: 3.4, ease: "easeInOut" }}
      />

      <motion.div
        animate={
          mood === "error"
            ? { x: [0, -6, 6, -4, 4, 0] }
            : mood === "loading"
              ? { y: [0, -10, 0] }
              : isTyping
                ? { y: [0, -8, 0] }
                : { y: [0, -14, 0] }
        }
        transition={
          mood === "error"
            ? { duration: 0.45 }
            : mood === "loading"
              ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
              : isTyping
                ? { duration: 0.26 }
                : { repeat: Infinity, duration: 3.8, ease: "easeInOut" }
        }
      >
        <motion.div animate={bodyControls} className="relative aspect-[320/400] w-full">
          <svg viewBox="0 0 320 400" className="h-full w-full drop-shadow-[0_28px_48px_rgba(0,0,0,0.35)]">
            {/* Platform */}
            <ellipse cx="160" cy="368" rx="110" ry="14" fill="#0B1B3A" opacity="0.35" />
            <ellipse cx="160" cy="364" rx="95" ry="10" fill="#1e3a5f" opacity="0.5" />

            {/* Legs / boots */}
            <path d="M118 280 L108 360 L138 360 L142 280 Z" fill={NAVY_DARK} />
            <path d="M178 280 L174 360 L204 360 L194 280 Z" fill={NAVY_DARK} />
            <path d="M105 352 L141 352 L141 368 L105 368 Z" fill="#1e293b" rx="4" />
            <path d="M171 352 L207 352 L207 368 L171 368 Z" fill="#1e293b" />

            {/* Torso / jumpsuit */}
            <path
              d="M95 168 C95 148 120 138 160 138 C200 138 225 148 225 168 L232 278 C232 292 218 302 160 302 C102 302 88 292 88 278 Z"
              fill={`url(#jumpsuitGrad)`}
            />
            <path d="M118 168 L128 278 M202 168 L192 278" stroke={NAVY_DARK} strokeWidth="4" strokeLinecap="round" opacity="0.6" />

            {/* Tool belt */}
            {cfg.showToolBelt && (
              <>
                <rect x="98" y="248" width="124" height="16" rx="4" fill="#3d2914" />
                <rect x="108" y="252" width="18" height="10" rx="2" fill="#eab308" />
                <rect x="194" y="252" width="18" height="10" rx="2" fill="#eab308" />
                <circle cx="160" cy="256" r="6" fill="#64748b" stroke="#334155" strokeWidth="1.5" />
              </>
            )}

            {/* Chest badge */}
            <rect x="118" y="188" width="84" height="28" rx="8" fill={cfg.badgeColor} />
            <text
              x="160"
              y="207"
              textAnchor="middle"
              fill="#fff"
              fontSize="11"
              fontWeight="700"
              fontFamily="system-ui, sans-serif"
              letterSpacing="0.5"
            >
              {cfg.badge}
            </text>

            {/* Neck */}
            <rect x="144" y="148" width="32" height="18" rx="8" fill={SKIN} />

            {/* Head */}
            <ellipse cx="160" cy="118" rx="42" ry="44" fill={SKIN} />
            <ellipse cx="160" cy="128" rx="38" ry="32" fill={SKIN_SHADOW} opacity="0.15" />

            {/* Hair */}
            <path
              d="M118 108 C118 78 136 62 160 62 C184 62 202 78 202 108 C202 92 188 82 160 82 C132 82 118 92 118 108 Z"
              fill={HAIR}
            />
            {/* Beard */}
            <path
              d="M122 118 C122 148 138 162 160 162 C182 162 198 148 198 118 C194 136 178 148 160 148 C142 148 126 136 122 118 Z"
              fill={HAIR}
            />

            {/* Eyebrows */}
            <path d="M132 98 Q142 94 152 98" fill="none" stroke={HAIR} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M168 98 Q178 94 188 98" fill="none" stroke={HAIR} strokeWidth="2.5" strokeLinecap="round" />

            <defs>
              <linearGradient id="jumpsuitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a3a6b" />
                <stop offset="100%" stopColor={NAVY} />
              </linearGradient>
            </defs>

            {/* Hard hat */}
            {cfg.showHardHat && (
              <g>
                <path d="M112 88 C112 68 134 56 160 56 C186 56 208 68 208 88 L210 96 L110 96 Z" fill="#F59E0B" />
                <path d="M108 94 L212 94 L212 102 L108 102 Z" fill="#D97706" />
                <rect x="152" y="72" width="16" height="8" rx="2" fill="#FBBF24" />
              </g>
            )}

            {/* Eyes */}
            <Eye cx={142} cy={112} mood={mood} typingTick={tick} blinking={blinking} hidden={coverEyes} />
            <Eye cx={178} cy={112} mood={mood} typingTick={tick} blinking={blinking} hidden={coverEyes} />

            {peek && (
              <>
                <ellipse cx="142" cy="112" rx="6" ry="3.5" fill="#fff" stroke="#1e293b" strokeWidth="1" />
                <circle cx="143" cy="112" r="2" fill="#1e293b" />
                <circle cx="186" cy="116" r="2.5" fill="#1e293b" />
              </>
            )}

            {/* Smile */}
            <motion.path
              animate={{
                d:
                  mood === "error"
                    ? "M142 132 Q160 124 178 132"
                    : mood === "success" || mood === "welcome"
                      ? "M138 128 Q160 148 182 128"
                      : isTyping
                        ? "M144 132 Q160 138 176 132"
                        : "M142 130 Q160 142 178 130",
              }}
              fill="none"
              stroke="#8B5E3C"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Cheek blush */}
            <ellipse cx="128" cy="126" rx="8" ry="5" fill="#FF6B6B" opacity="0.2" />
            <ellipse cx="192" cy="126" rx="8" ry="5" fill="#FF6B6B" opacity="0.2" />

            {/* Left arm */}
            <motion.g
              style={{ transformOrigin: "108px 168px" }}
              animate={{ rotate: leftArm.rotate, x: leftArm.x, y: leftArm.y, scale: leftArm.scale ?? 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
            >
              <path d="M98 168 L78 220" stroke={NAVY} strokeWidth="18" strokeLinecap="round" />
              <g transform="translate(68, 218)">
                <WorkGlove flip={1} />
              </g>
              {cfg.showWrench && mood === "idle" && (
                <g transform="translate(58, 200) rotate(-35)">
                  <rect x="-4" y="0" width="8" height="36" rx="2" fill="#94a3b8" />
                  <path d="M-12 0 Q0 -14 12 0 L8 8 Q0 4 -8 8 Z" fill="#64748b" />
                </g>
              )}
            </motion.g>

            {/* Right arm */}
            <motion.g
              style={{ transformOrigin: "212px 168px" }}
              animate={{ rotate: rightArm.rotate, x: rightArm.x, y: rightArm.y, scale: rightArm.scale ?? 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
            >
              <path d="M222 168 L242 210" stroke={NAVY} strokeWidth="18" strokeLinecap="round" />
              <g transform="translate(252, 208)">
                <WorkGlove flip={-1} />
              </g>
            </motion.g>

            {/* Admin shield prop */}
            {cfg.showShield && mood === "idle" && (
              <g transform="translate(248, 188)">
                <path
                  d="M0 -18 L16 -8 L16 12 Q0 24 -16 12 L-16 -8 Z"
                  fill="#3B82F6"
                  stroke="#1d4ed8"
                  strokeWidth="2"
                />
                <path d="M0 -8 L0 10 M-6 2 L6 2" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            )}

            {/* Homeowner home icon */}
            {cfg.showHome && mood === "idle" && (
              <g transform="translate(54, 192)">
                <path d="M0 8 L14 -6 L28 8 L28 24 L0 24 Z" fill={ORANGE} opacity="0.95" />
                <rect x="10" y="14" width="8" height="10" rx="1" fill="#fff" opacity="0.9" />
              </g>
            )}

            {/* Sparkles */}
            {(mood === "idle" || mood === "success" || mood === "welcome") && (
              <motion.g animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.2, 0.9] }} transition={{ repeat: Infinity, duration: 2 }}>
                <path d="M268 72 L272 58 L276 72 L290 76 L276 80 L272 94 L268 80 L254 76 Z" fill={ORANGE} />
                <circle cx="48" cy="88" r="4" fill="#FBBF24" opacity="0.8" />
              </motion.g>
            )}

            {isTyping && !coverEyes && (
              <motion.text
                x="272"
                y="56"
                fontSize="18"
                fill={ORANGE}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                ✦
              </motion.text>
            )}

            {mood === "loading" && (
              <g transform="translate(248, 56)">
                {[0, 1, 2].map((i) => (
                  <motion.circle
                    key={i}
                    cx={i * 12}
                    cy="0"
                    r="4"
                    fill={ORANGE}
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.85, delay: i * 0.14 }}
                  />
                ))}
              </g>
            )}
          </svg>
        </motion.div>
      </motion.div>

      {!compact && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-center text-xs font-medium tracking-wide text-white/50"
        >
          {variant === "contractor" ? "Your pro portal" : variant === "admin" ? "Staff access" : "Trusted local pros"}
        </motion.p>
      )}
    </motion.div>
  );
}

export default function AuthMascot({ variant, mood, compact, focusField, typingTick }: Props) {
  const ctx = useAuthMascotOptional();
  const resolvedFocus = focusField ?? ctx?.focusField ?? null;
  const resolvedTick = typingTick ?? ctx?.typingTick ?? 0;

  return (
    <div className={`flex w-full flex-col items-center ${compact ? "max-w-[200px]" : "max-w-[360px]"}`}>
      <FixBridgeProCharacter
        variant={variant}
        mood={mood}
        compact={compact}
        focusField={resolvedFocus}
        typingTick={resolvedTick}
      />
    </div>
  );
}
