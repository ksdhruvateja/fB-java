import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ManagedJob } from '../../../core/models/managed-job.model';
import { ChangeOrder, Proposal, QuoteOption } from '../../../core/models/quote.model';
import { ManagedJobsApiService } from '../../../core/services/managed-jobs-api.service';
import { PaymentApiService } from '../../../core/services/payment-api.service';
import { QuoteApiService } from '../../../core/services/quote-api.service';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';

@Component({
  selector: 'app-homeowner-job-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, LoadingSkeletonComponent],
  templateUrl: './homeowner-job-detail.component.html',
  styleUrl: './homeowner-job-detail.component.scss',
})
export class HomeownerJobDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly jobsApi = inject(ManagedJobsApiService);
  private readonly quoteApi = inject(QuoteApiService);
  private readonly paymentApi = inject(PaymentApiService);

  loading = true;
  busy = false;
  error = '';
  message = '';
  hireHint = false;
  job: ManagedJob | null = null;
  proposal: Proposal | null = null;
  quoteOptions: QuoteOption[] = [];
  hasAlternatives = false;
  changeOrders: ChangeOrder[] = [];
  pricing: { amount?: number; currency?: string; breakdown?: Record<string, unknown>; message?: string } | null =
    null;
  couponCode = '';
  tipAmount = 10;

  async ngOnInit(): Promise<void> {
    this.hireHint = this.route.snapshot.queryParamMap.get('hire') === '1';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      this.loading = false;
      this.error = 'Invalid job id.';
      return;
    }
    await this.reload(id);
    if (this.hireHint && this.job) {
      await this.ensureHirePath();
    }
  }

  async reload(jobId?: number): Promise<void> {
    const id = jobId ?? this.job?.id;
    if (!id) return;
    this.loading = true;
    this.error = '';
    try {
      const [jobRes, propRes, optsRes, coRes, priceRes] = await Promise.all([
        this.jobsApi.get(id),
        this.quoteApi.getProposal(id),
        this.quoteApi.quoteOptions(id),
        this.quoteApi.listChangeOrders(id),
        this.jobsApi.dispatchPricing(id),
      ]);

      if (!jobRes.ok || !jobRes.job) {
        this.error = jobRes.message || 'Could not load job.';
        this.job = null;
        return;
      }

      this.job = jobRes.job;
      this.couponCode = this.job.discountCode || this.couponCode || '';
      this.proposal = propRes.proposal || null;
      this.quoteOptions = (optsRes.options || []).filter((o) =>
        ['sent', 'viewed', 'draft', 'approved'].includes(String(o.status))
      );
      this.hasAlternatives = !!optsRes.hasAlternatives;
      this.changeOrders = coRes.changeOrders || [];
      this.pricing = priceRes.ok ? priceRes : null;
    } catch {
      this.error = 'Could not load job details.';
      this.job = null;
    } finally {
      this.loading = false;
    }
  }

  async ensureHirePath(): Promise<void> {
    if (!this.job || this.busy) return;
    const s = String(this.job.status);
    if (s === 'draft' || s === 'ai_review_complete') {
      this.busy = true;
      try {
        const res = await this.jobsApi.requestProfessional(this.job.id, {});
        if (res.ok && res.job) this.job = res.job;
        else if (!res.ok) this.message = res.message || 'Professional request submitted when available.';
        await this.reload();
      } finally {
        this.busy = false;
      }
    }
  }

  activeQuoteOptions(): QuoteOption[] {
    return this.quoteOptions.filter((o) => ['sent', 'viewed'].includes(String(o.status)));
  }

  money(n?: number | null): string {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
  }

  async applyCoupon(): Promise<void> {
    if (!this.job || this.busy) return;
    const code = this.couponCode.trim();
    if (!code) {
      this.error = 'Enter a coupon code.';
      return;
    }
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const prepared = await this.paymentApi.prepareCheckout(this.job.id, { discountCode: code });
      if (!prepared.ok) {
        this.error = prepared.message || 'Could not apply coupon.';
        return;
      }
      if (prepared.job) this.job = prepared.job;
      this.message = prepared.job?.discountLabel
        ? `Coupon applied: ${prepared.job.discountLabel}`
        : 'Coupon applied.';
      const priceRes = await this.jobsApi.dispatchPricing(this.job.id, { discountCode: code });
      if (priceRes.ok) this.pricing = priceRes;
    } finally {
      this.busy = false;
    }
  }

  async clearCoupon(): Promise<void> {
    if (!this.job || this.busy) return;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const prepared = await this.paymentApi.prepareCheckout(this.job.id, {
        discountCode: null,
        clearCoupon: true,
      });
      if (!prepared.ok) {
        this.error = prepared.message || 'Could not clear coupon.';
        return;
      }
      this.couponCode = '';
      if (prepared.job) this.job = prepared.job;
      this.message = 'Coupon cleared.';
      const priceRes = await this.jobsApi.dispatchPricing(this.job.id);
      if (priceRes.ok) this.pricing = priceRes;
    } finally {
      this.busy = false;
    }
  }

  async approve(proposalId?: number): Promise<void> {
    if (!this.job || this.busy) return;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const res = await this.quoteApi.approveProposal(this.job.id, { proposalId });
      if (!res.ok) {
        this.error = res.message || 'Could not approve proposal.';
        return;
      }
      this.message = 'Proposal approved.';
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  async payDispatch(): Promise<void> {
    if (!this.job || this.busy) return;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const code = this.couponCode.trim() || undefined;
      const prepared = await this.paymentApi.prepareCheckout(
        this.job.id,
        code ? { discountCode: code } : undefined
      );
      if (!prepared.ok) {
        this.error = prepared.message || 'Could not prepare checkout.';
        return;
      }
      const paid = await this.paymentApi.payDispatch(this.job.id, {
        discountCode: code,
      });
      if (!paid.ok) {
        this.error = paid.message || 'Could not start payment.';
        return;
      }
      if (paid.url) {
        window.location.href = paid.url;
        return;
      }
      this.message = paid.simulated
        ? 'Dispatch payment simulated successfully.'
        : 'Payment recorded.';
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  async approveChangeOrder(co: ChangeOrder): Promise<void> {
    if (!this.job || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const res = await this.quoteApi.approveChangeOrder(this.job.id, co.id);
      if (!res.ok) {
        this.error = res.message || 'Could not approve change order.';
        return;
      }
      this.message = 'Change order approved.';
      await this.reload();
    } finally {
      this.busy = false;
    }
  }

  canPayDispatch(): boolean {
    if (!this.job) return false;
    const s = String(this.job.status);
    return (
      s === 'ai_review_complete' ||
      s === 'awaiting_service_payment' ||
      s === 'draft' ||
      this.hireHint
    );
  }

  canApproveProposal(): boolean {
    if (!this.proposal) return false;
    return ['sent', 'viewed', 'pending'].includes(String(this.proposal.status));
  }

  canTip(): boolean {
    if (!this.job?.id) return false;
    const s = String(this.job.status);
    return (
      s === 'work_completed' ||
      s === 'customer_review_pending' ||
      s === 'admin_review_pending' ||
      s === 'payout_pending' ||
      s === 'paid_out' ||
      s === 'closed' ||
      Number(this.job.invoiceAmountDue || 0) > 0
    );
  }

  async sendTip(): Promise<void> {
    if (!this.job?.id || this.busy) return;
    const tip = Math.max(0, Number(this.tipAmount) || 0);
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      const res = await this.paymentApi.tipCheckout(this.job.id, tip);
      if (!res.ok) {
        this.error = res.message || 'Could not start tip checkout.';
        return;
      }
      const url = res.checkoutUrl || res.url;
      if (url) {
        window.location.href = url;
        return;
      }
      this.message = res.simulated
        ? 'Tip recorded (simulated).'
        : `Tip of ${this.money(tip)} submitted.`;
      await this.reload();
    } finally {
      this.busy = false;
    }
  }
}
