import { Bot, ClipboardCheck, CreditCard, FileText, HardHat, House, MapPinned, Sparkles } from "lucide-react";
import { brand } from "../../config/brand";
import { ContentSection, CtaBand, FeatureGrid, Notice, PageHero, PrimaryButton, SecondaryButton, StepGrid } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

const START_STEPS = [
  {
    title: "Create your account and add your property",
    body: "Sign up as a homeowner and add your property address. The address is used to match local pricing and service providers.",
  },
  {
    title: "Choose a service and describe the issue",
    body: "Pick the service or area of the home, describe what is happening, and add up to five photos — a close-up, a wider shot and any model label help most.",
  },
  {
    title: "Decide how you want to handle it",
    body: "Choose a Fixera AI assessment to understand the problem and see whether it is safe to fix yourself, or go straight to hiring a verified professional.",
  },
];

const AI_STEPS = [
  { title: "Fixera reviews your photos and description", body: "It describes what it can see, the likely causes, and asks follow-up questions or clearer photos when it needs them." },
  { title: "A safety check on the actual risk", body: "Each repair is rated for its real hazards. If a concern is found, you see what is safe to do and what must be left to a professional before continuing." },
  { title: "Guided DIY when it is appropriate", body: "Step-by-step instructions, the tools and parts you may need, an approximate parts cost, and a DIY chat for questions along the way." },
  { title: "Switch to a professional at any time", body: "If a step does not go as expected, stop and request a professional. Your assessment and photos carry over so you do not start again." },
];

const PRO_STEPS = [
  { title: "Your request reaches FixBridge", body: "Your description, photos and property details become a service request. A market estimate for your area is shown when one is available." },
  { title: "Schedule and authorize the visit", body: "Choose a preferred time and review the fees shown before you authorize dispatch. Nothing is dispatched until you request professional service." },
  { title: "A verified contractor is assigned", body: "FixBridge assigns a contractor whose license, insurance and documents have been reviewed, and you can follow the request as it moves forward." },
  { title: "Approve the final quote", body: "You receive a final quote to approve before any work begins. The estimate shown earlier is a guide, not a final bill." },
  { title: "Pay and track the job", body: "Payments are handled through FixBridge. Track each stage — submitted, reviewed, provider assigned, on the way, work started and completed." },
  { title: "Confirm the work is done", body: "When the job is finished, review the completion details. The repair is added to your property's history." },
];

export default function HowItWorksPage({ actions }: { actions: PublicPageActions }) {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={<>From “something’s wrong” <span className="text-primary">to fixed.</span></>}
        intro={`${brand.productName} brings repair guidance, verified professionals and your home’s records into one place. Here is the full experience, step by step.`}
      >
        <PrimaryButton light onClick={actions.startRequest}>Start a request</PrimaryButton>
        <SecondaryButton light onClick={() => actions.openPage("fixera-assessment")}>About Fixera AI</SecondaryButton>
      </PageHero>

      <ContentSection label="Getting started" right="3 steps" title="Tell us about your home and the problem">
        <StepGrid steps={START_STEPS} />
      </ContentSection>

      <ContentSection
        muted
        label="Two paths"
        right="Your choice"
        title="AI-guided help or a verified professional"
        intro="These are two different services. Fixera gives informational guidance so you can understand a repair and decide what to do. Hiring a professional sends a verified contractor to do the work."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-6">
            <span className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
              <Sparkles size={14} aria-hidden /> Fixera AI assessment
            </span>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              Understand the problem, its likely cause and whether it is safe to do yourself. Included with HomeCare Pro.
            </p>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li>• Photo-based assessment and follow-up questions</li>
              <li>• Safety rating and guardrails</li>
              <li>• Guided DIY steps, tools and parts cost</li>
              <li>• Not a professional inspection or a guarantee</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-background p-6">
            <span className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
              <HardHat size={14} aria-hidden /> Hire a verified professional
            </span>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              A reviewed contractor diagnoses and completes the work. Available to every homeowner, with or without a subscription.
            </p>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li>• Market estimate for your area</li>
              <li>• You authorize the visit and approve the final quote</li>
              <li>• Payment and tracking through FixBridge</li>
              <li>• Work recorded in your property history</li>
            </ul>
          </div>
        </div>
      </ContentSection>

      <ContentSection label="AI-guided path" right="HomeCare Pro" title="How a Fixera assessment works">
        <StepGrid steps={AI_STEPS} columns={4} />
        <div className="mt-6">
          <Notice tone="safety">
            Fixera’s guidance is informational and based on the photos and details you provide. It cannot see inside walls or replace an on-site inspection. Stop any repair that feels unsafe, and for emergencies — gas smell, electrical sparking, flooding — contact the appropriate emergency service or utility first.
          </Notice>
        </div>
      </ContentSection>

      <ContentSection muted label="Professional path" right="6 steps" title="How hiring a professional works">
        <StepGrid steps={PRO_STEPS} />
      </ContentSection>

      <ContentSection label="After the repair" title="Your home keeps its history">
        <FeatureGrid
          items={[
            { icon: <House size={18} aria-hidden />, title: "Property Passport", body: "Your home’s systems, documents and repair history in one place, so every assessment and service request has context." },
            { icon: <ClipboardCheck size={18} aria-hidden />, title: "Maintenance reminders", body: "Completed repairs can add follow-up checks to your maintenance calendar, such as confirming a repair is holding." },
            { icon: <FileText size={18} aria-hidden />, title: "Documents", body: "Keep quotes, invoices and property documents with the home they belong to." },
            { icon: <CreditCard size={18} aria-hidden />, title: "Payments", body: "See transactions for your service requests in one place." },
            { icon: <MapPinned size={18} aria-hidden />, title: "Job tracking", body: "Follow each request from submission to completion, with updates along the way." },
            { icon: <Bot size={18} aria-hidden />, title: "Home Assistant", body: "Ask questions about your home and get pointed to the right next step." },
          ]}
        />
      </ContentSection>

      <CtaBand title="Ready when something breaks." body="Describe the problem and choose the help you want.">
        <PrimaryButton light onClick={actions.startRequest}>Start a request</PrimaryButton>
        <SecondaryButton light onClick={actions.seePlans}>HomeCare Pro plans</SecondaryButton>
      </CtaBand>
    </>
  );
}
