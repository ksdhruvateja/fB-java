import { Download, Mail, Megaphone } from "lucide-react";
import { brand } from "../../config/brand";
import { ContentSection, FeatureGrid, PageHero, PrimaryButton, SecondaryButton } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

const LOGOS = [
  { label: "Logo lockup (color)", href: brand.logoLockupUrl, dark: true },
  { label: "Logo lockup (black)", href: brand.logoLockupBlackUrl, dark: false },
  { label: "Brand mark", href: brand.logoMarkUrl, dark: false },
];

export default function PressPage({ actions, onContactPress }: { actions: PublicPageActions; onContactPress: () => void }) {
  return (
    <>
      <PageHero
        eyebrow="Press & media"
        title={<>{brand.productName} <span className="text-primary">for media.</span></>}
        intro={`Background on ${brand.productName}, our mission and our technology, plus how to reach us for media inquiries.`}
      >
        <PrimaryButton light onClick={onContactPress}>Media inquiry</PrimaryButton>
        <SecondaryButton light onClick={actions.openAbout}>About {brand.productName}</SecondaryButton>
      </PageHero>

      <ContentSection label="Company overview" title={`What ${brand.productName} is`}>
        <div className="grid max-w-4xl gap-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          <p>
            {brand.productName} is an AI-powered home repair and property care platform for homeowners in the United States. It brings repair guidance, verified professionals and a home’s records together in one place.
          </p>
          <p>
            Homeowners describe a problem and add photos, then choose between a Fixera AI assessment — with guided DIY steps when a repair is safe to do yourself — or a request for a verified professional. Payments, quotes, job tracking and property history stay in the same account.
          </p>
        </div>
      </ContentSection>

      <ContentSection muted label="Mission and technology" title="Real help. A more livable you.">
        <FeatureGrid
          items={[
            { title: "Our mission", body: "Make maintaining a home simpler, faster and more transparent — from understanding what is wrong to getting it fixed." },
            { title: "Fixera", body: `The assistant built into ${brand.productName}. It assesses repairs from photos and descriptions, checks each one for its actual risk, and hands the job to a professional when that is the safer path.` },
            { title: "Safety first", body: "AI guidance is informational, comes with clear safety limits, and never replaces a professional where one is needed." },
          ]}
        />
      </ContentSection>

      <ContentSection label="Announcements" right="Newsroom">
        <div className="flex flex-col items-start gap-3 border border-dashed border-border p-8 sm:p-10">
          <Megaphone className="h-6 w-6 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">No announcements yet</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Official {brand.productName} announcements and press releases will be published here.
          </p>
        </div>
      </ContentSection>

      <ContentSection muted label="Brand assets" title="Logos">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LOGOS.map((logo) => (
            <li key={logo.label} className="flex flex-col border border-border bg-background">
              <div className={`flex h-32 items-center justify-center p-6 ${logo.dark ? "bg-black" : "bg-white"}`}>
                <img src={logo.href} alt={`${brand.productName} ${logo.label}`} className="max-h-16 max-w-full object-contain" loading="lazy" />
              </div>
              <a href={logo.href} download className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm font-medium hover:text-primary">
                {logo.label} <Download size={15} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Please do not alter, recolor or distort the logos.</p>
      </ContentSection>

      <ContentSection label="Media contact" title="Get in touch">
        <div className="flex flex-col gap-4 border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              For interviews, information or media requests, send an inquiry through our contact form and choose “Press &amp; Media”, or email{" "}
              <a className="font-medium text-foreground underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
            </span>
          </p>
          <PrimaryButton onClick={onContactPress}>Media inquiry</PrimaryButton>
        </div>
      </ContentSection>
    </>
  );
}
