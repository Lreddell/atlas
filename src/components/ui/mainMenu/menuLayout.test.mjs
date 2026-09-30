import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the title screen offers only what works: no "Coming soon" buttons', () => {
    const panels = read('src/components/ui/mainMenu/MainMenuPanels.tsx');
    assert.doesNotMatch(panels, /Coming soon/);
    assert.doesNotMatch(panels, /label="Multiplayer"|label="Editor Features"|label="Panorama Settings"/);
    assert.match(panels, /<MenuButton label="World Editor" onClick=\{onWorldEditor\}/);
});

test('the menu background lives in Options, and Back returns there', () => {
    const pause = read('src/components/ui/PauseMenu.tsx');
    assert.match(pause, /isMainMenu && onOpenPanorama && <MenuButton label="Menu Background\.\.\."/);
    const app = read('src/App.tsx');
    assert.match(app, /onOpenPanorama=\{\(\) => \{ setMenuInitialView\('settings'\); setAppState\('menu'\); \}\}/);
    assert.match(app, /onPanoramaDone=\{menuInitialView === 'settings' \? \(\) => \{ setMenuInitialView\('main'\); setAppState\('options'\); \} : undefined\}/);
    assert.match(read('src/components/ui/MainMenu.tsx'), /onBack=\{onPanoramaDone \?\? handleBackToMain\}/);
});

test('saved worlds list their mode and seed, not an internal id', () => {
    const panels = read('src/components/ui/mainMenu/MainMenuPanels.tsx');
    assert.match(panels, /Seed \{world\.seed\.trim\(\) \|\| world\.seedNum\}/);
    assert.doesNotMatch(panels, /world\.id\.split/);
});

test('Show Coordinates is a saved world option that draws the position readout', () => {
    const app = read('src/App.tsx');
    assert.match(app, /meta\.showCoordinates = showCoordinates;/);
    assert.match(app, /setShowCoordinates\(meta\.showCoordinates \?\? false\)/);
    assert.match(app, /showCoordinates && !cinematicMode && !showDeathScreen && <CoordinatesReadout positionRef=\{playerPosRef\} \/>/);
    assert.match(read('src/components/ui/PauseMenu.tsx'), /<MCToggle label="Show Coordinates"/);
});
