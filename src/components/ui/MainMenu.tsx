import React, { useCallback, useEffect, useState } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import {
    CreateWorldPanel,
    EditorsPanel,
    MainLandingPanel,
    PanoramaPanel,
    TutorialPromptModal,
    type MainMenuView,
    type PanoramaSubmenu,
    WorldSelectPanel,
} from './mainMenu/MainMenuPanels';
import { useSplashAnimation } from './mainMenu/useSplashAnimation';
import { useWorldMenu } from './mainMenu/useWorldMenu';
import { isEditableElement } from '../../utils/dom';

const PANORAMA_DEBUG_HOTKEY = 'F5';
const TUTORIAL_SCREEN_SEEN_KEY = 'atlas.tutorial.screenSeen.v2';
const TUTORIAL_PROMPTED_KEY = 'atlas.tutorial.prompted.v2';
const BUILD_CREDIT_URL = 'https://github.com/Lreddell/atlas';

interface MainMenuProps {
    onStart: (worldId: string) => void;
    onChunkBase: () => void;
    onFeatureEditor: () => void;
    onOptions: (opts?: { openTutorial?: boolean }) => void;
    onQuit?: () => void;
    backgroundMode: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl: string | null;
    panoramaFaceDataUrls?: string[] | null;
    hasPanoramaBackground: boolean;
    onToggleBackground: () => void;
    panoramaCaptureHotkey: string;
    panoramaEntries: string[];
    activePanoramaPath: string | null;
    defaultPanoramaId: string;
    onUsePanorama: (filePath: string) => void;
    onImportPanorama: () => void;
    canImportPanorama: boolean;
    onDeletePanoramaFromDisk: (filePath: string) => void;
    canDeletePanoramaFromDisk: boolean;
    panoramaBlur: number;
    panoramaGradient: number;
    setPanoramaBlur: (value: number) => void;
    setPanoramaGradient: (value: number) => void;
    panoramaRotationSpeed: number;
    setPanoramaRotationSpeed: (value: number) => void;
    showBackground?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
    onStart,
    onChunkBase,
    onFeatureEditor,
    onOptions,
    onQuit,
    backgroundMode,
    panoramaBackgroundDataUrl,
    panoramaFaceDataUrls,
    hasPanoramaBackground,
    onToggleBackground,
    panoramaCaptureHotkey,
    panoramaEntries,
    activePanoramaPath,
    defaultPanoramaId,
    onUsePanorama,
    onImportPanorama,
    canImportPanorama,
    onDeletePanoramaFromDisk,
    canDeletePanoramaFromDisk,
    panoramaBlur,
    panoramaGradient,
    setPanoramaBlur,
    setPanoramaGradient,
    panoramaRotationSpeed,
    setPanoramaRotationSpeed,
    showBackground = true,
}) => {
    const [view, setView] = useState<MainMenuView>('main');
    const [panoramaSubmenu, setPanoramaSubmenu] = useState<PanoramaSubmenu>('manager');
    const [panoramaDebugFly, setPanoramaDebugFly] = useState(false);
    const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);

    const {
        worlds,
        selectedWorldId,
        setSelectedWorldId,
        worldName,
        setWorldName,
        seed,
        setSeed,
        gameMode,
        cycleGameMode,
        worldGenPresets,
        selectedWorldGenPresetId,
        setSelectedWorldGenPresetId,
        refreshWorldGenPresets,
        handleCreateWorld,
        handlePlayWorld,
        handleDeleteWorld,
        handleExportWorld,
        handleImportWorld,
    } = useWorldMenu({ onStart });
    const { formattedSplash, splashFontSize } = useSplashAnimation(view === 'main');

    const hasFaceCubemap = !!panoramaFaceDataUrls && panoramaFaceDataUrls.length === 6;
    const isBrowserMode = !onQuit;
    const usingPanorama = backgroundMode === 'panorama' && (!!panoramaBackgroundDataUrl || hasFaceCubemap);
    const submenuOverlayClass = usingPanorama ? 'bg-black/60' : 'bg-black/35';
    const showSubmenuOverlay = view !== 'main';

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const hasSeenTutorialScreen = window.localStorage.getItem(TUTORIAL_SCREEN_SEEN_KEY) === 'true';
        const hasBeenPrompted = window.localStorage.getItem(TUTORIAL_PROMPTED_KEY) === 'true';
        if (!hasSeenTutorialScreen && !hasBeenPrompted) {
            setShowTutorialPrompt(true);
        }
    }, []);

    useEffect(() => {
        if (view === 'create') {
            void refreshWorldGenPresets();
        }
    }, [refreshWorldGenPresets, view]);

    useEffect(() => {
        if (view !== 'settings') {
            setPanoramaSubmenu('manager');
        }
    }, [view]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableElement(event.target)) return;

            if (panoramaDebugFly && event.key === 'Escape') {
                event.preventDefault();
                setPanoramaDebugFly(false);
                return;
            }

            if (event.code === PANORAMA_DEBUG_HOTKEY) {
                event.preventDefault();
                if (hasPanoramaBackground || hasFaceCubemap) {
                    setPanoramaDebugFly((current) => !current);
                    setView('main');
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [hasFaceCubemap, hasPanoramaBackground, panoramaDebugFly]);

    const handleBuildCreditClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
        if (isBrowserMode) return;

        const openExternal = window.atlasDesktop?.openExternal;
        if (typeof openExternal !== 'function') return;

        event.preventDefault();
        void openExternal(BUILD_CREDIT_URL);
    }, [isBrowserMode]);

    const markTutorialPrompted = useCallback(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(TUTORIAL_PROMPTED_KEY, 'true');
    }, []);

    const handleTutorialPromptAccept = useCallback(() => {
        soundManager.resume();
        musicController.update(true, 'survival', 'plains');
        markTutorialPrompted();
        setShowTutorialPrompt(false);
        onOptions({ openTutorial: true });
    }, [markTutorialPrompted, onOptions]);

    const handleTutorialPromptDecline = useCallback(() => {
        soundManager.resume();
        musicController.update(true, 'survival', 'plains');
        markTutorialPrompted();
        setShowTutorialPrompt(false);
    }, [markTutorialPrompted]);

    const handleSelectWorld = useCallback((worldId: string) => {
        setSelectedWorldId(worldId);
        soundManager.play('ui.click');
    }, [setSelectedWorldId]);

    const handleOpenCreateView = useCallback(() => setView('create'), []);
    const handleOpenSelectView = useCallback(() => setView('select'), []);
    const handleOpenSettingsView = useCallback(() => setView('settings'), []);
    const handleOpenEditorsView = useCallback(() => setView('editors'), []);
    const handleBackToMain = useCallback(() => setView('main'), []);

    if (panoramaDebugFly) {
        return (
            <div className="absolute inset-0 z-[240] cursor-none">
                <MenuPanoramaBackground
                    backgroundMode="panorama"
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                    debugFlyMode
                />
                <div className="pointer-events-none absolute left-3 top-3 border border-white/30 bg-black/55 px-2 py-1 text-xs font-minecraft text-white">
                    Panorama Debug Fly {'\u2022'} F5 toggle {'\u2022'} WASD/Space/Shift {'\u2022'} Mouse look {'\u2022'} Esc to exit
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center">
            {showBackground && (
                <MenuPanoramaBackground
                    backgroundMode={backgroundMode}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                />
            )}
            {showSubmenuOverlay && <div className={`pointer-events-none absolute inset-0 ${submenuOverlayClass}`} />}

            {view === 'create' && (
                <CreateWorldPanel
                    worldName={worldName}
                    onWorldNameChange={setWorldName}
                    seed={seed}
                    onSeedChange={setSeed}
                    gameMode={gameMode}
                    onCycleGameMode={cycleGameMode}
                    worldGenPresets={worldGenPresets}
                    selectedWorldGenPresetId={selectedWorldGenPresetId}
                    onSelectedWorldGenPresetIdChange={setSelectedWorldGenPresetId}
                    onCancel={handleOpenSelectView}
                    onCreateWorld={() => void handleCreateWorld()}
                />
            )}

            {view === 'select' && (
                <WorldSelectPanel
                    worlds={worlds}
                    selectedWorldId={selectedWorldId}
                    onSelectWorld={handleSelectWorld}
                    onDoubleClickWorld={(worldId) => void handlePlayWorld(worldId)}
                    onPlaySelected={() => void handlePlayWorld()}
                    onCreateNewWorld={handleOpenCreateView}
                    onDeleteWorld={() => void handleDeleteWorld()}
                    onCancel={handleBackToMain}
                    onExportWorld={() => void handleExportWorld()}
                    onImportWorld={() => void handleImportWorld()}
                />
            )}

            {view === 'settings' && (
                <PanoramaPanel
                    panoramaSubmenu={panoramaSubmenu}
                    onPanoramaSubmenuChange={setPanoramaSubmenu}
                    panoramaCaptureHotkey={panoramaCaptureHotkey}
                    panoramaEntries={panoramaEntries}
                    activePanoramaPath={activePanoramaPath}
                    defaultPanoramaId={defaultPanoramaId}
                    onUsePanorama={onUsePanorama}
                    onImportPanorama={onImportPanorama}
                    canImportPanorama={canImportPanorama}
                    onDeletePanoramaFromDisk={onDeletePanoramaFromDisk}
                    canDeletePanoramaFromDisk={canDeletePanoramaFromDisk}
                    usingPanorama={usingPanorama}
                    hasPanoramaBackground={hasPanoramaBackground}
                    backgroundMode={backgroundMode}
                    onToggleBackground={onToggleBackground}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    setPanoramaBlur={setPanoramaBlur}
                    setPanoramaGradient={setPanoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                    setPanoramaRotationSpeed={setPanoramaRotationSpeed}
                    onBack={handleBackToMain}
                />
            )}

            {view === 'editors' && (
                <EditorsPanel
                    onChunkBase={onChunkBase}
                    onFeatureEditor={onFeatureEditor}
                    onBack={handleBackToMain}
                />
            )}

            {view === 'main' && (
                <MainLandingPanel
                    formattedSplash={formattedSplash}
                    splashFontSize={splashFontSize}
                    isBrowserMode={isBrowserMode}
                    onSingleplayer={handleOpenSelectView}
                    onEditors={handleOpenEditorsView}
                    onPanoramaSettings={handleOpenSettingsView}
                    onOptions={() => onOptions()}
                    onTutorial={() => onOptions({ openTutorial: true })}
                    onQuit={onQuit}
                    onBuildCreditClick={handleBuildCreditClick}
                />
            )}

            {showTutorialPrompt && (
                <TutorialPromptModal
                    onAccept={handleTutorialPromptAccept}
                    onDecline={handleTutorialPromptDecline}
                />
            )}
        </div>
    );
};
