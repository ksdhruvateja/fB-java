export type ServiceSubOffering = {
  id: string;
  label: string;
};

export type ServiceOffering = {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconKey?: string | null;
  oneTimeProfessional?: boolean;
  diyEligible?: boolean;
  aiAssessmentEligible?: boolean;
  subscriptionEligible?: boolean;
  emergencyEligible?: boolean;
  active?: boolean;
  homeownerVisible?: boolean;
  pricingMetadata?: {
    subServices?: ServiceSubOffering[];
    [key: string]: unknown;
  } | null;
  sortOrder?: number;
};
