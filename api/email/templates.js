/**
 * FixBridge email template registry.
 * Each template: { subject(data), render(data) -> { html, text } }
 */
import { appBaseUrl } from './email-config.js';
import { renderEmailLayout, renderPlainText } from './layout.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  safeText,
  safeAddress,
  detailsRows,
} from './formatters.js';

function jobUrl(jobId) {
  return `${appBaseUrl()}/homeowner?job=${encodeURIComponent(jobId)}`;
}

function contractorUrl(path = '') {
  return `${appBaseUrl()}/?portal=contractor${path}`;
}

function tpl({
  subject,
  category,
  headline,
  firstName,
  paragraphs = [],
  bodyHtml = '',
  detailsCard,
  cta,
  afterCtaHtml = '',
  afterCtaText = '',
}) {
  const data = {
    category,
    headline,
    firstName,
    paragraphs,
    bodyHtml,
    detailsCard,
    cta,
    afterCtaHtml,
  };
  return {
    subject,
    html: renderEmailLayout(data),
    text: renderPlainText({ ...data, afterCtaText }),
  };
}

export const EMAIL_TEMPLATES = {
  homeowner_welcome: (d) =>
    tpl({
      subject: 'Welcome to FixBridge',
      category: 'Welcome',
      headline: 'Welcome to FixBridge',
      firstName: d.firstName,
      paragraphs: [
        "We're here to make home repairs and service requests easier to understand, coordinate, and manage.",
        'You can use FixBridge to assess an issue, request a professional, review quotes, approve work, manage payments, and keep track of your service history.',
      ],
      cta: { label: 'GO TO FIXBRIDGE', href: appBaseUrl() },
      afterCtaText: 'If you ever need assistance, simply reply to this email.',
    }),

  password_reset: (d) =>
    tpl({
      subject: 'Reset your FixBridge password',
      category: 'Account Security',
      headline: 'Reset your password',
      firstName: d.firstName,
      paragraphs: [
        `We received a request to reset your FixBridge password for your ${safeText(d.portalLabel, 'account')}.`,
        'This link will expire according to our security policy.',
        "If you didn't request a password reset, you can ignore this email.",
      ],
      cta: { label: 'RESET PASSWORD', href: d.resetUrl },
    }),

  email_verification: (d) =>
    tpl({
      subject: 'Verify your FixBridge email',
      category: 'Account',
      headline: 'Verify your email',
      firstName: d.firstName,
      paragraphs: ['Please verify your email address to complete your FixBridge account setup.'],
      cta: { label: 'VERIFY EMAIL', href: d.verifyUrl },
    }),

  service_request_received: (d) =>
    tpl({
      subject: "We've received your FixBridge service request",
      category: 'Service Request',
      headline: 'Service request received',
      firstName: d.firstName,
      paragraphs: [
        "We've received your service request and will guide you through the next steps.",
        safeText(d.nextStep, 'You can view your request details anytime in FixBridge.'),
      ],
      detailsCard: {
        title: 'Service Request',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Status', value: d.status || 'Received' },
        ]),
      },
      cta: { label: 'VIEW SERVICE REQUEST', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  ai_assessment_ready: (d) =>
    tpl({
      subject: 'Your FixBridge AI assessment is ready',
      category: 'AI Assessment',
      headline: 'Your AI assessment is ready',
      firstName: d.firstName,
      paragraphs: [
        'Your AI assessment is ready to review.',
        'FixBridge AI provides an informational assessment based on the information you provide. It is not a guaranteed diagnosis and site conditions may differ.',
        d.safetyNote ? safeText(d.safetyNote) : null,
      ].filter(Boolean),
      detailsCard: {
        title: 'Assessment Summary',
        rows: detailsRows([
          { label: 'Issue', value: d.issue },
          { label: 'Status', value: d.assessmentStatus || 'Ready' },
          { label: 'Safety', value: d.safetyClassification },
          { label: 'Recommended next step', value: d.recommendedNextStep },
        ]),
      },
      cta: { label: 'VIEW ASSESSMENT', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  professional_request_confirmation: (d) =>
    tpl({
      subject: 'Your professional service request has been submitted',
      category: 'Professional Service',
      headline: 'Professional service request submitted',
      firstName: d.firstName,
      paragraphs: [
        'Your request for professional service has been submitted.',
        'Additional repair work beyond the visit scope will require your approval when applicable.',
      ],
      detailsCard: {
        title: 'Request Details',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Status', value: d.status || 'Submitted' },
        ]),
      },
      cta: { label: 'VIEW REQUEST', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  contractor_assigned: (d) =>
    tpl({
      subject: 'A service professional has been assigned',
      category: 'Service Update',
      headline: 'Service professional assigned',
      firstName: d.firstName,
      paragraphs: ['A service professional has been assigned to your request.'],
      detailsCard: {
        title: 'Assignment',
        rows: detailsRows([
          { label: 'Professional', value: d.contractorName },
          { label: 'Service', value: d.service },
          { label: 'Scheduled', value: d.scheduledAt },
          { label: 'Job', value: d.jobNumber },
          { label: 'Property', value: safeAddress(d.property) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  contractor_on_the_way: (d) =>
    tpl({
      subject: 'Your FixBridge service professional is on the way',
      category: 'Service Update',
      headline: 'Your professional is on the way',
      firstName: d.firstName,
      paragraphs: [safeText(d.statusMessage, 'Your service professional is en route.')],
      detailsCard: {
        title: 'Service',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Professional', value: d.contractorName },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Status', value: d.travelStatus },
        ]),
      },
      cta: { label: 'TRACK SERVICE', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  appointment_confirmed: (d) =>
    tpl({
      subject: 'Your FixBridge appointment is confirmed',
      category: 'Appointment',
      headline: 'Appointment confirmed',
      firstName: d.firstName,
      paragraphs: ['Your appointment has been confirmed.'],
      detailsCard: {
        title: 'Appointment',
        rows: detailsRows([
          { label: 'Service', value: d.service },
          { label: 'Date', value: formatDate(d.date) },
          { label: 'Time', value: d.time },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Professional', value: d.contractorName },
          { label: 'Job', value: d.jobNumber },
        ]),
      },
      cta: { label: 'VIEW APPOINTMENT', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  appointment_updated: (d) =>
    tpl({
      subject: 'Your FixBridge appointment has been updated',
      category: 'Appointment',
      headline: 'Appointment updated',
      firstName: d.firstName,
      paragraphs: ['Your appointment details have been updated.'],
      detailsCard: {
        title: 'Changes',
        rows: detailsRows([
          { label: 'Previous', value: d.previousDetails },
          { label: 'Updated', value: d.updatedDetails },
          { label: 'Job', value: d.jobNumber },
        ]),
      },
      cta: { label: 'VIEW APPOINTMENT', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  quote_ready: (d) =>
    tpl({
      subject: 'Your FixBridge quote is ready to review',
      category: 'Quote',
      headline: 'Your quote is ready',
      firstName: d.firstName,
      paragraphs: [
        'Your service quote is ready.',
        'Please review the scope of work and customer total before approving.',
        'No additional work should be performed outside the approved scope without an approved change order.',
      ],
      detailsCard: {
        title: 'Quote',
        rows: detailsRows([
          { label: 'Quote', value: d.quoteNumber },
          { label: 'Total', value: formatCurrency(d.customerTotal) },
          { label: 'Job', value: d.jobNumber },
        ]),
      },
      cta: { label: 'REVIEW QUOTE', href: d.viewUrl },
      bodyHtml: d.quoteBodyHtml || '',
    }),

  quote_approved: (d) =>
    tpl({
      subject: 'Your FixBridge quote has been approved',
      category: 'Quote',
      headline: 'Quote approved',
      firstName: d.firstName,
      paragraphs: ['Your quote has been approved.'],
      detailsCard: {
        title: 'Approval',
        rows: detailsRows([
          { label: 'Quote', value: d.quoteNumber },
          { label: 'Approved total', value: formatCurrency(d.customerTotal) },
          { label: 'Job', value: d.jobNumber },
          { label: 'Approved', value: formatDate(d.approvedAt, { includeTime: true }) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  quote_updated: (d) =>
    tpl({
      subject: 'Your FixBridge quote has been updated',
      category: 'Quote',
      headline: 'Quote updated',
      firstName: d.firstName,
      paragraphs: ['There is a revised quote awaiting your review.'],
      cta: { label: 'REVIEW UPDATED QUOTE', href: d.viewUrl },
    }),

  change_order_request: (d) =>
    tpl({
      subject: 'A change to your FixBridge service requires approval',
      category: 'Change Order',
      headline: 'Change order approval needed',
      firstName: d.firstName,
      paragraphs: ['Additional scope requires your approval before work continues.'],
      detailsCard: {
        title: 'Change Order',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Additional scope', value: d.additionalScope },
          { label: 'Additional amount', value: formatCurrency(d.additionalAmount) },
          { label: 'Updated total', value: formatCurrency(d.updatedTotal) },
        ]),
      },
      cta: { label: 'REVIEW CHANGE ORDER', href: d.viewUrl },
    }),

  change_order_approved: (d) =>
    tpl({
      subject: 'Your FixBridge change order has been approved',
      category: 'Change Order',
      headline: 'Change order approved',
      firstName: d.firstName,
      paragraphs: ['Your change order has been approved.'],
      detailsCard: {
        title: 'Approval',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Approved amount', value: formatCurrency(d.approvedAmount) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  invoice_ready: (d) =>
    tpl({
      subject: 'Your FixBridge invoice is ready',
      category: 'Invoice',
      headline: 'Invoice ready',
      firstName: d.firstName,
      paragraphs: ['Your invoice is ready to review.'],
      detailsCard: {
        title: 'Invoice',
        rows: detailsRows([
          { label: 'Invoice', value: d.invoiceNumber },
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
          { label: 'Invoice total', value: formatCurrency(d.invoiceTotal) },
          { label: 'Amount paid', value: formatCurrency(d.amountPaid) },
          { label: 'Balance due', value: formatCurrency(d.balanceDue) },
          { label: 'Due date', value: formatDate(d.dueDate) },
        ]),
      },
      cta: {
        label: d.payUrl ? 'PAY NOW' : 'VIEW INVOICE',
        href: d.payUrl || d.viewUrl,
      },
      bodyHtml: d.invoiceBodyHtml || '',
    }),

  payment_confirmation: (d) =>
    tpl({
      subject: 'Payment received — FixBridge',
      category: 'Payment',
      headline: 'Payment received',
      firstName: d.firstName,
      paragraphs: ["Thank you. We've received your payment.", 'Keep this email for your records.'],
      detailsCard: {
        title: 'Payment Summary',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Invoice', value: d.invoiceNumber },
          { label: 'Amount', value: formatCurrency(d.amount) },
          { label: 'Payment status', value: d.paymentStatus || 'Paid' },
          { label: 'Date', value: formatDate(d.paymentDate, { includeTime: true }) },
          { label: 'Payment method', value: d.paymentMethod },
        ]),
      },
      cta: { label: 'VIEW PAYMENT', href: d.viewUrl },
    }),

  payment_failed: (d) =>
    tpl({
      subject: 'Action needed: FixBridge payment was not completed',
      category: 'Payment',
      headline: 'Payment not completed',
      firstName: d.firstName,
      paragraphs: [
        'Your payment was not completed successfully.',
        'No successful payment has been recorded. You can try again when ready.',
      ],
      detailsCard: {
        title: 'Payment',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Invoice', value: d.invoiceNumber },
          { label: 'Amount', value: formatCurrency(d.amount) },
        ]),
      },
      cta: { label: 'TRY PAYMENT AGAIN', href: d.retryUrl },
    }),

  refund_issued: (d) =>
    tpl({
      subject: 'Your FixBridge refund has been issued',
      category: 'Refund',
      headline: 'Refund issued',
      firstName: d.firstName,
      paragraphs: [
        'A refund has been issued to your original payment method.',
        d.processingNote ? safeText(d.processingNote) : 'Processing times may vary by bank or card issuer.',
      ],
      detailsCard: {
        title: 'Refund',
        rows: detailsRows([
          { label: 'Amount', value: formatCurrency(d.amount) },
          { label: 'Job', value: d.jobNumber },
          { label: 'Invoice', value: d.invoiceNumber },
          { label: 'Date', value: formatDate(d.refundDate, { includeTime: true }) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  job_completed: (d) =>
    tpl({
      subject: 'Your FixBridge service is complete',
      category: 'Service Complete',
      headline: 'Service complete',
      firstName: d.firstName,
      paragraphs: ['Your service has been marked complete.'],
      detailsCard: {
        title: 'Completion',
        rows: detailsRows([
          { label: 'Service', value: d.service },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Professional', value: d.contractorName },
          { label: 'Completed', value: formatDate(d.completedAt, { includeTime: true }) },
        ]),
      },
      cta: { label: 'VIEW COMPLETED JOB', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  review_request: (d) =>
    tpl({
      subject: 'How did your FixBridge service go?',
      category: 'Feedback',
      headline: 'Share your experience',
      firstName: d.firstName,
      paragraphs: ['We hope your recent service went well. Your feedback helps us improve.'],
      cta: { label: 'LEAVE A REVIEW', href: d.reviewUrl },
    }),

  cancellation: (d) =>
    tpl({
      subject: 'Your FixBridge service request has been cancelled',
      category: 'Cancellation',
      headline: 'Service request cancelled',
      firstName: d.firstName,
      paragraphs: ['Your service request has been cancelled.'],
      detailsCard: {
        title: 'Cancellation',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Property', value: safeAddress(d.property) },
          { label: 'Cancelled', value: formatDate(d.cancelledAt, { includeTime: true }) },
          { label: 'Payment status', value: d.paymentStatus },
        ]),
      },
      cta: { label: 'VIEW REQUEST', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  support_ticket_created: (d) =>
    tpl({
      subject: "We've received your FixBridge support request",
      category: 'Support',
      headline: 'Support request received',
      firstName: d.firstName,
      paragraphs: ['Reply to this email if you need to add more information.'],
      detailsCard: {
        title: 'Support Ticket',
        rows: detailsRows([
          { label: 'Ticket', value: d.ticketNumber },
          { label: 'Subject', value: d.subject },
          { label: 'Status', value: d.status || 'Open' },
          { label: 'Created', value: formatDate(d.createdAt, { includeTime: true }) },
        ]),
      },
      cta: { label: 'VIEW SUPPORT REQUEST', href: d.viewUrl },
    }),

  support_reply: (d) =>
    tpl({
      subject: 'Update on your FixBridge support request',
      category: 'Support',
      headline: 'Support update',
      firstName: d.firstName,
      paragraphs: ['There is a new update on your support request.'],
      bodyHtml: d.messageHtml
        ? `<div style="margin:16px 0;padding:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${d.messageHtml}</div>`
        : '',
      cta: { label: 'VIEW SUPPORT REQUEST', href: d.viewUrl },
    }),

  // Contractor templates
  contractor_application_received: (d) =>
    tpl({
      subject: "We've received your FixBridge contractor application",
      category: 'Contractor Application',
      headline: 'Application received',
      firstName: d.firstName,
      paragraphs: ["We've received your contractor application and will review it shortly."],
      cta: { label: 'OPEN CONTRACTOR DASHBOARD', href: contractorUrl() },
    }),

  contractor_application_approved: (d) =>
    tpl({
      subject: 'Your FixBridge contractor account has been approved',
      category: 'Contractor Application',
      headline: 'Account approved',
      firstName: d.firstName,
      paragraphs: ['Your FixBridge contractor account has been approved. You can now access your dashboard.'],
      cta: { label: 'OPEN CONTRACTOR DASHBOARD', href: contractorUrl() },
    }),

  contractor_compliance_needed: (d) =>
    tpl({
      subject: 'Action needed for your FixBridge contractor profile',
      category: 'Compliance',
      headline: 'Compliance action needed',
      firstName: d.firstName,
      paragraphs: ['Please review the outstanding compliance requirements on your profile.'],
      detailsCard: {
        title: 'Outstanding Items',
        rows: detailsRows([{ label: 'Required', value: d.requirements }]),
      },
      cta: { label: 'REVIEW COMPLIANCE', href: contractorUrl('/compliance') },
    }),

  contractor_compliance_expiring: (d) =>
    tpl({
      subject: 'A FixBridge compliance document is expiring soon',
      category: 'Compliance',
      headline: 'Document expiring soon',
      firstName: d.firstName,
      paragraphs: ['Please update your compliance documents before they expire.'],
      detailsCard: {
        title: 'Document',
        rows: detailsRows([
          { label: 'Document', value: d.documentName },
          { label: 'Expires', value: formatDate(d.expiresAt) },
          { label: 'Action', value: 'Update required' },
        ]),
      },
      cta: { label: 'UPDATE COMPLIANCE', href: contractorUrl('/compliance') },
    }),

  stripe_connect_onboarding: (d) =>
    tpl({
      subject: 'Complete your FixBridge payout setup',
      category: 'Payout Setup',
      headline: 'Complete payout setup',
      firstName: d.firstName,
      paragraphs: [
        'Stripe securely handles payout account setup for FixBridge contractors.',
        'Complete your setup to receive payouts.',
      ],
      cta: { label: 'COMPLETE PAYOUT SETUP', href: d.onboardingUrl },
    }),

  job_invitation: (d) =>
    tpl({
      subject: 'New FixBridge job opportunity',
      category: 'Job Opportunity',
      headline: 'New job opportunity',
      firstName: d.firstName,
      paragraphs: ['A new job matching your trade is available.'],
      detailsCard: {
        title: 'Job',
        rows: detailsRows([
          { label: 'Trade', value: d.trade },
          { label: 'Location', value: d.location },
          { label: 'Details', value: d.summary },
          { label: 'Respond by', value: formatDate(d.deadline, { includeTime: true }) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl },
    }),

  job_accepted: (d) =>
    tpl({
      subject: 'FixBridge job confirmed',
      category: 'Job Confirmed',
      headline: 'Job confirmed',
      firstName: d.firstName,
      paragraphs: ['You have been confirmed for this job.'],
      detailsCard: {
        title: 'Job',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
          { label: 'Property area', value: d.location },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl },
    }),

  contractor_quote_submitted: (d) =>
    tpl({
      subject: 'Your FixBridge quote was submitted',
      category: 'Quote',
      headline: 'Quote submitted',
      firstName: d.firstName,
      paragraphs: ['Your quote has been submitted to FixBridge.'],
      detailsCard: {
        title: 'Quote',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Quote amount', value: formatCurrency(d.quoteAmount) },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl },
    }),

  payout_available: (d) =>
    tpl({
      subject: 'A FixBridge payout is ready',
      category: 'Payout',
      headline: 'Payout ready',
      firstName: d.firstName,
      paragraphs: ['A payout is available for your completed work.'],
      detailsCard: {
        title: 'Payout',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Approved earnings', value: formatCurrency(d.earnings) },
          { label: 'Availability', value: d.availability || 'Ready' },
        ]),
      },
      cta: { label: 'VIEW PAYOUT', href: d.viewUrl },
    }),

  payout_released: (d) =>
    tpl({
      subject: 'Your FixBridge payout has been released',
      category: 'Payout',
      headline: 'Payout released',
      firstName: d.firstName,
      paragraphs: ['Your payout has been released.'],
      detailsCard: {
        title: 'Payout',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Payout method', value: d.payoutMethod },
          { label: 'Amount released', value: formatCurrency(d.amountReleased) },
          { label: 'Status', value: d.status || 'Released' },
        ]),
      },
      cta: { label: 'VIEW PAYOUT', href: d.viewUrl },
    }),

  payout_failed: (d) =>
    tpl({
      subject: 'Action needed for your FixBridge payout',
      category: 'Payout',
      headline: 'Payout action needed',
      firstName: d.firstName,
      paragraphs: [safeText(d.reason, 'Additional action is required before your payout can be processed.')],
      cta: { label: 'REVIEW PAYOUT', href: d.viewUrl },
    }),

  instant_payout: (d) =>
    tpl({
      subject: 'Your FixBridge instant payout has been processed',
      category: 'Instant Payout',
      headline: 'Instant payout processed',
      firstName: d.firstName,
      paragraphs: ['Your instant payout has been processed.'],
      detailsCard: {
        title: 'Payout',
        rows: detailsRows([
          { label: 'Contractor earnings', value: formatCurrency(d.earnings) },
          { label: 'Instant payout fee', value: formatCurrency(d.fee) },
          { label: 'Amount sent', value: formatCurrency(d.amountSent) },
          { label: 'Status', value: d.status || 'Processed' },
        ]),
      },
      cta: { label: 'VIEW PAYOUT', href: d.viewUrl },
    }),

  // Partner / referral
  partner_referral_update: (d) =>
    tpl({
      subject: `FixBridge referral update: ${safeText(d.status)}`,
      category: 'Partner Referral',
      headline: 'Referral update',
      firstName: d.firstName,
      paragraphs: [safeText(d.message)],
      detailsCard: {
        title: 'Referral',
        rows: detailsRows([
          { label: 'Status', value: d.status },
          { label: 'Customer', value: d.customerName },
          { label: 'Job', value: d.jobNumber },
        ]),
      },
      cta: d.viewUrl ? { label: 'VIEW REFERRAL', href: d.viewUrl } : undefined,
    }),

  referral_bonus: (d) =>
    tpl({
      subject: `Referral bonus earned — ${formatCurrency(d.amount)}`,
      category: 'Referral',
      headline: 'Referral bonus earned',
      firstName: d.firstName,
      paragraphs: [safeText(d.message, 'You earned a referral bonus on FixBridge.')],
      detailsCard: {
        title: 'Bonus',
        rows: detailsRows([{ label: 'Amount', value: formatCurrency(d.amount) }]),
      },
      cta: { label: 'VIEW ACCOUNT', href: appBaseUrl() },
    }),

  referral_credit: (d) =>
    tpl({
      subject: `Referral update — you've earned ${formatCurrency(d.amount)} credit`,
      category: 'Referral',
      headline: 'Referral credit earned',
      firstName: d.firstName,
      paragraphs: [safeText(d.message)],
      detailsCard: {
        title: 'Credit',
        rows: detailsRows([{ label: 'Credit', value: formatCurrency(d.amount) }]),
      },
      cta: { label: 'VIEW ACCOUNT', href: appBaseUrl() },
    }),

  referral_welcome_credit: (d) =>
    tpl({
      subject: `You've earned ${formatCurrency(d.amount)} FixBridge credit`,
      category: 'Welcome Credit',
      headline: 'Welcome credit',
      firstName: d.firstName,
      paragraphs: [safeText(d.message, 'Welcome to FixBridge! You have account credit available.')],
      detailsCard: {
        title: 'Credit',
        rows: detailsRows([{ label: 'Credit', value: formatCurrency(d.amount) }]),
      },
      cta: { label: 'GO TO FIXBRIDGE', href: appBaseUrl() },
    }),

  service_reminder: (d) =>
    tpl({
      subject: `FixBridge reminder — ${safeText(d.service)}`,
      category: 'Service Reminder',
      headline: 'Service reminder',
      firstName: d.firstName,
      paragraphs: [safeText(d.message)],
      cta: d.viewUrl ? { label: 'VIEW PROPERTY', href: d.viewUrl } : undefined,
    }),

  // Admin / internal
  admin_notification: (d) =>
    tpl({
      subject: safeText(d.subject, 'FixBridge admin notification'),
      category: 'Admin',
      headline: safeText(d.headline, 'Admin notification'),
      firstName: d.firstName,
      paragraphs: [safeText(d.message)],
      cta: d.viewUrl ? { label: 'OPEN ADMIN', href: d.viewUrl } : undefined,
    }),

  admin_mfa_otp: (d) =>
    tpl({
      subject: 'FixBridge admin verification code',
      category: 'Security',
      headline: 'Admin verification code',
      firstName: d.firstName,
      paragraphs: [
        'Use this verification code to complete your FixBridge admin sign-in.',
        `Your code: <strong>${escapeHtml(d.code)}</strong>`,
        'This code expires shortly. If you did not request it, contact support immediately.',
      ],
    }),

  contractor_info_request: (d) =>
    tpl({
      subject: 'FixBridge: Please update your contractor information',
      category: 'Contractor Profile',
      headline: 'Profile update needed',
      firstName: d.firstName,
      paragraphs: [safeText(d.message, 'Please update your contractor profile information.')],
      cta: { label: 'UPDATE PROFILE', href: contractorUrl('/profile') },
    }),

  repair_proposal_ready: (d) =>
    tpl({
      subject: 'Your FixBridge repair proposal is ready',
      category: 'Proposal',
      headline: 'Repair proposal ready',
      firstName: d.firstName,
      paragraphs: [
        `Your repair proposal for <strong>${escapeHtml(d.jobTitle)}</strong> is ready to review.`,
        'Log in to FixBridge to see the details and approve.',
      ],
      cta: { label: 'VIEW PROPOSAL', href: d.viewUrl || jobUrl(d.jobId) },
    }),

  dispatch_approved: (d) =>
    tpl({
      subject: `FixBridge — Dispatch approved for ${safeText(d.jobNumber)}`,
      category: 'Dispatch',
      headline: 'Dispatch approved',
      firstName: d.firstName,
      paragraphs: ['Dispatch has been approved for this job.'],
      detailsCard: {
        title: 'Job',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
        ]),
      },
      cta: { label: 'VIEW JOB', href: d.viewUrl },
    }),

  job_cancelled_contractor: (d) =>
    tpl({
      subject: `FixBridge Service Cancelled — ${safeText(d.jobNumber)}`,
      category: 'Cancellation',
      headline: 'Service cancelled',
      firstName: d.firstName,
      paragraphs: [safeText(d.message, 'A service assignment has been cancelled.')],
      detailsCard: {
        title: 'Job',
        rows: detailsRows([
          { label: 'Job', value: d.jobNumber },
          { label: 'Service', value: d.service },
        ]),
      },
      cta: d.viewUrl ? { label: 'VIEW JOB', href: d.viewUrl } : undefined,
    }),

  job_cancelled_admin: (d) =>
    tpl({
      subject: `FixBridge — Service cancelled ${safeText(d.jobNumber)}`,
      category: 'Cancellation',
      headline: 'Service cancelled',
      firstName: d.firstName,
      paragraphs: [safeText(d.message)],
      cta: d.viewUrl ? { label: 'OPEN ADMIN', href: d.viewUrl } : undefined,
    }),

  generic_notification: (d) =>
    tpl({
      subject: safeText(d.subject, 'FixBridge notification'),
      category: d.category || 'Notification',
      headline: safeText(d.headline, 'FixBridge update'),
      firstName: d.firstName,
      paragraphs: Array.isArray(d.paragraphs) ? d.paragraphs : [safeText(d.message)],
      detailsCard: d.detailsCard,
      cta: d.cta,
      bodyHtml: d.bodyHtml || '',
    }),
};

export function listEmailTemplates() {
  return Object.keys(EMAIL_TEMPLATES);
}

export function renderEmailTemplate(templateId, data = {}) {
  const fn = EMAIL_TEMPLATES[templateId];
  if (!fn) {
    throw new Error(`Unknown email template: ${templateId}`);
  }
  const rendered = fn(data || {});
  return {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    template: templateId,
  };
}
