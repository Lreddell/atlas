import { makeAssignmentKey, type WorkerJobType } from './workers/streamingProtocol';

export interface StreamingAssignment {
  workerId: number;
  jobType: WorkerJobType;
  cx: number;
  cz: number;
  ticket: number;
  inputBytes: number;
}

export class StreamingGuardState {
  private assignments = new Map<string, StreamingAssignment>();
  private assignmentKeysByWorker = new Map<number, Set<string>>();
  private retryAttempts = new Map<string, number>();
  private desiredKeys = new Set<string>();
  private _worldSessionId = 0;
  private _desiredEpoch = 0;
  private _inFlightBytes = 0;

  get worldSessionId(): number {
    return this._worldSessionId;
  }

  get desiredEpoch(): number {
    return this._desiredEpoch;
  }

  get inFlightBytes(): number {
    return this._inFlightBytes;
  }

  beginWorldSession(): number {
    this._worldSessionId += 1;
    this._desiredEpoch = 0;
    this.desiredKeys.clear();
    this.clearAssignments();
    this.retryAttempts.clear();
    return this._worldSessionId;
  }

  updateDesired(keys: Iterable<string>): number {
    this._desiredEpoch += 1;
    this.desiredKeys = new Set(keys);
    return this._desiredEpoch;
  }

  isDesired(key: string): boolean {
    return this.desiredKeys.has(key);
  }

  assign(assignment: StreamingAssignment): void {
    const key = makeAssignmentKey(assignment.jobType, assignment.cx, assignment.cz, assignment.ticket);
    const previous = this.assignments.get(key);
    if (previous) this.removeAssignment(key, previous);

    this.assignments.set(key, assignment);
    this._inFlightBytes += Math.max(0, assignment.inputBytes);

    let workerKeys = this.assignmentKeysByWorker.get(assignment.workerId);
    if (!workerKeys) {
      workerKeys = new Set<string>();
      this.assignmentKeysByWorker.set(assignment.workerId, workerKeys);
    }
    workerKeys.add(key);
  }

  complete(jobType: WorkerJobType, cx: number, cz: number, ticket: number): StreamingAssignment | undefined {
    const key = makeAssignmentKey(jobType, cx, cz, ticket);
    const assignment = this.assignments.get(key);
    if (!assignment) return undefined;
    this.removeAssignment(key, assignment);
    return assignment;
  }

  assignmentsForWorker(workerId: number): StreamingAssignment[] {
    const keys = this.assignmentKeysByWorker.get(workerId);
    if (!keys) return [];
    const results: StreamingAssignment[] = [];
    for (const key of keys) {
      const assignment = this.assignments.get(key);
      if (assignment) results.push(assignment);
    }
    return results;
  }

  recordFailure(jobType: WorkerJobType, cx: number, cz: number): number {
    const key = `${jobType}:${cx},${cz}`;
    const attempt = this.retryAttempts.get(key) ?? 0;
    this.retryAttempts.set(key, attempt + 1);
    return attempt;
  }

  recordSuccess(jobType: WorkerJobType, cx: number, cz: number): void {
    this.retryAttempts.delete(`${jobType}:${cx},${cz}`);
  }

  clearAssignments(): void {
    this.assignments.clear();
    this.assignmentKeysByWorker.clear();
    this._inFlightBytes = 0;
  }

  private removeAssignment(key: string, assignment: StreamingAssignment): void {
    this.assignments.delete(key);
    this._inFlightBytes = Math.max(0, this._inFlightBytes - Math.max(0, assignment.inputBytes));
    const workerKeys = this.assignmentKeysByWorker.get(assignment.workerId);
    workerKeys?.delete(key);
    if (workerKeys?.size === 0) this.assignmentKeysByWorker.delete(assignment.workerId);
  }
}
