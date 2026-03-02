
import React, { useMemo } from 'react';
import { ModPack, RecipeDefinition, BlockDefinition, ItemDefinition } from './editorTypes';
import { soundManager } from '../../../systems/sound/SoundManager';

interface RecipeEditorViewProps {
    pack: ModPack;
    onUpdatePack: (pack: ModPack) => void;
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
}

export const RecipeEditorView: React.FC<RecipeEditorViewProps> = ({ pack, onUpdatePack, selectedId, onSelectId }) => {
    const recipes = useMemo(() => Object.values(pack.recipes), [pack.recipes]);
    const selectedRecipe = selectedId ? pack.recipes[selectedId] : null;

    const allIngredients = useMemo(() => {
        return [
            ...Object.values(pack.blocks).map((b: BlockDefinition) => ({ id: b.id, name: b.name, data: b.textures.all ? pack.textures[b.textures.all]?.data : null })),
            ...Object.values(pack.items).map((i: ItemDefinition) => ({ id: i.id, name: i.name, data: i.textureId ? pack.textures[i.textureId]?.data : null }))
        ];
    }, [pack.blocks, pack.items, pack.textures]);

    const handleCreateRecipe = () => {
        const id = `recipe_${Date.now()}`;
        const newRecipe: RecipeDefinition = {
            id,
            type: 'shaped',
            gridSize: 3,
            pattern: new Array(9).fill(null),
            output: { id: '', count: 1 }
        };
        onUpdatePack({ ...pack, recipes: { ...pack.recipes, [id]: newRecipe } });
        onSelectId(id);
        soundManager.play("ui.click");
    };

    const handleDeleteRecipe = (id: string) => {
        if (!confirm(`Delete recipe?`)) return;
        const next = { ...pack.recipes };
        delete next[id];
        onUpdatePack({ ...pack, recipes: next });
        if (selectedId === id) onSelectId(null);
        soundManager.play("ui.click", { pitch: 0.8 });
    };

    const updateSelected = (updates: Partial<RecipeDefinition>) => {
        if (!selectedId || !selectedRecipe) return;
        onUpdatePack({
            ...pack,
            recipes: {
                ...pack.recipes,
                [selectedId]: { ...selectedRecipe, ...updates }
            }
        });
    };

    const setPatternSlot = (idx: number, id: string | null) => {
        if (!selectedRecipe) return;
        const next = [...selectedRecipe.pattern];
        next[idx] = id;
        updateSelected({ pattern: next });
        soundManager.play("ui.click", { pitch: 1.5 });
    };

    const renderSlot = (idx: number) => {
        const slotId = selectedRecipe?.pattern[idx];
        const item = allIngredients.find(i => i.id === slotId);

        return (
            <div className="group relative">
                <div 
                    className="w-16 h-16 bg-[#1a1a1a] border-2 border-white/10 hover:border-blue-500/50 rounded-lg flex items-center justify-center cursor-pointer overflow-hidden transition-all"
                    onClick={() => {}}
                >
                    {item ? (
                        <div className="w-full h-full p-2">
                             {item.data ? (
                                <img src={getTextureThumb(item.data)} className="w-full h-full image-pixelated" alt="" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] text-white/20 text-center">{item.name}</div>
                             )}
                        </div>
                    ) : (
                        <div className="text-white/5 font-black text-2xl">+</div>
                    )}
                </div>
                {/* Minimal context-less selector for now - cycles on click or simple dropdown */}
                <select 
                    value={slotId || ''} 
                    onChange={(e) => setPatternSlot(idx, e.target.value || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                >
                    <option value="">Empty</option>
                    {allIngredients.map(ing => (
                        <option key={ing.id} value={ing.id}>{ing.name}</option>
                    ))}
                </select>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-black/20">
            {/* List */}
            <div className="w-64 bg-[#121212] border-r border-white/5 flex flex-col">
                <div className="p-3 bg-black/20 flex flex-col gap-2">
                    <button 
                        onClick={handleCreateRecipe}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                        + New Recipe
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                    {recipes.map(r => (
                        <div 
                            key={r.id}
                            className={`group relative p-2 rounded-md flex items-center gap-3 cursor-pointer border transition-all ${selectedId === r.id ? 'bg-blue-600/20 border-blue-500/50 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                            onClick={() => onSelectId(r.id)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-bold truncate ${selectedId === r.id ? 'text-blue-300' : 'text-gray-400'}`}>
                                    {r.output.id ? (allIngredients.find(i => i.id === r.output.id)?.name || 'Unknown') : 'New Recipe'}
                                </div>
                                <div className="text-[8px] text-gray-600 font-mono truncate">{r.type}</div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(r.id); }}
                                className="flex items-center justify-center w-7 h-7 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all text-xs"
                                title="Delete Recipe"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto p-8">
                {selectedRecipe ? (
                    <div className="max-w-2xl mx-auto space-y-12">
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 pb-2">Configuration</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Type</label>
                                    <select 
                                        value={selectedRecipe.type} 
                                        onChange={e => updateSelected({ type: e.target.value as any })}
                                        className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                    >
                                        <option value="shaped">Shaped</option>
                                        <option value="shapeless">Shapeless</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-gray-600 uppercase">Grid Size</label>
                                    <select 
                                        value={selectedRecipe.gridSize} 
                                        onChange={e => {
                                            const size = parseInt(e.target.value) as 2 | 3;
                                            updateSelected({ gridSize: size, pattern: new Array(size * size).fill(null) });
                                        }}
                                        className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none"
                                    >
                                        <option value="2">2x2 (Player)</option>
                                        <option value="3">3x3 (Table)</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        <section className="bg-black/40 p-12 rounded-3xl border border-white/5 flex items-center justify-center gap-12">
                             {/* Crafting Grid */}
                             <div className={`grid gap-1 ${selectedRecipe.gridSize === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                 {selectedRecipe.pattern.map((_, i) => (
                                     <React.Fragment key={i}>{renderSlot(i)}</React.Fragment>
                                 ))}
                             </div>

                             <div className="text-4xl text-white/10 font-black">→</div>

                             {/* Output Slot */}
                             <div className="flex flex-col items-center gap-3">
                                 <div className="relative group">
                                     <div className="w-20 h-20 bg-blue-900/10 border-2 border-blue-500/30 rounded-xl flex items-center justify-center overflow-hidden">
                                         {selectedRecipe.output.id ? (
                                             <div className="w-full h-full p-3">
                                                 {allIngredients.find(i => i.id === selectedRecipe.output.id)?.data ? (
                                                     <img src={getTextureThumb(allIngredients.find(i => i.id === selectedRecipe.output.id)!.data!)} className="w-full h-full image-pixelated" alt="" />
                                                 ) : (
                                                     <div className="text-[8px] text-blue-300 text-center uppercase font-black">{allIngredients.find(i => i.id === selectedRecipe.output.id)?.name}</div>
                                                 )}
                                             </div>
                                         ) : (
                                             <div className="text-blue-500/20 text-3xl font-black">?</div>
                                         )}
                                     </div>
                                     <select 
                                         value={selectedRecipe.output.id} 
                                         onChange={e => updateSelected({ output: { ...selectedRecipe.output, id: e.target.value } })}
                                         className="absolute inset-0 opacity-0 cursor-pointer"
                                     >
                                         <option value="">Result</option>
                                         {allIngredients.map(ing => (
                                             <option key={ing.id} value={ing.id}>{ing.name}</option>
                                         ))}
                                     </select>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     <label className="text-[9px] font-bold text-gray-500 uppercase">Count</label>
                                     <input 
                                         type="number" min="1" max="64"
                                         value={selectedRecipe.output.count}
                                         onChange={e => updateSelected({ output: { ...selectedRecipe.output, count: parseInt(e.target.value) || 1 } })}
                                         className="w-12 bg-black border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                     />
                                 </div>
                             </div>
                        </section>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-[#333] font-black uppercase text-[10px] tracking-[1em] animate-pulse">Select Recipe</div>
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
