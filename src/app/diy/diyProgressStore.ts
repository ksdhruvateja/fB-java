export type DiyProgressRecord = {
  jobId: number;
  topic: string;
  risk: string;
  stepIndex: number;
  completedSteps: number[];
  updatedAt: string;
};

function key(userId: number, jobId: number) {
  return `fixbridge-diy-progress:${userId}:${jobId}`;
}

export function readDiyProgress(userId: number, jobId: number): DiyProgressRecord | null {
  try {
    const raw = localStorage.getItem(key(userId, jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiyProgressRecord;
    if (!parsed || parsed.jobId !== jobId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDiyProgress(userId: number, record: DiyProgressRecord) {
  try {
    localStorage.setItem(key(userId, record.jobId), JSON.stringify(record));
  } catch {
    /* progress still lives in memory for this session */
  }
}

const chatKey = (userId: number, jobId: number) => `fixbridge-diy-chat:${userId}:${jobId}`;

export function readDiyChat<T>(userId: number, jobId: number): T[] | null {
  try {
    const raw = sessionStorage.getItem(chatKey(userId, jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed.slice(-24) : null;
  } catch {
    return null;
  }
}

export function writeDiyChat<T>(userId: number, jobId: number, messages: T[]) {
  try {
    sessionStorage.setItem(chatKey(userId, jobId), JSON.stringify(messages.slice(-24)));
  } catch {
    /* session chat is optional */
  }
}
