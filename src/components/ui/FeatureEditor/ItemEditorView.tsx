
import React, { useState, useMemo } from 'react';
import { ModPack, ItemDefinition, TextureEntry, BlockDefinition } from './editorTypes';
import { soundManager } from '../../../systems/sound/SoundManager';

interface ItemEditorViewProps {
    pack: ModPack;
    onUpdatePack: (pack: ModPack) => void;
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
}

const CATEGORIES = ['building', 'natural', 'functional', 'tools', 'food', 'ingredients'] as const;

export const ItemEditorView: React.FC<ItemEditorViewProps> = ({ pack, onUpdatePack, selectedId, onSelectId }) => {
    const [search, setSearch] = useState('');
    const items = useMemo(() => Object.values(pack.items), [pack.items]);
    const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.id.toLowerCase().includes(search.toLowerCase()));

    const selectedItem = selectedId ? pack.items[selectedId] : null;

    const handleCreateItem = () => {
        const name = 'New Item';
        const slug = name.toLowerCase().replace(/\s+/g, '_');
        const id = `${pack.meta.id}:${slug}_${Date.now().toString().slice(-4)}`;
        
        const newItem: ItemDefinition = {
            id,
            name,
            category: 'ingredients',
            maxStack: 64,
            textureId: '',
            behavior: { type: 'basic' }
        };
        
        onUpdatePack({
            ...pack,
            items: { ...pack.items, [id]: newItem }
        });
        onSelectId(id);
        soundManager.play("ui.click");
    };

    const handleDeleteItem = (id: string) => {
        if (!confirm(`Delete item "${pack.items[id]?.name || id}"?`)) return;
        const nextItems = { ...pack.items };
        delete nextItems[id];
        onUpdatePack({ ...pack, items: nextItems });
        if (selectedId === id) onSelectId(null);
        soundManager.play("ui.click", { pitch: 0.8 });
    };

    const updateSelected = (updates: Partial<ItemDefinition>) => {
        if (!selectedId || !selectedItem) return;
        onUpdatePack({
            ...pack,
            items: {
                ...pack.items,
                [selectedId]: { ...selectedItem, ...updates }
            }
        });
    };

    return (
        <div className="flex h-full bg-black/20">
            {/* List */}
            <div className="w-64 bg-[#121212] border-r border-white/5 flex flex-col">
                <div className="p-3 bg-black/20 flex flex-col gap-2">
                    <input 
                        type="text" 
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search items..."
                        className="bg-black border border-white/10 rounded px-2 py-1.5 text-[10px] outline-none focus:border-blue-500/50"
                    />
                    <button 
                        onClick={handleCreateItem}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                        + New Item
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                    {filtered.map(i => (
                        <div 
                            key={i.id}
                            className={`group relative p-2 rounded-md flex items-center gap-3 cursor-pointer border transition-all ${selectedId === i.id ? 'bg-blue-600/20 border-blue-500/50 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                            onClick={() => onSelectId(i.id)}
                        >
                            <div className="w-8 h-8 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                                {i.textureId && pack.textures[i.textureId] && (
                                    <img src={getTextureThumb(pack.textures[i.textureId].data)} className="w-full h-full image-pixelated" alt="" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-bold truncate ${selectedId === i.id ? 'text-blue-300' : 'text-gray-400'}`}>{i.name}</div>
                                <div className="text-[8px] text-gray-600 font-mono truncate">{i.id}</div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(i.id); }}
                                className="flex items-center justify-center w-7 h-7 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all text-xs"
                                title="Delete Item"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-8">
                {selectedItem ? (
                    <div className="max-w-2xl mx-auto space-y-8">
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Item Definition</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Unique ID</label>
                                    <input type="text" value={selectedItem.id} readOnly className="w-full bg-black/40 border border-white/5 rounded px-3 py-2 text-xs font-mono text-gray-500 cursor-not-allowed" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Display Name</label>
                                    <input type="text" value={selectedItem.name} onChange={e => updateSelected({ name: e.target.value })} className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white outline-none focus:border-blue-500" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Category</label>
                                    <select value={selectedItem.category} onChange={e => updateSelected({ category: e.target.value as any })} className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none">
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Max Stack</label>
                                    <input type="number" min="1" max="64" value={selectedItem.maxStack} onChange={e => updateSelected({ maxStack: parseInt(e.target.value) })} className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white outline-none" />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Visuals & Behavior</h3>
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Icon Texture</label>
                                    <div className="flex gap-2 items-center bg-black/40 p-2 border border-white/5 rounded">
                                        <div className="w-12 h-12 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                                            {selectedItem.textureId && pack.textures[selectedItem.textureId] ? (
                                                <img src={getTextureThumb(pack.textures[selectedItem.textureId].data)} className="w-full h-full image-pixelated" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-700">NONE</div>
                                            )}
                                        </div>
                                        <select 
                                            value={selectedItem.textureId || ''} 
                                            onChange={(e) => updateSelected({ textureId: e.target.value })}
                                            className="flex-1 bg-transparent text-xs text-white outline-none"
                                        >
                                            <option value="">-- None --</option>
                                            {Object.values(pack.textures).map((t: TextureEntry) => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-gray-600 uppercase">Behavior Type</label>
                                        <select 
                                            value={selectedItem.behavior.type} 
                                            onChange={(e) => updateSelected({ behavior: { type: e.target.value as any } })}
                                            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                        >
                                            <option value="basic">Basic Item</option>
                                            <option value="placeBlock">Places Block</option>
                                        </select>
                                    </div>
                                    {selectedItem.behavior.type === 'placeBlock' && (
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-600 uppercase">Linked Block</label>
                                            <select 
                                                value={selectedItem.behavior.blockId || ''} 
                                                onChange={(e) => updateSelected({ behavior: { ...selectedItem.behavior, blockId: e.target.value } })}
                                                className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                            >
                                                <option value="">-- Select Block --</option>
                                                {Object.values(pack.blocks).map((b: BlockDefinition) => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-[#333] font-black uppercase text-[10px] tracking-[1em] animate-pulse">Select Item</div>
                )}
            </div>
        </div>
    );
};

function getTextureThumb(data: number[]) {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), 16, 16), 0, 0);
    return canvas.toDataURL();
}
