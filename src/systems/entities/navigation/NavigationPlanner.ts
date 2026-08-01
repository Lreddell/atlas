import { NavigationSearch, VoxelNavigator } from './VoxelNavigator.ts';
import type {
    NavigationFailureReason,
    NavigationPath,
    NavigationProfile,
    NavigationRegion,
    NavigationRequest,
    NavigationWorld,
} from './navigationTypes';

const DEFAULT_MAX_NODES_PER_TICK = 600;
const DEFAULT_MAX_NEW_JOBS_PER_TICK = 2;
const CACHE_TTL_MILLISECONDS = 750;
const REVISION_REGION_SIZE = 8;
const GOAL_REGION_SIZE = 4;

export interface NavigationTicket {
    id: number;
    ownerId: number;
}

export interface NavigationTicketResult {
    status: 'pending' | 'complete' | 'failed';
    path: NavigationPath | null;
    failure: NavigationFailureReason | null;
}

export interface NavigationPlannerOptions {
    maxNodesPerTick?: number;
    maxNewJobsPerTick?: number;
    now?: () => number;
    isOwnerActive?: (ownerId: number) => boolean;
}

export interface NavigationPlannerTickResult {
    started: number;
    expanded: number;
    completed: number;
    failed: number;
}

interface PlannerJob {
    key: string;
    request: NavigationRequest;
    bounds: NavigationRegion;
    tickets: Set<number>;
    search: NavigationSearch | null;
    state: 'queued' | 'active';
}

interface CachedPath {
    path: NavigationPath;
    expiresAt: number;
    regions: Set<string>;
    bounds: NavigationRegion;
}

const regionCoordinate = (value: number) => Math.floor(value / REVISION_REGION_SIZE);
const revisionRegionKey = (x: number, z: number) => `${x},${z}`;

function normalizeCell(value: number): number {
    return Math.floor(Number.isFinite(value) ? value : 0);
}

function positiveInteger(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function profileKey(profile: NavigationProfile): string {
    const hazards = profile.avoidHazards ? [...profile.avoidHazards].sort((a, b) => a - b).join('.') : '';
    return [profile.width, profile.height, profile.maxStep, profile.maxJump, profile.maxDrop, hazards].join(':');
}

function requestBounds(request: NavigationRequest): NavigationRegion {
    const margin = Math.max(2, Math.ceil(request.profile.width), request.profile.maxDrop, request.profile.maxJump);
    return {
        minX: Math.min(normalizeCell(request.start.x), normalizeCell(request.goal.x)) - margin,
        maxX: Math.max(normalizeCell(request.start.x), normalizeCell(request.goal.x)) + margin,
        minZ: Math.min(normalizeCell(request.start.z), normalizeCell(request.goal.z)) - margin,
        maxZ: Math.max(normalizeCell(request.start.z), normalizeCell(request.goal.z)) + margin,
    };
}

function intersects(a: NavigationRegion, b: NavigationRegion): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function pathRegions(path: NavigationPath): Set<string> {
    return new Set(path.nodes.map((node) => revisionRegionKey(regionCoordinate(node.x), regionCoordinate(node.z))));
}

export class NavigationPlanner {
    private readonly navigator: VoxelNavigator;
    private readonly maxNodesPerTick: number;
    private readonly maxNewJobsPerTick: number;
    private readonly now: () => number;
    private readonly isOwnerActive: (ownerId: number) => boolean;
    private readonly jobs = new Map<string, PlannerJob>();
    private readonly queuedKeys: string[] = [];
    private readonly activeKeys: string[] = [];
    private readonly results = new Map<number, NavigationTicketResult>();
    private readonly ticketJobs = new Map<number, string>();
    private readonly ticketOwners = new Map<number, number>();
    private readonly ownerTickets = new Map<number, number>();
    private readonly revisions = new Map<string, number>();
    private readonly cache = new Map<string, CachedPath>();
    private nextTicketId = 1;
    private cacheHits = 0;

    constructor(world: NavigationWorld, options: NavigationPlannerOptions = {}) {
        this.navigator = new VoxelNavigator(world);
        this.maxNodesPerTick = positiveInteger(options.maxNodesPerTick, DEFAULT_MAX_NODES_PER_TICK);
        this.maxNewJobsPerTick = positiveInteger(options.maxNewJobsPerTick, DEFAULT_MAX_NEW_JOBS_PER_TICK);
        this.now = options.now ?? (() => Date.now());
        this.isOwnerActive = options.isOwnerActive ?? (() => true);
    }

    request(ownerId: number, request: NavigationRequest): NavigationTicket {
        this.pruneExpiredCache();
        const bounds = requestBounds(request);
        const key = this.makeRequestKey(request, bounds);
        const previousTicketId = this.ownerTickets.get(ownerId);
        if (previousTicketId !== undefined
            && this.results.get(previousTicketId)?.status === 'pending'
            && this.ticketJobs.get(previousTicketId) === key) {
            return { id: previousTicketId, ownerId };
        }
        if (previousTicketId !== undefined) this.release({ id: previousTicketId, ownerId });
        const ticket = { id: this.nextTicketId++, ownerId };
        this.ticketOwners.set(ticket.id, ownerId);
        this.ownerTickets.set(ownerId, ticket.id);
        if (!this.isOwnerActive(ownerId)) {
            this.results.set(ticket.id, { status: 'failed', path: null, failure: 'cancelled' });
            return ticket;
        }

        const cached = this.cache.get(key);
        if (cached && cached.expiresAt >= this.now()) {
            this.cacheHits += 1;
            this.results.set(ticket.id, { status: 'complete', path: cached.path, failure: null });
            return ticket;
        }

        this.results.set(ticket.id, { status: 'pending', path: null, failure: null });
        this.ticketJobs.set(ticket.id, key);
        const shared = this.jobs.get(key);
        if (shared) {
            shared.tickets.add(ticket.id);
            return ticket;
        }

        const job: PlannerJob = {
            key,
            request: {
                ...request,
                start: { ...request.start },
                goal: { ...request.goal },
                profile: { ...request.profile },
            },
            bounds,
            tickets: new Set([ticket.id]),
            search: null,
            state: 'queued',
        };
        this.jobs.set(key, job);
        this.queuedKeys.push(key);
        return ticket;
    }

    getResult(ticket: NavigationTicket): NavigationTicketResult {
        return this.results.get(ticket.id) ?? { status: 'failed', path: null, failure: 'cancelled' };
    }

    tickBudget(): NavigationPlannerTickResult {
        const result: NavigationPlannerTickResult = { started: 0, expanded: 0, completed: 0, failed: 0 };
        this.pruneExpiredCache();
        this.cancelInactiveOwners();

        while (result.started < this.maxNewJobsPerTick && this.queuedKeys.length > 0) {
            const key = this.queuedKeys.shift()!;
            const job = this.jobs.get(key);
            if (!job || job.state !== 'queued' || job.tickets.size === 0) continue;
            job.search = this.navigator.beginSearch(job.request);
            job.state = 'active';
            this.activeKeys.push(key);
            result.started += 1;
        }

        let remainingBudget = this.maxNodesPerTick;
        const jobsThisTick = Math.min(this.activeKeys.length, remainingBudget);
        for (let slot = 0; slot < jobsThisTick && remainingBudget > 0; slot += 1) {
            const key = this.activeKeys.shift()!;
            const job = this.jobs.get(key);
            if (!job || job.state !== 'active' || !job.search) {
                continue;
            }
            const remainingJobs = Math.max(1, jobsThisTick - slot);
            const slice = Math.max(1, Math.floor(remainingBudget / remainingJobs));
            const before = job.search.getExpandedNodes();
            const state = job.search.step(slice);
            const spent = job.search.getExpandedNodes() - before;
            result.expanded += spent;
            remainingBudget -= spent;
            if (state === 'complete') {
                const path = job.search.getResult()!;
                this.completeJob(job, path);
                result.completed += 1;
                continue;
            }
            if (state === 'failed') {
                this.failJob(job, job.search.getFailureReason() ?? 'no_path');
                result.failed += 1;
                continue;
            }
            this.activeKeys.push(key);
            if (spent === 0) break;
        }
        return result;
    }

    invalidateRegion(region: NavigationRegion): void {
        const minRegionX = regionCoordinate(region.minX);
        const maxRegionX = regionCoordinate(region.maxX);
        const minRegionZ = regionCoordinate(region.minZ);
        const maxRegionZ = regionCoordinate(region.maxZ);
        const invalidated = new Set<string>();
        for (let z = minRegionZ; z <= maxRegionZ; z += 1) {
            for (let x = minRegionX; x <= maxRegionX; x += 1) {
                const key = revisionRegionKey(x, z);
                invalidated.add(key);
                this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
            }
        }
        for (const [key, cached] of this.cache) {
            if (intersects(cached.bounds, region) || [...invalidated].some((entry) => cached.regions.has(entry))) this.cache.delete(key);
        }
        for (const job of [...this.jobs.values()]) {
            if (intersects(job.bounds, region)) this.failJob(job, 'cancelled');
        }
    }

    cancelOwner(ownerId: number): void {
        const released: number[] = [];
        for (const [ticketId, ticketOwner] of this.ticketOwners) {
            if (ticketOwner !== ownerId) continue;
            this.cancelTicket(ticketId);
            released.push(ticketId);
        }
        for (const ticketId of released) {
            this.results.delete(ticketId);
            this.ticketJobs.delete(ticketId);
            this.ticketOwners.delete(ticketId);
        }
        this.ownerTickets.delete(ownerId);
    }

    release(ticket: NavigationTicket): void {
        if (this.results.get(ticket.id)?.status === 'pending') this.cancelTicket(ticket.id);
        this.results.delete(ticket.id);
        this.ticketJobs.delete(ticket.id);
        this.ticketOwners.delete(ticket.id);
        if (this.ownerTickets.get(ticket.ownerId) === ticket.id) this.ownerTickets.delete(ticket.ownerId);
    }

    clear(): void {
        for (const job of [...this.jobs.values()]) this.failJob(job, 'cancelled');
        this.jobs.clear();
        this.queuedKeys.length = 0;
        this.activeKeys.length = 0;
        this.cache.clear();
        this.revisions.clear();
        this.results.clear();
        this.ticketJobs.clear();
        this.ticketOwners.clear();
        this.ownerTickets.clear();
    }

    getDebugState(): { sharedJobs: number; queuedJobs: number; activeJobs: number; cacheEntries: number; cacheHits: number } {
        return {
            sharedJobs: this.jobs.size,
            queuedJobs: this.queuedKeys.filter((key) => this.jobs.get(key)?.state === 'queued').length,
            activeJobs: this.activeKeys.filter((key) => this.jobs.get(key)?.state === 'active').length,
            cacheEntries: this.cache.size,
            cacheHits: this.cacheHits,
        };
    }

    private makeRequestKey(request: NavigationRequest, bounds: NavigationRegion): string {
        const start = `${normalizeCell(request.start.x)},${Math.round(request.start.y)},${normalizeCell(request.start.z)}`;
        const goalRegion = `${Math.floor(normalizeCell(request.goal.x) / GOAL_REGION_SIZE)},${Math.floor(normalizeCell(request.goal.z) / GOAL_REGION_SIZE)}`;
        const goalHeightRegion = Math.floor((Number.isFinite(request.goal.y) ? request.goal.y : 0) / GOAL_REGION_SIZE);
        const nodeBudget = positiveInteger(request.maxExpandedNodes, 1);
        return `${start}|${goalRegion},${goalHeightRegion}|${profileKey(request.profile)}|${nodeBudget}|${this.revisionSignature(bounds)}`;
    }

    private revisionSignature(bounds: NavigationRegion): string {
        const values: string[] = [];
        for (let z = regionCoordinate(bounds.minZ); z <= regionCoordinate(bounds.maxZ); z += 1) {
            for (let x = regionCoordinate(bounds.minX); x <= regionCoordinate(bounds.maxX); x += 1) {
                const key = revisionRegionKey(x, z);
                values.push(`${key}:${this.revisions.get(key) ?? 0}`);
            }
        }
        return values.join(';');
    }

    private completeJob(job: PlannerJob, path: NavigationPath): void {
        for (const ticketId of job.tickets) {
            this.results.set(ticketId, { status: 'complete', path, failure: null });
            this.ticketJobs.delete(ticketId);
        }
        this.cache.set(job.key, {
            path,
            expiresAt: this.now() + CACHE_TTL_MILLISECONDS,
            regions: pathRegions(path),
            bounds: job.bounds,
        });
        this.jobs.delete(job.key);
    }

    private failJob(job: PlannerJob, failure: NavigationFailureReason): void {
        for (const ticketId of job.tickets) {
            this.results.set(ticketId, { status: 'failed', path: null, failure });
            this.ticketJobs.delete(ticketId);
        }
        this.jobs.delete(job.key);
    }

    private cancelTicket(ticketId: number): void {
        const jobKey = this.ticketJobs.get(ticketId);
        const job = jobKey ? this.jobs.get(jobKey) : null;
        job?.tickets.delete(ticketId);
        this.ticketJobs.delete(ticketId);
        this.results.set(ticketId, { status: 'failed', path: null, failure: 'cancelled' });
        if (job && job.tickets.size === 0) this.jobs.delete(job.key);
    }

    private cancelInactiveOwners(): void {
        const inactive = new Set<number>();
        for (const [ticketId, ownerId] of this.ticketOwners) {
            if (this.results.get(ticketId)?.status !== 'pending') continue;
            if (!this.isOwnerActive(ownerId)) inactive.add(ownerId);
        }
        for (const ownerId of inactive) this.cancelOwner(ownerId);
    }

    private pruneExpiredCache(): void {
        const now = this.now();
        for (const [key, cached] of this.cache) {
            if (cached.expiresAt < now) this.cache.delete(key);
        }
    }
}
