import { BadgeCheck, CalendarClock, ClipboardList, FileCheck2, Receipt, ShieldCheck } from "lucide-react";
import { HOMEOWNER_SERVICES } from "../homeownerCategories";
import { ContentSection, CtaBand, FeatureGrid, Notice, PageHero, PrimaryButton, SecondaryButton, StepGrid } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

// The request form's own service list, minus near-duplicates and the catch-all.
const CATEGORIES = HOMEOWNER_SERVICES.filter((s) => s !== "Other" && s !== "Landscaping & Yard");

export default function FindContractorPage({ actions }: { actions: PublicPageActions }) {
  return (
    <>
      <PageHero
        eyebrow="Find a contractor"
        title={<>The right professional, <span className="text-primary">without the runaround.</span></>}
        intro="Describe the job once. FixBridge handles matching, scheduling, quotes and payment with a contractor whose credentials have been reviewed."
      >
        <PrimaryButton light onClick={actions.startRequest}>Request a professional</PrimaryButton>
        <SecondaryButton light onClick={() => actions.openPage("how-it-works")}>How it works</SecondaryButton>
      </PageHero>

      <ContentSection label="Services" right={`${CATEGORIES.length} categories`} title="What you can request" intro="Choose the service that fits when you start a request. If you are not sure, describe the problem and choose the closest option or “Other”.">
        <ul className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <li key={category} className="border border-border bg-card px-3 py-2 text-sm text-foreground">
              {category}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Availability depends on your location and contractor coverage in your area.</p>
      </ContentSection>

      <ContentSection muted label="The process" right="5 steps" title="How a professional request works">
        <StepGrid
          steps={[
            { title: "Describe the job", body: "Choose the service, describe the problem, add photos and confirm the property address." },
            { title: "Review the estimate", body: "When enough information is available, you see a market estimate for your area. It is a guide, not a final price." },
            { title: "Schedule and authorize", body: "Pick a preferred time and review the fees shown before authorizing the visit." },
            { title: "Get matched", body: "FixBridge assigns a contractor for your trade and area and keeps you updated as the request moves forward." },
            { title: "Approve, then work begins", body: "You receive a final quote to approve before any work starts. Payment and job tracking stay in FixBridge." },
          ]}
        />
      </ContentSection>

      <ContentSection label="Trust" right="Verification" title="How contractors are reviewed">
        <FeatureGrid
          items={[
            { icon: <FileCheck2 size={18} aria-hidden />, title: "Documents submitted up front", body: "Contractors provide their license, insurance and identification and tax documents when they apply." },
            { icon: <BadgeCheck size={18} aria-hidden />, title: "Reviewed before assignment", body: "The FixBridge team reviews a contractor’s documents before they can be assigned work." },
            { icon: <CalendarClock size={18} aria-hidden />, title: "Expiration tracking", body: "FixBridge tracks document expiration dates and alerts contractors before their documents lapse." },
            { icon: <ClipboardList size={18} aria-hidden />, title: "Your details travel with the job", body: "Your description, photos and any Fixera assessment go to the contractor, so you do not repeat yourself." },
            { icon: <Receipt size={18} aria-hidden />, title: "Quote approval", body: "Work begins only after you approve the final quote." },
            { icon: <ShieldCheck size={18} aria-hidden />, title: "Support when you need it", body: "Reach FixBridge support from your dashboard if anything about a job goes wrong." },
          ]}
        />
        <div className="mt-6">
          <Notice>
            Licensing requirements differ by state and trade. If your job needs a permit or a specific license, ask your contractor to confirm it before work begins.
          </Notice>
        </div>
      </ContentSection>

      <CtaBand title="Need a professional?" body="Hiring through FixBridge is available to every homeowner — no subscription required.">
        <PrimaryButton light onClick={actions.startRequest}>Request a professional</PrimaryButton>
        <SecondaryButton light onClick={actions.joinAsContractor}>I’m a contractor</SecondaryButton>
      </CtaBand>
    </>
  );
}
