import { getStoredToken } from "./auth";

export type ReviewCategoryRatings = {
  quality?: number;
  communication?: number;
  punctuality?: number;
  cleanliness?: number;
  value?: number;
};

export type JobReviewPayload = {
  jobId: number;
  rating: number;
  text?: string;
  location?: string;
  serviceType?: string;
  images?: string[];
  categories?: ReviewCategoryRatings;
};

export type JobReviewResult = {
  id: number;
  rating: number;
  text: string;
  verified: boolean;
  verifiedFixBridgeJob: boolean;
  categories?: ReviewCategoryRatings | null;
};

export async function submitJobReview(payload: JobReviewPayload) {
  const token = getStoredToken();
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jobId: payload.jobId,
      rating: payload.rating,
      text: payload.text,
      review: payload.text,
      location: payload.location,
      serviceType: payload.serviceType,
      images: payload.images,
      categories: payload.categories,
    }),
  });
  const data = await res.json();
  return data as {
    ok: boolean;
    review?: JobReviewResult;
    message?: string;
    code?: string;
  };
}

export async function checkJobReviewExists(jobId: number) {
  const token = getStoredToken();
  const res = await fetch(`/api/reviews?jobId=${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!data.ok || !Array.isArray(data.reviews)) return false;
  return data.reviews.some((r: { jobId?: number }) => Number(r.jobId) === jobId);
}
