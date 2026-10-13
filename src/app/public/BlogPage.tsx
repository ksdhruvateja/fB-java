import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { BLOG_CATEGORIES, BLOG_POSTS } from "../../shared/publicSiteMeta.js";
import { applyPublicPathMeta } from "../siteMeta";
import { ScrollReveal } from "../shared";
import { CtaBand, PageHero, PrimaryButton, SecondaryButton } from "./PublicLayout";
import type { PublicPageActions } from "./publicActions";

type Block = { p?: string; h?: string; ul?: string[]; note?: string };
type Post = {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  published: string;
  body: Block[];
};

const POSTS = BLOG_POSTS as Post[];

/** Fired when the app changes the URL without a popstate (e.g. footer "Blog" while on an article). */
export const LOCATION_CHANGE_EVENT = "fixbridge:location";

function slugFromLocation(): string | null {
  const match = window.location.pathname.replace(/\/+$/, "").match(/^\/blog\/([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function readingMinutes(post: Post) {
  const words = post.body
    .map((b) => [b.p, b.h, b.note, ...(b.ul || [])].filter(Boolean).join(" "))
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function goTo(path: string) {
  const state = window.history.state || {};
  window.history.pushState(state, "", path);
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  document.querySelector<HTMLElement>("[data-scroll-root]")?.scrollTo({ top: 0 });
}

export default function BlogPage({ actions }: { actions: PublicPageActions }) {
  const [slug, setSlug] = useState<string | null>(() => slugFromLocation());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    const sync = () => setSlug(slugFromLocation());
    window.addEventListener("popstate", sync);
    window.addEventListener(LOCATION_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(LOCATION_CHANGE_EVENT, sync);
    };
  }, []);

  const post = slug ? POSTS.find((p) => p.slug === slug) || null : null;

  useEffect(() => {
    applyPublicPathMeta(window.location.pathname);
  }, [slug]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return POSTS.filter((p) => category === "All" || p.category === category).filter((p) => {
      if (!q) return true;
      const hay = [p.title, p.description, p.category, ...p.tags].join(" ").toLowerCase();
      return q.split(/\s+/).every((word) => hay.includes(word));
    });
  }, [query, category]);

  if (slug && !post) {
    return (
      <>
        <PageHero eyebrow="Blog" title="Article not found" intro="This article may have moved. Browse all articles instead.">
          <PrimaryButton light onClick={() => goTo("/blog")}>All articles</PrimaryButton>
        </PageHero>
      </>
    );
  }

  if (post) {
    const related = POSTS.filter((p) => p.slug !== post.slug && p.category === post.category).concat(
      POSTS.filter((p) => p.slug !== post.slug && p.category !== post.category)
    ).slice(0, 3);
    return (
      <>
        <article>
          <PageHero eyebrow={post.category} title={post.title} intro={post.description}>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
              FixBridge Team · <time dateTime={post.published}>{formatDate(post.published)}</time> · {readingMinutes(post)} min read
            </p>
          </PageHero>
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <button
              type="button"
              onClick={() => goTo("/blog")}
              className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={15} aria-hidden /> All articles
            </button>
            <div className="space-y-5 text-base leading-relaxed text-foreground/90">
              {post.body.map((block, index) => {
                if (block.h) {
                  return (
                    <h2 key={index} className="pt-4 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight text-foreground">
                      {block.h}
                    </h2>
                  );
                }
                if (block.ul) {
                  return (
                    <ul key={index} className="list-disc space-y-2 pl-5 marker:text-primary">
                      {block.ul.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  );
                }
                if (block.note) {
                  return (
                    <aside key={index} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                      {block.note}
                    </aside>
                  );
                }
                return <p key={index}>{block.p}</p>;
              })}
            </div>
            <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
              This article is general information, not professional advice for your specific home. Local codes and manufacturer instructions take priority. When in doubt, contact a licensed professional.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        </article>
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="mb-6 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">Keep reading</h2>
            <PostGrid posts={related} />
          </div>
        </section>
        <CtaBand title="Have this problem at home?" body="Describe it and get help from Fixera or a verified professional.">
          <PrimaryButton light onClick={actions.startRequest}>Start a request</PrimaryButton>
          <SecondaryButton light onClick={() => actions.openPage("fixera-assessment")}>About Fixera AI</SecondaryButton>
        </CtaBand>
      </>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="FixBridge blog"
        title={<>Home care, <span className="text-primary">explained.</span></>}
        intro="Practical guides on home maintenance, DIY repairs and seasonal property care — with clear advice on when to call a professional."
      />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {["All", ...BLOG_CATEGORIES].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  category === c ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:w-80">
            <span className="sr-only">Search articles</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles"
              className="w-full border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        {results.length ? (
          <PostGrid posts={results} />
        ) : (
          <p className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No articles match your search. Try another word or category.
          </p>
        )}
      </section>
    </>
  );
}

function PostGrid({ posts }: { posts: Post[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p, index) => (
        <ScrollReveal key={p.slug} delay={Math.min(index, 5) * 0.05} className="h-full">
          <li className="h-full">
            <a
              href={`/blog/${p.slug}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                goTo(`/blog/${p.slug}`);
              }}
              className="group flex h-full flex-col border border-border bg-background p-5 transition-colors hover:border-primary/50"
            >
              <span className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{p.category}</span>
              <h3 className="mb-2 text-lg font-semibold leading-snug text-foreground">{p.title}</h3>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                Read article <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </a>
          </li>
        </ScrollReveal>
      ))}
    </ul>
  );
}
