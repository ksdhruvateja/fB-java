import { Camera, House, Sparkles, Wrench, ArrowUpRight } from "lucide-react";
import "./fixeraAbout.css";

export function FixeraAboutVisual() {
  return (
    <figure className="fixera-about-visual">
      <div className="fixera-about-eyebrow"><Sparkles size={14} /> MEET FIXERA <span>Connected to your home</span></div>
      <div className="fixera-about-scene" aria-hidden="true">
        <svg viewBox="0 0 500 260" className="fixera-about-art" fill="none">
          <defs>
            <linearGradient id="fixera-about-gold" x1="175" y1="70" x2="300" y2="210" gradientUnits="userSpaceOnUse"><stop stopColor="#F8BC53" /><stop offset="1" stopColor="#E75423" /></linearGradient>
          </defs>
          <ellipse cx="250" cy="151" rx="200" ry="94" stroke="currentColor" strokeOpacity=".09" />
          <ellipse cx="250" cy="151" rx="148" ry="67" stroke="currentColor" strokeOpacity=".07" />
          <path d="M65 172C125 172 150 150 205 150M294 150C350 150 366 101 438 101M294 150C350 150 366 203 438 203" stroke="#EC9650" strokeOpacity=".5" strokeDasharray="3 7" className="fixera-about-flow" />
          <ellipse cx="250" cy="228" rx="76" ry="12" fill="#BC7533" fillOpacity=".1" />
          <path d="M190 121L250 75L310 121V209H190Z" fill="url(#fixera-about-gold)" fillOpacity=".13" stroke="#B9793E" strokeWidth="2" strokeLinejoin="round" />
          <path d="M180 130L250 75L320 130M272 92V71H294V111" stroke="#CD6739" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M239 209V168H263V209M207 143H225V161H207ZM276 143H294V161H276Z" stroke="#B9793E" strokeWidth="2" />
          <circle cx="250" cy="145" r="25" fill="url(#fixera-about-gold)" />
          <path d="M250 132L253 141L262 145L253 148L250 158L247 148L238 145L247 141Z" fill="#FFF9EB" />
          <circle cx="250" cy="145" r="34" stroke="#E79342" strokeOpacity=".35" className="fixera-about-halo" />
          <circle cx="67" cy="172" r="5" fill="#ED9B47" /><circle cx="438" cy="101" r="5" fill="#ED9B47" /><circle cx="438" cy="203" r="5" fill="#ED9B47" />
          <path d="M347 57V71M340 64H354M148 82V92M143 87H153" stroke="#EAA345" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="fixera-about-chip fixera-about-home"><House size={14} /> Your home</span>
        <span className="fixera-about-chip fixera-about-photo"><Camera size={14} /> Photos, if helpful</span>
        <span className="fixera-about-chip fixera-about-next"><Wrench size={14} /> Clear next steps</span>
      </div>
      <figcaption>
        <span className="fixera-about-caption-mark"><Sparkles size={18} /></span>
        <div><strong>Your context. A clearer next step.</strong><p>From understanding an issue to finding the right kind of help.</p></div>
        <ArrowUpRight size={20} aria-hidden="true" />
      </figcaption>
    </figure>
  );
}
