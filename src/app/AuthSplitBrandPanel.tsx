import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { brand } from "../config/brand";
import { AUTH_ROLE_PHOTOS } from "./authRoleAssets";

export type AuthSplitRole = "homeowner" | "contractor" | "admin";

function ScallopEdge() {
  return (
    <div
      className="pointer-events-none absolute -right-3 top-0 z-20 hidden h-full w-6 flex-col justify-evenly py-3 lg:flex"
      aria-hidden
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="h-9 w-9 shrink-0 rounded-full bg-white shadow-[2px_0_8px_rgba(0,0,0,0.04)]" />
      ))}
    </div>
  );
}

export default function AuthSplitBrandPanel({
  role,
  title,
  subtitle,
  body,
  onHome,
  footer,
}: {
  role: AuthSplitRole;
  title: string;
  subtitle?: string;
  body: string;
  onHome?: () => void;
  footer?: ReactNode;
}) {
  const photo = AUTH_ROLE_PHOTOS[role];

  const logo = (
    <BrandLogo variant="auth" tone="color" className="brightness-0 invert drop-shadow-sm" />
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img
        src={photo}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/92 via-primary/78 to-[#0B1B3A]/88"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, white 0%, transparent 45%)",
        }}
        aria-hidden
      />
      <BrandLogo
        variant="mark"
        tone="color"
        className="pointer-events-none absolute -bottom-16 -right-10 h-56 w-56 opacity-[0.08] brightness-0 invert"
      />

      <ScallopEdge />

      <div className="relative z-10 flex min-h-screen flex-col px-8 py-10 xl:px-12">
        <div>
          {onHome ? (
            <button
              type="button"
              onClick={onHome}
              className="rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label={`${brand.productName} home`}
            >
              {logo}
            </button>
          ) : (
            logo
          )}
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <p className="text-sm font-medium text-white/90">Welcome to</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{brand.productName}</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
            {subtitle || "Home services, simplified"}
          </p>
          <p className="mt-6 max-w-md text-base font-semibold leading-snug text-white sm:text-lg">{title}</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-[15px]">{body}</p>
        </div>

        {footer ? <div className="text-xs text-white/60">{footer}</div> : null}
      </div>
    </div>
  );
}
