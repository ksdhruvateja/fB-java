export type PaymentTransaction = {
  id: number;
  transactionId: string;
  paymentType: string;
  typeLabel: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  provider?: string;
  jobId?: number | null;
  propertyId?: number | null;
  planCode?: string | null;
  createdAt: string;
  receiptUrl?: string | null;
};
