// Minimum player-facing Campaign Atlas (Gate 0).
//
// An exploration record, not a quest log: region identity, a hand-drawn style
// sketch line, a bearing + distance to the Heartwood origin, crest/keystone
// ownership, waystone/anchor state, and the challenge-layer state. It never
// shows live enemy positions, undiscovered loot, or exact boss mechanics.
//
// Opened via `/atlas`, the J key, or right-clicking a proving waystone/anchor.
// All buttons drive the same production paths as the `/campaign` commands.

import React from 'react';
import type { AtlasPanelData } from '../../hooks/useCampaignProving';

export interface AtlasPanelActions {
  onBuild: () => void;
  onStart: () => void;
  onFail: () => void;
  onClear: () => void;
  onRematch: () => void;
  onTravel: () => void;
  onAnchorRest: () => void;
  onAnchorRefill: () => void;
  onFrenzy: () => void;
  onBloodmoonOn: () => void;
  onBloodmoonOff: () => void;
  onStatus: () => void;
}

interface Props {
  data: AtlasPanelData;
  actions: AtlasPanelActions;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-amber-200/80 mb-1">{title}</div>
      <div className="text-[13px] leading-snug text-stone-200">{children}</div>
    </div>
  );
}

function Btn({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      className="px-2 py-1 mr-1 mb-1 rounded bg-stone-700 hover:bg-stone-600 text-stone-100 text-[12px] border border-stone-600"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
    >
      {label}
    </button>
  );
}

export const CampaignAtlasPanel: React.FC<Props> = ({ data, actions, onClose }) => {
  const waystoneEntries = Object.entries(data.waystones);
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-h-[80vh] overflow-y-auto rounded-lg border border-amber-200/30 bg-stone-900/95 p-4 shadow-2xl z-40"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-bold text-amber-100 tracking-wide">
          Atlas <span className="text-[11px] font-normal text-stone-400">· {data.provenance} world</span>
        </h2>
        <button className="px-2 py-0.5 rounded bg-stone-700 hover:bg-stone-600 text-stone-200 text-[12px]" onClick={onClose}>
          Close (J)
        </button>
      </div>

      <Section title="Region">
        <div>{data.region}</div>
        {data.sketch ? <div className="italic text-stone-300 mt-0.5">“{data.sketch}”</div> : null}
        {data.hint ? <div className="mt-0.5">{data.hint}</div> : null}
        {data.distanceBlocks > 0 ? (
          <div className="text-stone-400">Heartwood bearing {data.bearingDegrees}° · ~{data.distanceBlocks}m</div>
        ) : null}
      </Section>

      <Section title="Progression">
        <div>Crests: {data.crests.length > 0 ? data.crests.join(', ') : 'none'}</div>
        <div>Keystones: {data.keystones.length > 0 ? data.keystones.join(', ') : 'none'}</div>
        <div>Encounter: {data.encounterPhase}{data.attemptCount > 0 ? ` (attempts: ${data.attemptCount})` : ''}</div>
        <div>Transform: {data.transformApplied ? 'applied' : 'not applied'}</div>
      </Section>

      <Section title="Waystones & Anchor">
        {waystoneEntries.length === 0 ? <div className="text-stone-400">No waystones discovered.</div> : null}
        {waystoneEntries.map(([site, w]) => (
          <div key={site}>◈ {site}: {w.active ? 'active' : w.discovered ? 'discovered (dormant)' : 'unknown'}</div>
        ))}
        <div className="mt-1">
          Anchor: {data.anchor ? `${data.anchor.charges}/${data.anchor.maxCharges} (refill: ${data.anchor.refillItemId})` : 'none placed'}
        </div>
        <div className="mt-1">
          <Btn label="Travel" onClick={actions.onTravel} title="Waystone travel to the site node" />
          <Btn label="Anchor rest" onClick={actions.onAnchorRest} title="Attune respawn to the anchor" />
          <Btn label="Anchor refill" onClick={actions.onAnchorRefill} title="Refill charges with cobblestone" />
        </div>
      </Section>

      <Section title="Challenge layer">
        <div>
          Blood Moon: {data.bloodMoonDemonstrable ? (data.bloodMoonFixture && !data.bellTitanDefeated ? 'fixture eligibility (no Bell Titan clear)' : 'eligible') : 'locked'}
        </div>
        <div className="mt-1">
          <Btn label="Fixture on" onClick={actions.onBloodmoonOn} />
          <Btn label="Fixture off" onClick={actions.onBloodmoonOff} />
          <Btn label="Start Frenzy" onClick={actions.onFrenzy} title="Manual Frenzy at the cleared waystone" />
        </div>
      </Section>

      <Section title="Proving ground (Gate 0, dev world only)">
        <div>
          <Btn label="Build" onClick={actions.onBuild} />
          <Btn label="Start" onClick={actions.onStart} />
          <Btn label="Fail" onClick={actions.onFail} />
          <Btn label="Clear" onClick={actions.onClear} />
          <Btn label="Rematch" onClick={actions.onRematch} />
          <Btn label="Status" onClick={actions.onStatus} />
        </div>
      </Section>
    </div>
  );
};
