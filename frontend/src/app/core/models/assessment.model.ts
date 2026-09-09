export type DiyGuideStep = {
  step_number: number;
  title: string;
  instruction: string;
  explanation?: string;
  tools?: string[];
  safety_note?: string;
  expected_result?: string;
  if_not?: string;
  image_needed?: boolean;
  image_prompt?: string;
};

export type StructuredAssessment = {
  category?: string;
  summary?: string;
  urgency?: string;
  confidence?: number;
  recommended_trade?: string;
  professional_required?: boolean;
  safe_diy_allowed?: boolean;
  immediate_safety_steps?: string[];
  visual_findings?: string[];
  estimated_labor_hours_min?: number;
  estimated_labor_hours_max?: number;
  complexity?: string;
  questions_needed?: string[];
  diy_difficulty?: string;
  tools_required?: string[];
  materials_needed?: string[];
  diy_steps?: string[];
  diy_guide_steps?: DiyGuideStep[];
  stop_conditions?: string[];
  disclaimer?: string;
  diy_risk_level?: string;
};

export type AssessmentStatusValue = 'pending' | 'processing' | 'ready' | 'failed';

export type AssessmentStatusResponse = {
  ok: boolean;
  status?: AssessmentStatusValue;
  assessmentStatus?: AssessmentStatusValue;
  jobId?: number;
  job?: {
    id: number;
    status?: string;
    aiAssessment?: StructuredAssessment | null;
    [key: string]: unknown;
  };
  pricing?: {
    showPrice?: boolean;
    message?: string | null;
    customerRetailEstimateLow?: number | null;
    customerRetailEstimateHigh?: number | null;
    disclaimer?: string;
  };
  errorCode?: string | null;
  code?: string;
  message?: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type FixeraChatResult = {
  reply?: string | null;
  source?: string;
  error?: string;
  model?: string;
  riskLevel?: string;
  userStopRequested?: boolean;
  escalated?: boolean;
  code?: string;
  message?: string;
};
