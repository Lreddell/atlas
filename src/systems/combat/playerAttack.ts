// One simulation clock owns damage, both view animations and weapon recovery.
// No wall-clock timers: menus freeze recovery and cancelled windups cannot hit.
export interface AttackState {
    elapsed: number;
    duration: number;
    strikeAt: number;
    struck: boolean;
    cancelled: boolean;
    combo: number;
    idle: number;
    kind: string;
}
export const createAttackState = (): AttackState => ({ elapsed: 0, duration: 0, strikeAt: 0, struck: true, cancelled: false, combo: -1, idle: 0, kind: 'unarmed' });
export const playerAttack = createAttackState();
export const playerMining = { active: false, elapsed: 0 };
export function attackBusy(s: AttackState): boolean { return s.elapsed < s.duration; }
export function beginAttack(s: AttackState, kind: string, duration: number): boolean {
    if (attackBusy(s) || !Number.isFinite(duration) || duration <= 0) return false;
    s.combo = s.idle > 0.9 || s.kind !== kind ? 0 : (s.combo + 1) % 3;
    s.elapsed = 0; s.duration = duration; s.strikeAt = duration * 0.5;
    s.struck = false; s.cancelled = false; s.idle = 0; s.kind = kind;
    return true;
}
export function cancelAttack(s: AttackState): void { s.cancelled = true; }
/** Full 3D angle prevents a horizontal sweep from also hitting above/behind us. */
export function inAttackArc(dx: number, dy: number, dz: number, fx: number, fy: number, fz: number, reach: number, angle: number): boolean {
    const distance = Math.hypot(dx, dy, dz);
    return distance <= reach && distance > 0.001
        && (dx * fx + dy * fy + dz * fz) / distance >= Math.cos(angle * Math.PI / 360);
}
/** Returns true once, including when a long frame crosses the strike boundary. */
export function advanceAttack(s: AttackState, dt: number): boolean {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (!attackBusy(s)) { s.idle += step; return false; }
    s.elapsed = Math.min(s.duration, s.elapsed + step);
    if (!s.struck && s.elapsed >= s.strikeAt) {
        s.struck = true;
        return !s.cancelled;
    }
    return false;
}
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
/** Joint-space strike: positive shoulder X reaches forward (-Z); elbows bend forward. */
export function attackPose(s: AttackState) {
    const u = s.duration > 0 ? s.elapsed / s.duration : 1;
    const wind = smooth(u / 0.38);
    const cut = smooth((u - 0.38) / 0.20);
    const settle = smooth((u - 0.58) / 0.42);
    const weight = attackBusy(s) && !s.cancelled ? 1 : 0;
    const side = s.combo === 1 ? -1 : 1;
    return { weight, shoulder: (0.3 + wind * 2.1 - cut * 1.5) * (1 - settle),
        elbow: (0.25 + wind * 0.8 - cut * 0.65) * (1 - settle),
        twist: side * (-wind * 0.35 + cut * 0.65) * (1 - settle),
        sweep: side * (-wind * 0.5 + cut * 0.9) * (1 - settle),
        thrust: s.kind === 'spear' || s.combo === 2 ? Math.sin(cut * Math.PI) * (1 - settle) : 0 };
}
