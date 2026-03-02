import React, { useEffect, useState, useRef } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';
import { ModPack, EditorTab } from './editorTypes';
import { PackStorage } from './PackStorage';
import { PackWizard } from './PackWizard';
import { TextureEditorView } from './TextureEditorView';
import { BlockEditorView } from './BlockEditorView';
import { ItemEditorView } from './ItemEditorView';
import { RecipeEditorView } from './RecipeEditorView';
import { ValidationView } from './ValidationView';

interface FeatureEditorProps {
    onBack: () => void;
}

export const FeatureEditor: React.FC<FeatureEditorProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<EditorTab>(() => (localStorage.getItem('atlas_editor_tab') as EditorTab) || 'textures');
    const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('atlas_sidebar_width')) || 260);
    const [packs, setPacks] = useState<ModPack[]>([]);
    const [activePackId, setActivePackId] = useState<string | null>(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    
    // Persistent selection states lifted to survive tab changes
    const [selectedTextureId, setSelectedTextureId] = useState<string | null>(() => localStorage.getItem('atlas_selected_texture_id'));
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => localStorage.getItem('atlas_selected_block_id'));
    const [selectedItemId, setSelectedItemId] = useState<string | null>(() => localStorage.getItem('atlas_selected_item_id'));
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(() => localStorage.getItem('atlas_selected_recipe_id'));

    const isResizingRef = useRef(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        localStorage.setItem('atlas_editor_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        const loadedPacks = PackStorage.loadAllPacks();
        setPacks(loadedPacks);
        const lastActive = PackStorage.getActivePackId();
        if (lastActive && loadedPacks.some(p => p.meta.id === lastActive)) {
            setActivePackId(lastActive);
        } else if (loadedPacks.length > 0) {
            setActivePackId(loadedPacks[0].meta.id);
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingRef.current) {
                const newWidth = Math.max(180, Math.min(500, e.clientX));
                setSidebarWidth(newWidth);
                localStorage.setItem('atlas_sidebar_width', String(newWidth));
            }
        };
        const handleMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = 'default';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const activePack = packs.find(p => p.meta.id === activePackId) || null;

    const handleCreatePack = (id: string, name: string) => {
        const newPack: ModPack = {
            meta: { id, name, version: '1.0.0', author: 'Player', description: 'A new Mod Pack', enabled: true, createdAt: Date.now(), updatedAt: Date.now() },
            textures: {}, blocks: {}, items: {}, recipes: {}
        };
        const updated = [...packs, newPack];
        setPacks(updated);
        PackStorage.savePack(newPack);
        setActivePackId(id);
        PackStorage.setActivePackId(id);
        setIsWizardOpen(false);
        soundManager.play("ui.click");
    };

    const handleSelectPack = (id: string) => {
        setActivePackId(id);
        PackStorage.setActivePackId(id);
        soundManager.play("ui.click");
    };

    const handleDeletePack = (id: string) => {
        const packToDelete = packs.find(p => p.meta.id === id);
        if (!packToDelete) return;
        if (confirm(`Are you sure you want to delete the Mod Pack "${packToDelete.meta.name}"? This cannot be undone.`)) {
            PackStorage.deletePack(id);
            const remaining = packs.filter(p => p.meta.id !== id);
            setPacks(remaining);
            if (activePackId === id) {
                if (remaining.length > 0) {
                    setActivePackId(remaining[0].meta.id);
                    PackStorage.setActivePackId(remaining[0].meta.id);
                } else {
                    setActivePackId(null);
                    PackStorage.setActivePackId(null);
                }
            }
            soundManager.play("ui.click", { pitch: 0.8 });
        }
    };

    const handleToggleEnabled = (id: string) => {
        const pack = packs.find(p => p.meta.id === id);
        if (!pack) return;
        const updated = { 
            ...pack, 
            meta: { ...pack.meta, enabled: !pack.meta.enabled } 
        };
        handleUpdatePack(updated);
        soundManager.play("ui.click", { pitch: updated.meta.enabled ? 1.2 : 0.8 });
    };

    const handleUpdatePack = (updatedPack: ModPack) => {
        setPacks(prev => prev.map(p => p.meta.id === updatedPack.meta.id ? updatedPack : p));
        PackStorage.savePack(updatedPack);
    };

    const handleExport = () => {
        if (activePack) {
            PackStorage.exportPack(activePack);
            soundManager.play("ui.click");
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const pack = JSON.parse(event.target?.result as string);
                if (PackStorage.validatePack(pack)) {
                    const updated = [...packs.filter(p => p.meta.id !== pack.meta.id), pack];
                    setPacks(updated);
                    PackStorage.savePack(pack);
                    setActivePackId(pack.meta.id);
                    soundManager.play("ui.click", { pitch: 1.2 });
                }
            } catch (err) {
                alert("Invalid Mod Pack file");
            }
        };
        reader.readAsText(file);
    };

    const renderTabContent = () => {
        if (!activePackId || !activePack) return (
            <div className="flex flex-col items-center justify-center h-full text-center p-12 bg-black/40">
                <div className="text-6xl mb-6 grayscale opacity-20">📦</div>
                <h3 className="text-xl font-bold text-white mb-2">No Active Mod Pack</h3>
                <p className="text-gray-500 max-w-xs text-sm">Create or import a pack using the sidebar to begin editing features.</p>
                <div className="flex gap-4 mt-8">
                    <button onClick={() => setIsWizardOpen(true)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-xl transition-all">Create New Pack</button>
                    <button onClick={() => importInputRef.current?.click()} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-xl transition-all">Import Pack</button>
                </div>
            </div>
        );

        switch (activeTab) {
            case 'textures': return (
                <TextureEditorView 
                    pack={activePack} 
                    onUpdatePack={handleUpdatePack} 
                    selectedId={selectedTextureId}
                    onSelectId={(id) => {
                        setSelectedTextureId(id);
                        if (id) localStorage.setItem('atlas_selected_texture_id', id);
                        else localStorage.removeItem('atlas_selected_texture_id');
                    }}
                />
            );
            case 'blocks': return (
                <BlockEditorView 
                    pack={activePack} 
                    onUpdatePack={handleUpdatePack} 
                    selectedId={selectedBlockId}
                    onSelectId={(id) => {
                        setSelectedBlockId(id);
                        if (id) localStorage.setItem('atlas_selected_block_id', id);
                        else localStorage.removeItem('atlas_selected_block_id');
                    }}
                />
            );
            case 'items': return (
                <ItemEditorView 
                    pack={activePack} 
                    onUpdatePack={handleUpdatePack} 
                    selectedId={selectedItemId}
                    onSelectId={(id) => {
                        setSelectedItemId(id);
                        if (id) localStorage.setItem('atlas_selected_item_id', id);
                        else localStorage.removeItem('atlas_selected_item_id');
                    }}
                />
            );
            case 'recipes': return (
                <RecipeEditorView 
                    pack={activePack} 
                    onUpdatePack={handleUpdatePack} 
                    selectedId={selectedRecipeId}
                    onSelectId={(id) => {
                        setSelectedRecipeId(id);
                        if (id) localStorage.setItem('atlas_selected_recipe_id', id);
                        else localStorage.removeItem('atlas_selected_recipe_id');
                    }}
                />
            );
            case 'validation': return (
                <ValidationView 
                    pack={activePack} 
                    onFocusTab={(tab, id) => {
                        setActiveTab(tab);
                        if (tab === 'textures') setSelectedTextureId(id);
                        if (tab === 'blocks') setSelectedBlockId(id);
                        if (tab === 'items') setSelectedItemId(id);
                        if (tab === 'recipes') setSelectedRecipeId(id);
                    }}
                />
            );
            case 'tutorial': return <div className="p-12 text-gray-400 italic">Documentation Coming Soon...</div>;
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 z-[200] flex bg-[#0c0c0c] font-sans text-white select-none overflow-hidden">
            <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImport} />
            <style>{`
                .tab-active { background: #3b82f6; color: #fff; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3); }
                .tab-inactive { color: #666; }
                .tab-inactive:hover { color: #aaa; background: rgba(255,255,255,0.05); }
                .sidebar-section-title { font-size: 10px; font-weight: 900; letter-spacing: 0.15em; color: #444; text-transform: uppercase; margin-bottom: 8px; padding: 0 16px; }
                .resizer-handle { position: absolute; right: 0; top: 0; width: 4px; height: 100%; cursor: col-resize; z-index: 50; transition: background 0.2s; }
                .resizer-handle:hover { background: rgba(59, 130, 246, 0.5); }
                .pack-item { border: 1px solid transparent; transition: all 0.2s; }
                .pack-item-active { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); }
                .pack-item:hover { background: rgba(255, 255, 255, 0.05); }
            `}</style>

            {isWizardOpen && <PackWizard onClose={() => setIsWizardOpen(false)} onSave={handleCreatePack} existingIds={packs.map(p => p.meta.id)} />}

            {/* Sidebar */}
            <aside className="h-full bg-[#111] border-r border-white/5 flex flex-col flex-shrink-0 shadow-2xl z-20 relative" style={{ width: sidebarWidth }}>
                <div 
                    className="resizer-handle" 
                    onMouseDown={() => { isResizingRef.current = true; document.body.style.cursor = 'col-resize'; }} 
                />
                
                <div className="h-16 flex items-center px-4 gap-3 bg-black/40 border-b border-white/5">
                    <span className="text-2xl">⚡</span>
                    <h1 className="font-black text-sm tracking-tighter uppercase">Atlas Editor</h1>
                </div>

                {/* Mod Packs Management */}
                <div className="p-4 border-b border-white/5 flex flex-col">
                    <div className="sidebar-section-title flex justify-between">
                        <span>Mod Packs</span>
                        <div className="flex gap-2">
                             <button onClick={() => setIsWizardOpen(true)} className="text-blue-500 hover:text-blue-400 text-[10px] font-black uppercase">NEW</button>
                             <button onClick={() => importInputRef.current?.click()} className="text-gray-500 hover:text-gray-400 text-[10px] font-black uppercase">IMPORT</button>
                        </div>
                    </div>
                    
                    <div className="space-y-1 mt-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                        {packs.length === 0 && <div className="px-4 py-8 text-center text-[10px] text-gray-600 uppercase font-bold italic">No Packs Found</div>}
                        {packs.map(p => (
                            <div 
                                key={p.meta.id} 
                                className={`pack-item group relative flex items-center gap-3 p-2 rounded cursor-pointer ${activePackId === p.meta.id ? 'pack-item-active' : ''}`}
                                onClick={() => handleSelectPack(p.meta.id)}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className={`text-[11px] font-bold truncate ${p.meta.enabled ? 'text-white' : 'text-gray-500'}`}>{p.meta.name}</div>
                                    <div className="text-[8px] text-gray-600 font-mono truncate">{p.meta.id}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        checked={p.meta.enabled} 
                                        onChange={(e) => { e.stopPropagation(); handleToggleEnabled(p.meta.id); }}
                                        className="w-3 h-3 accent-blue-500 cursor-pointer"
                                        title={p.meta.enabled ? "Enabled" : "Disabled"}
                                    />
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeletePack(p.meta.id); }}
                                        className="text-gray-600 hover:text-red-500 text-[10px] transition-colors p-1"
                                        title="Delete Pack"
                                    >✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {activePack && (
                    <div className="p-4 border-b border-white/5 bg-white/2">
                        <div className="sidebar-section-title">Active Pack Actions</div>
                        <div className="flex gap-1 px-3">
                            <button onClick={handleExport} className="flex-1 py-1.5 bg-blue-900/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[9px] font-black uppercase transition-colors border border-blue-500/20">Export Pack JSON</button>
                        </div>
                    </div>
                )}

                <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                    <div className="sidebar-section-title">Navigation</div>
                    <TabItem label="Tutorial" id="tutorial" active={activeTab} onClick={setActiveTab} icon="📖" />
                    <TabItem label="Textures" id="textures" active={activeTab} onClick={setActiveTab} icon="🎨" />
                    <TabItem label="Blocks" id="blocks" active={activeTab} onClick={setActiveTab} icon="🧊" />
                    <TabItem label="Items" id="items" active={activeTab} onClick={setActiveTab} icon="⚒️" />
                    <TabItem label="Recipes" id="recipes" active={activeTab} onClick={setActiveTab} icon="📜" />
                    <TabItem label="Validation" id="validation" active={activeTab} onClick={setActiveTab} icon="⚖️" />
                </nav>

                <div className="p-4 bg-black/20 border-t border-white/5">
                    <button onClick={onBack} className="w-full py-3 bg-red-900/40 hover:bg-red-600 text-red-500 hover:text-white rounded font-black text-[10px] uppercase tracking-widest transition-all">
                        Exit Editor
                    </button>
                </div>
            </aside>

            {/* Content Area */}
            <main className="flex-1 flex flex-col bg-[#080808] relative">
                {renderTabContent()}
            </main>
        </div>
    );
};

const TabItem = ({ label, id, active, onClick, icon }: any) => (
    <div 
        onClick={() => onClick(id)}
        className={`mx-3 px-3 py-2.5 cursor-pointer flex items-center gap-3 rounded-lg font-bold text-sm transition-all ${id === active ? 'tab-active' : 'tab-inactive'}`}
    >
        <span className="opacity-70">{icon}</span>
        <span>{label}</span>
    </div>
);
