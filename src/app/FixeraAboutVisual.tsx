import { ArrowRight } from "lucide-react";
import "./fixeraAbout.css";

export function FixeraAboutVisual({ onGetStarted }: { onGetStarted?: () => void }) {
  return (
    <section className="fixera-about-visual" aria-labelledby="fixera-about-heading">
      <div className="fixera-about-kicker"><p>MEET FIXERA</p><span>Your home, in context</span></div>
      <h3 id="fixera-about-heading">A little context.<br /><em>A clearer next step.</em></h3>
      <figure className="fixera-about-photograph">
        <img src="/brand/service-photos/flooring-960.webp" srcSet="/brand/service-photos/flooring-480.webp 480w, /brand/service-photos/flooring-960.webp 960w" sizes="(min-width:1024px) 40vw, 90vw" width="960" height="640" alt="Sunlight falling across a home's hardwood floor and bay windows" loading="lazy" />
        <figcaption><span>Every home has its own context.</span><a href="/brand/service-photos/credits.html#flooring" target="_blank" rel="noopener noreferrer">Photo credit</a></figcaption>
      </figure>
      <ol className="fixera-about-steps">
        <li><span aria-hidden="true">01</span><div><strong>Start with your home</strong><p>Select your property, describe the issue and add photos if helpful.</p></div></li>
        <li><span aria-hidden="true">02</span><div><strong>Make sense of the issue</strong><p>With an active HomeCare plan, review an assessment informed by your inputs and available property history.</p></div></li>
        <li><span aria-hidden="true">03</span><div><strong>Move forward</strong><p>Review appropriate guidance or carry the same issue into a professional service request.</p></div></li>
      </ol>
      <button type="button" onClick={onGetStarted} className="fixera-about-action">Describe your issue <ArrowRight size={19} aria-hidden="true" /></button>
    </section>
  );
}
