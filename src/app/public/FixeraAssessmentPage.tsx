import { Camera, CircleDollarSign, HardHat, ListChecks, MessageCircle, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { ContentSection, CtaBand, FeatureGrid, Notice, PageHero, PrimaryButton, SecondaryButton, StepGrid } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

export default function FixeraAssessmentPage({ actions }: { actions: PublicPageActions }) {
  return (
    <>
      <PageHero
        eyebrow="Fixera AI assessment"
        title={<>Understand the repair <span className="text-primary">before you decide.</span></>}
        intro="Fixera is the assistant built into FixBridge. Show it the problem, and it explains what may be happening, whether it is safe to fix yourself, and what to do next."
      >
        <PrimaryButton light onClick={actions.startRequest}>Start an assessment</PrimaryButton>
        <SecondaryButton light onClick={actions.seePlans}>See HomeCare Pro plans</SecondaryButton>
      </PageHero>

      <ContentSection label="What Fixera does" right="Capabilities" title="An assessment built around your repair">
        <FeatureGrid
          items={[
            { icon: <Camera size={18} aria-hidden />, title: "Photo-based assessment", body: "Upload up to five photos. Fixera describes the visible signs, the likely causes and what to confirm. If a photo is unclear, it asks for a better one instead of guessing." },
            { icon: <ShieldCheck size={18} aria-hidden />, title: "Risk-based safety check", body: "Each repair is judged on its actual hazards — such as electrical, gas, water near power or working at height — not just its category. When there is a concern, you see what is safe to do and what needs a professional." },
            { icon: <ListChecks size={18} aria-hidden />, title: "Guided DIY steps", body: "When DIY is appropriate, Fixera gives step-by-step instructions with what to expect after each step and when to stop." },
            { icon: <Wrench size={18} aria-hidden />, title: "Tools and parts", body: "A list of the tools and parts the repair usually needs, with an approximate DIY parts cost. It is a rough estimate, not a quote." },
            { icon: <MessageCircle size={18} aria-hidden />, title: "Ask as you go", body: "A DIY chat for questions about the current step. If something looks different, add details or photos and Fixera reassesses." },
            { icon: <HardHat size={18} aria-hidden />, title: "Professional help when needed", body: "Request a professional at any point. Your description, photos and assessment move into the service request." },
          ]}
        />
      </ContentSection>

      <ContentSection muted label="How it works" right="4 steps" title="From photo to next step">
        <StepGrid
          columns={4}
          steps={[
            { title: "Describe and photograph the issue", body: "Tell Fixera what is happening and add photos from different angles." },
            { title: "Review the assessment", body: "See what Fixera found, its safety rating, and any questions it has." },
            { title: "Choose DIY or a professional", body: "Follow guided steps when they are appropriate, or request a verified professional." },
            { title: "Keep the record", body: "Completed repairs can add follow-up maintenance reminders to your property." },
          ]}
        />
      </ContentSection>

      <ContentSection label="Membership" right="HomeCare Pro" title="Included with HomeCare Pro">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Fixera AI assessments, reassessments and DIY chat require an active HomeCare Pro subscription. Without one, you can still hire a verified professional through FixBridge for any request.
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2"><RefreshCw size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /> Assessments use your property details and repair history.</li>
              <li className="flex items-start gap-2"><CircleDollarSign size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden /> Plan pricing and features are listed on the HomeCare Pro page.</li>
            </ul>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <PrimaryButton onClick={actions.seePlans}>See HomeCare Pro plans</PrimaryButton>
              <SecondaryButton onClick={() => actions.openPage("how-it-works")}>How FixBridge works</SecondaryButton>
            </div>
          </div>
          <Notice tone="safety">
            <strong className="mb-2 block">Important safety information</strong>
            Fixera provides informational guidance based on the photos and details you share. It is not a professional diagnosis, inspection or guarantee, and it cannot see inside walls, measure electrical values or detect gas. Only perform steps you understand and can complete safely, and stop if conditions differ from the assessment. In an emergency — a gas smell, carbon monoxide alarm, electrical sparking, flooding or fire — leave the area if needed and contact emergency services or your utility.
          </Notice>
        </div>
      </ContentSection>

      <CtaBand title="Have a repair in mind?" body="Describe it and get a Fixera assessment, or hire a professional.">
        <PrimaryButton light onClick={actions.startRequest}>Start an assessment</PrimaryButton>
        <SecondaryButton light onClick={() => actions.openPage("find-a-contractor")}>Hire a professional</SecondaryButton>
      </CtaBand>
    </>
  );
}
