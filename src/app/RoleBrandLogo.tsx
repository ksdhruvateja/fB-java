import { BrandLogo } from "./BrandLogo";
import { brand } from "../config/brand";
import "./roleBrandLogo.css";

/** Preserve the authentic color lockup with a consistent contrast backing. */
export default function RoleBrandLogo({ onHome, label = "Go to dashboard", className = "" }: {
  onHome?: () => void; label?: string; className?: string;
}) {
  const logo = <BrandLogo variant="auth" tone="color" />;
  return onHome ? (
    <button type="button" onClick={onHome} aria-label={label}
      className={`role-brand-logo ${className}`}>{logo}</button>
  ) : <span className={`role-brand-logo ${className}`} aria-label={brand.productName}>{logo}</span>;
}
