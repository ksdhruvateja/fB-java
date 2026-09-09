export type ProposalLineItem = {
  label?: string;
  name?: string;
  description?: string;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  amount: number;
  visible?: boolean;
};

export type Proposal = {
  id: number;
  quoteNumber?: string;
  jobId: number;
  scopeSummary?: string;
  retailAmount?: number;
  depositAmount?: number | null;
  timeline?: string | null;
  warranty?: string | null;
  exclusions?: string | null;
  status: string;
  contractorNet?: number;
  quoteValidUntil?: string | null;
  customerLineItems?: ProposalLineItem[];
  jobTitle?: string | null;
  jobCategory?: string | null;
  contractorName?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  quoteOptionLabel?: string | null;
  quoteOptionTitle?: string | null;
  optionGroup?: string | null;
  total?: number;
};

export type QuoteOption = Proposal;

export type ChangeOrder = {
  id: number;
  jobId: number;
  description: string;
  status: string;
  createdAt?: string;
  approvedAt?: string | null;
  contractorNet?: number | null;
  retailAmount?: number | null;
  reason?: string | null;
};

export type CheckoutBreakdown = {
  serviceFee?: number;
  couponDiscount?: number;
  finalAmount?: number;
  amount?: number;
  authorizedNow?: number;
  authorizedNowCents?: number;
  lines?: Array<{
    key?: string;
    label?: string;
    amount_cents?: number;
    line_type?: string;
  }>;
  repairWorkIncluded?: boolean;
  repairWorkNote?: string;
};
