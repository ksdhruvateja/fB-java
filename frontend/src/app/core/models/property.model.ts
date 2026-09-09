export type PropertyDocumentCategory =
  | 'receipt'
  | 'warranty'
  | 'manual'
  | 'invoice'
  | 'inspection'
  | 'contractor'
  | 'photo_before'
  | 'photo_after'
  | 'other'
  | string;

export type PropertyDocument = {
  id: number;
  category: PropertyDocumentCategory;
  title?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  dataUrl?: string | null;
  hasFile?: boolean;
  notes?: string | null;
  systemKey?: string | null;
  createdAt?: string;
};

export type Property = {
  id: number;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postalCodePlus4?: string | null;
  addressVerified?: boolean;
  propertyType?: string | null;
  accessNotes?: string | null;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  documents?: PropertyDocument[];
};

export type CreatePropertyBody = Partial<Property> & { addressLine1: string };

export type UploadPropertyDocumentBody = {
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
  category?: PropertyDocumentCategory;
  title?: string;
  notes?: string;
  systemKey?: string;
};
