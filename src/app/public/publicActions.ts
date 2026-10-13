import type { PublicContentPage } from "../navigation";

/** Navigation callbacks the public content pages use; provided by App. */
export type PublicPageActions = {
  /** Open another public content page. */
  openPage: (page: PublicContentPage) => void;
  /** Homeowner request flow: dashboard when signed in as a homeowner, otherwise sign in / sign up. */
  startRequest: () => void;
  /** HomeCare Pro plans page. */
  seePlans: () => void;
  /** Contractor sign up / sign in. */
  joinAsContractor: () => void;
  /** About page. */
  openAbout: () => void;
};
