import React, { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PlayerModel } from '../PlayerModel';
import { createEmptyEquipment } from '../../systems/registry/equipment';
import { BUILTIN_SKINS, useSkinLibrary, equipSkin, addImportedSkin, removeImportedSkin, importMinecraftSkin, type PlayerSkin, type SkinModel } from '../../systems/player/playerSkins';
import { MenuButton } from './mainMenu/MainMenuControls';
import { soundManager } from '../../systems/sound/SoundManager';

const EMPTY_EQUIPMENT = createEmptyEquipment();
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Flat pixel portraits keep the carousel lightweight: only the large preview needs WebGL. */
const SkinPortrait: React.FC<{ skin: PlayerSkin }> = ({ skin }) => {
    const p = skin.palette;
    if (skin.texture) {
        const arm = skin.model === 'slim' ? 3 : 4;
        const tile = (x: number, y: number, w: number, h: number, u: number, v: number, overlay = false) => <svg key={`${x}-${y}-${overlay}`} x={x} y={y} width={w} height={h} viewBox={`${u} ${v} ${w} ${h}`}><image href={skin.texture} width="64" height="64" style={{ imageRendering: 'pixelated' }} /></svg>;
        return <svg viewBox="0 0 16 32" className="h-32 w-16" aria-hidden="true" shapeRendering="crispEdges">
            {tile(4, 0, 8, 8, 8, 8)}{tile(4, 0, 8, 8, 40, 8, true)}
            {tile(4, 8, 8, 12, 20, 20)}{!skin.legacy && tile(4, 8, 8, 12, 20, 36, true)}
            {tile(4 - arm, 8, arm, 12, 44, 20)}{tile(12, 8, arm, 12, skin.legacy ? 44 : 36, skin.legacy ? 20 : 52)}
            {tile(4, 20, 4, 12, 4, 20)}{tile(8, 20, 4, 12, skin.legacy ? 4 : 20, skin.legacy ? 20 : 52)}
            {!skin.legacy && <>{tile(4 - arm, 8, arm, 12, 44, 36, true)}{tile(12, 8, arm, 12, 52, 52, true)}{tile(4, 20, 4, 12, 4, 36, true)}{tile(8, 20, 4, 12, 4, 52, true)}</>}
        </svg>;
    }
    return <svg viewBox="0 0 16 32" className="h-32 w-16" aria-hidden="true" shapeRendering="crispEdges">
        <path fill={hex(p.skin)} d="M4 0h8v8H4zM0 16h3v4H0zm13 0h3v4h-3z" />
        <path fill={hex(p.hair)} d="M4 0h8v3H4z" />
        <path fill="#1a1a1a" d="M6 4h1v1H6zm3 0h1v1H9z" />
        <path fill={hex(p.jacket)} d="M4 8h8v12H4zM0 8h3v9H0zm13 0h3v9h-3z" />
        <path fill={hex(p.jacketDark)} d="M4 8h8v3H4z" />
        <path fill={hex(p.trousers)} d="M4 20h3v10H4zm5 0h3v10H9z" />
        <path fill={hex(p.boot)} d="M4 29h3v3H4zm5 0h3v3H9z" />
        {skin.detail === 'scarf' && <path fill={hex(p.jacketDark)} d="M4 8h8v2H4zm5 2h2v6H9z" />}
        {skin.detail === 'vest' && <path fill={hex(p.jacketDark)} d="M4 10h2v8H4zm6 0h2v8h-2z" />}
        {skin.detail === 'goggles' && <path fill="#a9d1d0" d="M5 4h2v2H5zm4 0h2v2H9z" />}
    </svg>;
};

export const SkinsMenu: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const library = useSkinLibrary();
    const skins = [...BUILTIN_SKINS, ...library.imported];
    const [browsed, setBrowsed] = useState(library.selected);
    const [models, setModels] = useState<Record<string, SkinModel>>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const index = Math.max(0, skins.findIndex(s => s.id === browsed));
    const source = skins[index];
    const skin = models[source.id] ? { ...source, model: models[source.id] } : source;
    const equipped = library.selected === skin.id && source.model === skin.model;
    const browse = (next: number) => {
        setBrowsed(skins[(next + skins.length) % skins.length].id);
        setError('');
        soundManager.play('ui.click');
    };
    const run = (action: () => void) => { try { action(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save skin.'); } };
    const importFile = async (file?: File) => {
        if (!file) return;
        setBusy(true); setError('');
        try {
            const imported = await importMinecraftSkin(file);
            addImportedSkin(imported);
            setBrowsed(imported.id);
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not import skin.'); }
        finally { setBusy(false); }
    };
    return <section className="w-[min(900px,calc(100vw-48px))] max-h-[calc(100vh-80px)] overflow-y-auto text-white font-pixel" aria-label="Skins"
        onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); event.stopPropagation(); browse(index + (event.key === 'ArrowLeft' ? -1 : 1));
            }
        }}>
        <h1 className="mb-5 text-center text-xl font-bold text-shadow-lg">Skins</h1>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[40%_1fr]">
            <div className="flex flex-col items-center">
                <div className="h-[min(390px,48vh)] min-h-[220px] w-full cursor-grab active:cursor-grabbing" aria-label={`3D preview of ${skin.name}. Drag to rotate.`}>
                    <Canvas camera={{ position: [-2.2, 1.6, -4.2], fov: 34 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
                        <ambientLight intensity={1.6} />
                        <directionalLight position={[-3, 5, -4]} intensity={2} />
                        <PlayerModel key={skin.id + skin.model} itemType={null} equipment={EMPTY_EQUIPMENT} skin={skin} preview />
                        <mesh position={[0, -0.08, 0]}><boxGeometry args={[1.4, 0.08, 1]} /><meshLambertMaterial color="#515151" /></mesh>
                        <OrbitControls target={[0, 0.98, 0]} enablePan={false} enableZoom={false} minPolarAngle={0.7} maxPolarAngle={1.8} />
                    </Canvas>
                </div>
                <span className="text-xs text-white/70">Drag to rotate</span>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center gap-4">
                <div className="text-center" aria-live="polite"><h2 className="text-lg font-bold text-shadow-lg">{skin.name}</h2><p className="mt-1 text-xs text-white/70">{skin.texture ? 'Imported' : 'Atlas'}</p></div>
                <div className="relative h-48 w-full overflow-hidden" aria-label="Skin carousel" aria-roledescription="carousel">
                    <div className="absolute left-1/2 flex gap-3 transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `translateX(${-index * 112 - 50}px)` }}>
                        {skins.map((entry, i) => <button key={entry.id} type="button" onClick={() => browse(i)} aria-label={entry.name} aria-pressed={index === i} tabIndex={index === i ? 0 : -1}
                            className={`flex h-44 w-[100px] shrink-0 flex-col items-center justify-center gap-2 border-2 px-1 outline-none focus-visible:ring-2 focus-visible:ring-white ${index === i ? 'border-white bg-[#555] shadow-[inset_2px_2px_0_#999,inset_-2px_-2px_0_#333]' : 'border-[#373737] bg-black/30 opacity-60 hover:opacity-100'}`}>
                            <SkinPortrait skin={entry} />
                            <span className="w-full truncate text-[10px]">{entry.name}</span>
                        </button>)}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <MenuButton label="<" tooltip="Previous skin" width="w-12" onClick={() => browse(index - 1)} />
                    <span className="w-20 text-center text-sm tabular-nums">{index + 1} / {skins.length}</span>
                    <MenuButton label=">" tooltip="Next skin" width="w-12" onClick={() => browse(index + 1)} />
                </div>
                {skin.texture && <MenuButton label={`Arms: ${skin.model === 'slim' ? 'Slim' : 'Classic'}`} width="w-64" disabled={skin.legacy} tooltip={skin.legacy ? 'Legacy skins use classic arms' : undefined}
                    onClick={() => setModels(old => ({ ...old, [skin.id]: skin.model === 'slim' ? 'classic' : 'slim' }))} />}
                <MenuButton label={equipped ? 'Selected' : 'Use Skin'} width="w-64" disabled={equipped} onClick={() => run(() => equipSkin(skin))} />
                {skin.texture && <MenuButton label="Remove Skin" width="w-64" small onClick={() => run(() => { removeImportedSkin(skin.id); setBrowsed('explorer'); })} />}
            </div>
        </div>
        {error && <p role="alert" className="mx-auto mt-4 max-w-lg text-center text-sm text-white">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
            <input ref={fileInput} type="file" accept="image/png,.png" className="hidden" aria-label="Import Minecraft skin" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
            <MenuButton label={busy ? 'Importing...' : 'Import Skin'} width="w-48" disabled={busy} onClick={() => fileInput.current?.click()} />
            <MenuButton label="Done" width="w-48" onClick={onDone} />
        </div>
    </section>;
};
