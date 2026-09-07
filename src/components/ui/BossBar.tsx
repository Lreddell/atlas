import React, { useEffect, useReducer } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { reduceBossBarState } from './bossBarState';
import { soundManager } from '../../systems/sound/SoundManager';

// Reusable boss / objective health bar. Driven entirely by the game event bus
// (boss:spawned / boss:damaged / boss:defeated / boss:shield / boss:polarity /
// boss:form) so it has no direct dependency on the entity or combat systems.

// Phase thresholds (fraction of max HP) where the boss escalates. The bar draws a
// segment marker at each so players can read upcoming phase changes, modular:
// extend this list (or, later, feed it per-boss from boss:spawned) for any number
// of phases. Magnetic Warden: the Aegis at two thirds, the Storm at one third.
const PHASE_MARKERS: Readonly<Record<string, readonly number[]>> = {
    magnetic_warden: [2 / 3, 1 / 3],
    bell_titan: [0.67, 0.34],
};

const FORM_NUMERALS = ['', 'I', 'II', 'III'];

// A small Atlas-pixel diamond pip that divides the bar at a phase threshold :
// a segmented health-bar marker, kept crisp (shapeRendering=crispEdges) and
// beveled to match the chunky Atlas UI. Spans the full bar height so it reads as
// a notch through the fill, shield, and empty track alike.
const PhaseMarker: React.FC<{ at: number }> = ({ at }) => (
    <div
        className="pointer-events-none absolute top-0 h-full -translate-x-1/2"
        style={{ left: `${at * 100}%` }}
    >
        <svg width="10" height="16" viewBox="0 0 10 16" shapeRendering="crispEdges" className="block h-full">
            {/* hard near-black outline (the segment cut) */}
            <polygon points="5,0 10,8 5,16 0,8" fill="#08080c" />
            {/* bone-white diamond face, reads on red, blue, and purple fills */}
            <polygon points="5,2 8,8 5,14 2,8" fill="#f3ead4" />
            {/* top bevel highlight */}
            <polygon points="5,2 8,8 2,8" fill="#ffffff" fillOpacity="0.5" />
        </svg>
    </div>
);

export const BossBar: React.FC = () => {
    const [boss, dispatch] = useReducer(reduceBossBarState, null);
    // Shield layer: `crystals` is the fraction of the form's tower crystals still
    // standing. It only ever drops when a crystal is broken (never on its own),
    // so the purple layer reads as "how many towers are left to climb".
    const [shield, setShield] = React.useState<{ crystals: number; max: number }>({ crystals: 0, max: 0 });
    // Crystal count for the readout under the bar: ignited per form, lost one by one.
    const [layers, setLayers] = React.useState<{ standing: number; total: number }>({ standing: 0, total: 0 });
    // Boss polarity (+1 red / -1 blue / 0 unknown), tints the health bar.
    const [polarity, setPolarity] = React.useState(0);
    // Brief white pulse when the boss crosses a phase threshold.
    const [phasePulse, setPhasePulse] = React.useState(false);
    // The Warden's current form (I Warden / II Aegis / III Storm).
    const [form, setForm] = React.useState<{ form: number; name: string } | null>(null);

    useEffect(() => {
        const offSpawned = gameEvents.on('boss:spawned', ({ bossId, entityId, name, maxHp }) => {
            dispatch({ type: 'spawned', bossId, entityId, name, maxHp });
            setShield({ crystals: 0, max: 0 });
            setLayers({ standing: 0, total: 0 });
            setPolarity(0);
            setForm(null);
        });
        const offDamaged = gameEvents.on('boss:damaged', ({ bossId, entityId, hp, maxHp }) => {
            dispatch({ type: 'damaged', bossId, entityId, hp, maxHp });
        });
        const offDefeated = gameEvents.on('boss:defeated', ({ bossId, entityId }) => {
            dispatch({ type: 'defeated', bossId, entityId });
            setShield({ crystals: 0, max: 0 });
            setLayers({ standing: 0, total: 0 });
            setForm(null);
        });
        const offCleared = gameEvents.on('boss:cleared', () => {
            dispatch({ type: 'cleared' });
            setShield({ crystals: 0, max: 0 });
            setLayers({ standing: 0, total: 0 });
            setForm(null);
        });
        // The first shield event after spawn carries the full amount → use it as max.
        const offShield = gameEvents.on('boss:shield', ({ crystals }) =>
            setShield((s) => ({ crystals, max: Math.max(s.max, crystals) })));
        const offVulnerable = gameEvents.on('boss:vulnerable', () =>
            setShield((s) => ({ ...s, crystals: 0 })));
        // The crystal readout: a form ignites its crystals, each break drops one.
        const offCrystals = gameEvents.on('boss:crystals', ({ mode, crystals }) =>
            setLayers(mode === 'ignite' ? { standing: crystals.length, total: crystals.length } : { standing: 0, total: 0 }));
        const offLost = gameEvents.on('boss:crystal-lost', ({ remaining }) =>
            setLayers((l) => ({ ...l, standing: Math.max(0, Math.min(l.total, remaining)) })));
        // Audible telegraph + bar colour each time the boss swaps polarity
        // (editable: sounds/magnetic_warden/polarity).
        const offPolarity = gameEvents.on('boss:polarity', ({ polarity: p }) => {
            setPolarity(p);
            soundManager.play('entity.magnetic_warden.polarity', { volume: 0.6 });
        });
        // Flash the bar when the boss escalates into a new phase.
        let pulseTimer: ReturnType<typeof setTimeout> | undefined;
        const offPhase = gameEvents.on('boss:phase', () => {
            setPhasePulse(true);
            if (pulseTimer) clearTimeout(pulseTimer);
            pulseTimer = setTimeout(() => setPhasePulse(false), 450);
        });
        const offForm = gameEvents.on('boss:form', ({ form: f, name }) => setForm({ form: f, name }));
        return () => {
            offSpawned(); offDamaged(); offDefeated(); offCleared();
            offShield(); offVulnerable(); offCrystals(); offLost(); offPolarity(); offPhase(); offForm();
            if (pulseTimer) clearTimeout(pulseTimer);
        };
    }, []);

    if (!boss) return null;

    const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
    const shieldPct = shield.max > 0 ? Math.max(0, Math.min(1, shield.crystals / shield.max)) : 0;
    // Health fill tints to the boss's current polarity (red = +, blue = −).
    const fill = boss.bossId === 'bell_titan'
        ? 'linear-gradient(180deg, #d6bd87 0%, #8a6335 55%, #49351f 100%)'
        : polarity < 0
        ? 'linear-gradient(180deg, #6ab0ff 0%, #1e7ae0 55%, #0a3f8f 100%)'
        : 'linear-gradient(180deg, #ff6a6a 0%, #e01010 55%, #a00000 100%)';

    return (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[150] flex w-[520px] -translate-x-1/2 flex-col items-center">
            <div className="mb-1 font-pixel text-lg text-white [text-shadow:2px_2px_0px_#000]">
                {boss.name} {Math.ceil(boss.hp)} / {boss.maxHp}
            </div>
            <div
                className="relative h-4 w-full overflow-hidden border border-black/80"
                style={{ background: '#1c1c22' }}
            >
                {/* Health underneath. */}
                <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-150"
                    style={{ width: `${pct * 100}%`, background: fill }}
                />
                {/* Purple shield layer on top: one segment per standing tower
                    crystal, revealing the health bar beneath as they are broken. */}
                {shieldPct > 0 && (
                    <div
                        className="absolute inset-y-0 left-0 transition-[width] duration-200"
                        style={{
                            width: `${shieldPct * 100}%`,
                            background: 'linear-gradient(180deg, #c9a3ff 0%, #8e24aa 55%, #5b148f 100%)',
                            boxShadow: 'inset 0 0 6px rgba(255,255,255,0.4)',
                        }}
                    />
                )}
                {/* Phase markers (modular): one Atlas-pixel diamond pip per phase
                    threshold, the Aegis at two thirds, the Storm at one third. */}
                {(PHASE_MARKERS[boss.bossId] ?? []).map((at) => <PhaseMarker key={at} at={at} />)}
                {/* White flash when a phase threshold is crossed. */}
                <div
                    className="absolute inset-0 bg-white transition-opacity duration-200"
                    style={{ opacity: phasePulse ? 0.55 : 0 }}
                />
            </div>
            {form && (
                <div className="mt-1 font-pixel text-xs tracking-wider text-[#e6d8ff] [text-shadow:1px_1px_0px_#000]">
                    FORM {FORM_NUMERALS[form.form] ?? form.form} · {form.name.toUpperCase()}
                </div>
            )}
            {/* The shield readout: the crystals left to break, or EXPOSED. */}
            {form && layers.total > 0 && (
                layers.standing > 0 ? (
                    <div className="mt-[2px] font-pixel text-[10px] tracking-wider text-[#c9a3ff] [text-shadow:1px_1px_0px_#000]">
                        SHIELDED {'◆'.repeat(layers.standing)}{'◇'.repeat(Math.max(0, layers.total - layers.standing))} · break the tower crystal{layers.total > 1 ? 's' : ''}
                    </div>
                ) : (
                    <div className="mt-[2px] animate-pulse font-pixel text-[10px] tracking-wider text-[#ffd166] [text-shadow:1px_1px_0px_#000]">
                        EXPOSED · oppose its colour and strike
                    </div>
                )
            )}
        </div>
    );
};
