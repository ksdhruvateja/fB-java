import type { AssessmentStatusValue, StructuredAssessment } from './assessment.model';

export type ManagedJobStatus =
  | 'draft'
  | 'ai_review_complete'
  | 'awaiting_service_payment'
  | 'paid_for_dispatch'
  | 'awaiting_contractor'
  | 'contractor_invited'
  | 'contractor_accepted'
  | 'awaiting_bid'
  | 'diagnosing'
  | 'bid_received'
  | 'proposal_sent'
  | 'awaiting_customer_approval'
  | 'approved'
  | 'scheduled'
  | 'contractor_en_route'
  | 'work_started'
  | 'change_order_pending'
  | 'work_completed'
  | 'customer_review_pending'
  | 'admin_review_pending'
  | 'payout_pending'
  | 'paid_out'
  | 'closed'
  | 'canceled'
  | 'refunded'
  | 'disputed'
  | string;

export type ManagedJob = {
  id: number;
  bookingId?: string | null;
  jobMode?: string;
  status: ManagedJobStatus;
  category?: string;
  title?: string;
  description?: string;
  preferredDate?: string | null;
  preferredTimeSlot?: string | null;
  serviceTiming?: string | null;
  cityStateZip?: string | null;
  fullAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  propertyId?: number | null;
  contractorName?: string | null;
  homeownerUserId?: number | null;
  cancelledBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  mediaDataUrl?: string | null;
  mediaType?: string | null;
  aiAssessment?: StructuredAssessment | null;
  assessmentStatus?: AssessmentStatusValue | null;
  assessmentErrorCode?: string | null;
  diyRiskLevel?: string | null;
  showRetailPrice?: boolean;
  customerRetailEstimateLow?: number | null;
  customerRetailEstimateHigh?: number | null;
  pricingDisclaimer?: string;
  activeProposalId?: number | null;
  homeownerStatusLabel?: string | null;
  outstandingAmount?: number | null;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  invoiceAmountDue?: number | null;
  discountCode?: string | null;
  discountLabel?: string | null;
  couponDiscountAmount?: number | null;
};

export type CancellationReasonCode =
  | 'resolved'
  | 'schedule_conflict'
  | 'other_provider'
  | 'price'
  | 'change_request'
  | 'provider_issue'
  | 'created_by_mistake'
  | 'other';

export type JobInvitation = {
  id: number;
  jobId: number;
  status?: string;
  title?: string;
  category?: string;
  fullAddress?: string | null;
  createdAt?: string;
};
