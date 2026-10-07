import { useState } from "react";
import { homeownerServiceArtwork } from "./homeownerServiceArtworkMap";
import HomeownerServiceIcon from "./HomeownerServiceIcon";

// Local licensed service photos, with decorative category icons if a file fails.

export default function HomeownerServiceArtwork({ name, serviceId, category, sizes, decorative = false, className = "" }: {
  name: string;
  serviceId?: string | null;
  category?: string | null;
  sizes?: string;
  decorative?: boolean;
  className?: string;
}) {
  const { id, src, srcSet, alt, mapped } = homeownerServiceArtwork(name, serviceId, category);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showArtwork = Boolean(src && failedSrc !== src);
  return (
    <span aria-hidden={decorative || !showArtwork ? true : undefined} data-service-artwork={name} data-service-photo-id={id || undefined} data-artwork-mapped={mapped} className={`service-reviewed-artwork ${showArtwork ? "service-photo-artwork" : "service-designed-artwork"} ${className}`}>
      {showArtwork ? (
        <img src={src!} srcSet={srcSet} sizes={sizes || (className.includes("service-detail-image") ? "(max-width: 600px) 90vw, 640px" : "(max-width: 360px) 90vw, (max-width: 600px) 45vw, (max-width: 1100px) 30vw, 320px")} width={480} height={320} alt={decorative ? "" : alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      ) : (
        <><span className="service-illustration-ring" /><HomeownerServiceIcon name={name} className="service-illustration-symbol" /><span className="service-illustration-line" /></>
      )}
    </span>
  );
}
