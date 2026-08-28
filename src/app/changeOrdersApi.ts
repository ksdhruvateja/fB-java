import { api } from "./platformApi";

export type ChangeOrder = {
  id: number;
  jobId: number;
  description: string;
  status: string;
  createdAt?: string;
  approvedAt?: string | null;
  contractorNet?: number | null;
  retailAmount?: number | null;
};

export async function listChangeOrders(jobId: number) {
  return api<{ ok: boolean; changeOrders?: ChangeOrder[]; message?: string }>(
    `/api/managed/jobs/${jobId}/change-orders`
  );
}

export async function createChangeOrder(
  jobId: number,
  body: { description: string; contractorNet: number; reason?: string; mediaDataUrl?: string }
) {
  return api<{ ok: boolean; changeOrder?: ChangeOrder; message?: string }>(
    `/api/managed/jobs/${jobId}/change-orders`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function priceChangeOrder(changeOrderId: number, retailAmount: number) {
  return api<{ ok: boolean; changeOrder?: ChangeOrder; message?: string }>(
    `/api/admin/change-orders/${changeOrderId}/price`,
    { method: "POST", body: JSON.stringify({ retailAmount }) }
  );
}

export async function approveChangeOrder(jobId: number, changeOrderId: number) {
  return api<{ ok: boolean; changeOrder?: ChangeOrder; message?: string }>(
    `/api/managed/jobs/${jobId}/change-orders/${changeOrderId}/approve`,
    { method: "POST", body: JSON.stringify({}) }
  );
}
