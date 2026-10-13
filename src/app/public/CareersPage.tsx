import { Briefcase, Compass, HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import { brand } from "../../config/brand";
import { ContentSection, FeatureGrid, PageHero, PrimaryButton, SecondaryButton } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

type Opening = { title: string; team: string; location: string; type: string; summary: string };

/** Add real openings here; the page lists them automatically. Keep empty when nothing is open. */
const OPENINGS: Opening[] = [];

export default function CareersPage({ actions, onContact }: { actions: PublicPageActions; onContact: () => void }) {
  return (
    <>
      <PageHero
        eyebrow="Careers"
        title={<>Build the future of <span className="text-primary">home care.</span></>}
        intro={`${brand.productName} is building one place where homeowners understand repairs, get trusted help and keep their home’s history.`}
      >
        <SecondaryButton light onClick={actions.openAbout}>About {brand.productName}</SecondaryButton>
      </PageHero>

      <ContentSection label="Our mission" title="Real help. A more livable you.">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          We combine practical repair knowledge, safety-first AI and a network of reviewed professionals so that taking care of a home is simpler for homeowners and better organized for contractors.
        </p>
      </ContentSection>

      <ContentSection muted label="How we work" title="What we value">
        <FeatureGrid
          items={[
            { icon: <ShieldCheck size={18} aria-hidden />, title: "Safety and honesty", body: "We tell homeowners what we know and what we do not, and we put safety ahead of convenience." },
            { icon: <HeartHandshake size={18} aria-hidden />, title: "Respect for both sides", body: "Homeowners and contractors both need to come out ahead. We design for both." },
            { icon: <Sparkles size={18} aria-hidden />, title: "Useful technology", body: "AI should solve a real problem in a real home, with clear limits." },
            { icon: <Compass size={18} aria-hidden />, title: "Ownership", body: "We take responsibility for outcomes, not just tasks." },
          ]}
        />
      </ContentSection>

      <ContentSection label="Open positions" right={`${OPENINGS.length} open`} title="Current openings">
        {OPENINGS.length ? (
          <ul className="divide-y divide-border border border-border">
            {OPENINGS.map((job) => (
              <li key={job.title} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{job.title}</h3>
                  <p className="text-sm text-muted-foreground">{job.team} · {job.location} · {job.type}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{job.summary}</p>
                </div>
                <PrimaryButton onClick={onContact}>Apply</PrimaryButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 border border-dashed border-border p-8 sm:p-10">
            <Briefcase className="h-6 w-6 text-primary" aria-hidden />
            <p className="text-lg font-semibold text-foreground">There are currently no open positions at {brand.productName}.</p>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              New roles will be listed on this page when they open. Contractors looking to receive jobs through {brand.productName} can apply to join the contractor network instead.
            </p>
            <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
              <PrimaryButton onClick={actions.joinAsContractor}>Join as a contractor</PrimaryButton>
              <SecondaryButton onClick={onContact}>Contact us</SecondaryButton>
            </div>
          </div>
        )}
      </ContentSection>
    </>
  );
}
