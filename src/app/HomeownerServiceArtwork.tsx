import { useState } from "react";
import { homeownerServiceArtwork } from "./homeownerServiceArtworkMap";
import HomeownerServiceIcon from "./HomeownerServiceIcon";

// Visually inspected bundled illustrations only. This gallery does not imply
// photos of a booked professional. Watermarked, unrelated and unknown artwork
// uses a native category illustration instead; original files stay unchanged.

export default function HomeownerServiceArtwork({ name, className = "" }: {
  name: string;
  className?: string;
}) {
  const { src, mapped } = homeownerServiceArtwork(name);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showArtwork = Boolean(src && failedSrc !== src);
  return (
    <span aria-hidden="true" data-service-artwork={name} data-artwork-mapped={mapped} className={`service-reviewed-artwork ${showArtwork ? "" : "service-designed-artwork"} ${className}`}>
      {showArtwork ? (
        <img src={src!} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      ) : (
        <><span className="service-illustration-ring" /><HomeownerServiceIcon name={name} className="service-illustration-symbol" /><span className="service-illustration-line" /></>
      )}
    </span>
  );
}
