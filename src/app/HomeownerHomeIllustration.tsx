/** Decorative artwork only: this is not a scan or digital twin of the selected property. */
export default function HomeownerHomeIllustration() {
  return (
    <figure className="homeowner-home-scene" aria-label="Illustrative home, not your property's floor plan">
      <svg viewBox="0 0 520 330" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="home-floor" x1="140" y1="200" x2="350" y2="290" gradientUnits="userSpaceOnUse"><stop stopColor="#DFBD91" /><stop offset="1" stopColor="#C79B69" /></linearGradient>
          <linearGradient id="home-wall" x1="160" y1="100" x2="340" y2="250" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFDF7" /><stop offset="1" stopColor="#DEDCD3" /></linearGradient>
          <linearGradient id="home-roof" x1="180" y1="62" x2="360" y2="157" gradientUnits="userSpaceOnUse"><stop stopColor="#EEA65D" /><stop offset="1" stopColor="#C9793C" /></linearGradient>
          <filter id="home-shadow" x="0" y="0" width="520" height="330" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="10" /></filter>
        </defs>
        <ellipse cx="264" cy="277" rx="143" ry="19" fill="#7F6B52" opacity=".12" filter="url(#home-shadow)" />
        <g stroke="currentColor" opacity=".08"><path d="M30 236 244 113 478 246M47 261 261 138 495 271M72 286 286 163 501 287M74 218 304 351M123 192 353 325M172 165 402 298M221 136 451 269" /></g>
        <path d="m117 226 155-90 151 87-155 91z" fill="url(#home-floor)" stroke="#B18A61" strokeWidth="2" />
        <path d="M117 226v-94l155-89v94z" fill="url(#home-wall)" stroke="#CCC8BF" strokeWidth="2" />
        <path d="m272 43 151 87v94l-151-87z" fill="#E3E0D7" stroke="#CCC8BF" strokeWidth="2" />
        <path d="m115 132 59-87 98-56 64 88-63 61z" fill="url(#home-roof)" transform="translate(0 43)" stroke="#B87843" strokeWidth="2" />
        <path d="m174 88 64 88 98-56-64-88z" fill="#F3BC7A" stroke="#CE945E" strokeWidth="2" />
        <path d="m272 137 79 46-79 45-77-46z" fill="#F5E4CD" stroke="#CBB89D" />
        <path d="m194 182 78 46v56l-78-46z" fill="#F7F4EC" stroke="#D5CFC2" />
        <path d="m272 228 79-45v56l-79 45z" fill="#DAD5CB" stroke="#C6BFB2" />
        <path d="m138 168 37-22v45l-37 22z" fill="#A6BFC6" stroke="#F7F8F2" strokeWidth="5" />
        <path d="m305 119 45 26v44l-45-26z" fill="#A6BFC6" stroke="#F7F8F2" strokeWidth="5" />
        <path d="m149 244 46-27 36 21-46 27z" fill="#D78B5C" />
        <path d="m149 231 46-27v14l-46 27z" fill="#E7AD7A" /><path d="m195 204 36 21v14l-36-21z" fill="#C5784A" />
        <path d="m313 255 29-17 25 15-29 17z" fill="#F6F1E6" /><path d="m313 255 25 15v11l-25-15z" fill="#D1C5AF" /><path d="m338 270 29-17v11l-29 17z" fill="#BBB39E" />
        <path d="m364 197 23-14v41l-23 14z" fill="#7B937A" /><path d="m363 197 12-30 14 16-12 26z" fill="#A9B99B" />
        <g className="homeowner-scene-connections" stroke="#D8833B" strokeWidth="1.5" strokeDasharray="4 6" opacity=".7"><path d="M151 245H67v-59H29M350 168h84v-68h50M336 269h99v22h49" /></g>
        <g fill="#D8833B"><circle cx="151" cy="245" r="4" /><circle cx="350" cy="168" r="4" /><circle cx="336" cy="269" r="4" /></g>
        <g className="homeowner-scene-card"><rect x="20" y="150" width="110" height="43" rx="13" fill="var(--card)" stroke="var(--border)" /><path d="m35 171 5-5 5 5m-8-3v10h6v-10" stroke="#C77939" strokeWidth="1.5" /><text x="54" y="176" fill="var(--foreground)" fontSize="12" fontFamily="inherit">Services</text></g>
        <g className="homeowner-scene-card"><rect x="357" y="65" width="146" height="43" rx="13" fill="var(--card)" stroke="var(--border)" /><path d="M371 80h10v15h-10zM374 84h4m-4 4h4" stroke="#C77939" strokeWidth="1.5" /><text x="389" y="91" fill="var(--foreground)" fontSize="12" fontFamily="inherit">Property Passport</text></g>
      </svg>
      <figcaption>Home illustration</figcaption>
    </figure>
  );
}
