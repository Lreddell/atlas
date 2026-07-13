export type WorkerJobType = 'GEN' | 'MESH';

export interface WorkerJobContext {
  workerId?: number;
  worldSessionId?: number;
  desiredEpoch?: number;
  jobInputBytes?: number;
}

export interface WorkerJobErrorMessage extends WorkerJobContext {
  type: 'JOB_ERROR';
  jobType: WorkerJobType;
  cx: number;
  cz: number;
  ticket: number;
  errorName: string;
  errorMessage: string;
  allocationRelated: boolean;
}

export interface WorkerPongMessage {
  type: 'PONG';
  workerId: number;
  sentAt: number;
  receivedAt: number;
}

const errorText = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
};

export const isAllocationError = (error: unknown): boolean => {
  const text = errorText(error).toLowerCase();
  return (
    text.includes('array buffer allocation failed') ||
    text.includes('arraybuffer allocation failed') ||
    text.includes('out of memory') ||
    text.includes('allocation failed') ||
    text.includes('invalid array length')
  );
};

export const normalizeWorkerError = ({
  error,
  jobType,
  workerId = -1,
  cx,
  cz,
  ticket,
  worldSessionId = 0,
  desiredEpoch = 0,
  jobInputBytes = 0,
}: {
  error: unknown;
  jobType: WorkerJobType;
  workerId?: number;
  cx: number;
  cz: number;
  ticket: number;
  worldSessionId?: number;
  desiredEpoch?: number;
  jobInputBytes?: number;
}): WorkerJobErrorMessage => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    type: 'JOB_ERROR',
    jobType,
    workerId,
    cx,
    cz,
    ticket,
    worldSessionId,
    desiredEpoch,
    jobInputBytes,
    errorName: normalized.name || 'Error',
    errorMessage: normalized.message || String(error),
    allocationRelated: isAllocationError(normalized),
  };
};

export const getRetryDelayMs = (attempt: number): number =>
  Math.min(5000, 100 * 2 ** Math.max(0, Math.floor(attempt)));

export const makeAssignmentKey = (
  jobType: WorkerJobType,
  cx: number,
  cz: number,
  ticket: number,
): string => `${jobType}:${cx},${cz}:${ticket}`;
