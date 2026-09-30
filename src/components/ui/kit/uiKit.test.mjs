import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from '../../../systems/world/storage/bundleTs.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const styles = read('src/styles.css');
const components = styles.slice(styles.indexOf('@layer components'), styles.indexOf('@layer utilities'));

test('the pixel fonts are bundled, not fetched, and set as the UI and mono faces', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.dependencies['@fontsource/pixelify-sans'], 'Pixelify Sans ships with the game');
    const entry = read('src/index.tsx');
    assert.match(entry, /import '@fontsource\/pixelify-sans\/400\.css';/);
    assert.match(entry, /import '@fontsource\/pixelify-sans\/700\.css';/);
    const html = read('index.html');
    assert.match(html, /--atlas-ui-font-family: 'Atlas Numerals', 'Pixelify Sans'/);
    assert.match(html, /--atlas-mono-font-family: 'Monocraft'/);
    // The dense editor forms keep a system face.
    assert.match(html, /--atlas-tool-font-family: ui-sans-serif/);
    assert.match(read('src/components/ui/ChunkBase.tsx'), /overflow-hidden font-tool">/);
    assert.match(read('THIRD_PARTY_NOTICES.md'), /Pixelify Sans/);
});

test('digits come from Atlas Numerals, whose 5 cannot be read as an S', () => {
    const html = read('index.html');
    // Only the digits: letters stay Pixelify Sans.
    for (const style of ['Regular', 'Bold']) {
        assert.ok(fs.existsSync(path.join(root, `public/assets/fonts/AtlasNumerals-${style}.woff`)), `${style} is built`);
        assert.match(html, new RegExp(`url\\('\\./assets/fonts/AtlasNumerals-${style}\\.woff'\\) format\\('woff'\\);[\\s\\S]*?unicode-range: U\\+0030-0039;`));
    }
});

test('the kit is drawn in hard pixels: no rounded corners, blur or gradients on chrome', () => {
    for (const name of ['atlas-panel', 'atlas-well', 'atlas-btn', 'atlas-btn-primary', 'atlas-btn-danger', 'atlas-slider', 'atlas-input', 'atlas-slot', 'atlas-tooltip', 'atlas-select-frame']) {
        assert.match(components, new RegExp(`\\.${name} \\{`), `${name} is defined`);
    }
    assert.doesNotMatch(components, /border-radius|blur\(|linear-gradient|radial-gradient/);
    // Keyboard focus is the one place star teal appears.
    assert.match(components, /\.atlas-btn:focus-visible \{\s*outline: 2px solid theme\('colors\.star'\);/);
    const tailwind = read('tailwind.config.cjs');
    for (const token of ['ink:', 'parchment:', 'brass:', 'ember:', "star: '#8fe3d6'"]) assert.ok(tailwind.includes(token), token);
});

test('buttons take their width on the wrapper, so full-width buttons fill a column', () => {
    const controls = read('src/components/ui/mainMenu/MainMenuControls.tsx');
    assert.match(controls, /className=\{`relative \$\{width\}`\}/);
    assert.match(controls, /className=\{`atlas-btn \$\{VARIANT_CLASS\[variant\]\} w-full/);
    // One slider for the title screen and the pause menu.
    assert.match(read('src/components/ui/PauseMenu.tsx'), /import \{ MenuButton, MenuSlider \} from '\.\/mainMenu\/MainMenuControls';/);
    assert.doesNotMatch(read('src/components/ui/PauseMenu.tsx'), /const MenuSlider/);
});

test('vitals keep ten pips, half pips and their drain directions', () => {
    const hud = read('src/components/ui/HUD.tsx');
    assert.match(hud, /<VitalPip icon=\{LIFE_CRYSTAL\} fill=\{statFill\(health, i\)\} half="left" \/>/);
    assert.match(hud, /<VitalPip icon=\{PROVISIONS\} fill=\{statFill\(hunger, i\)\} half="right" \/>/);
    assert.match(hud, /<VitalPip key=\{i\} icon=\{ARMOR_PLATE\} fill=\{fill\} \/>/);
    assert.match(hud, /const left = breath \/ 30 - i;/);
    // Ten per row, and together exactly as wide as the hotbar.
    assert.equal((hud.match(/Array\.from\(\{ ?length: ?10 ?\}\)/g) ?? []).length, 4);
    assert.match(hud, /style=\{\{ bottom: u\(40\), width: u\(240\), paddingBottom: u\(4\)/);
    // The hotbar, in art pixels: nine 24-pixel slots, 2 apart, 3 of padding and
    // a 1-pixel border, 240 across like the vitals above it.
    assert.match(hud, /size="hotbar"\s+scale=\{scale\}/);
    assert.match(hud, /style=\{\{ gap: u\(2\), padding: u\(3\), borderWidth: u\(1\)/);
    assert.match(read('src/components/ui/Slot.tsx'), /\{ width: 24 \* artScale, height: 24 \* artScale, borderWidth: bare \? undefined : artScale \}/);
    // Hearts and loaves are drawn at the same scale as the slots.
    assert.match(hud, /<PixelArt rows=\{icon\.rows\} palette=\{icon\.empty\} scale=\{scale\}/);
    assert.doesNotMatch(hud, /HEART_D|DRUM_MEAT_D|rounded-full/);
});

// The hotbar keeps its original size at every window size: 480px across, with
// 48px slots holding 32px items, the hearts and loaves drawn to match.
test('the HUD is drawn at its original size', async () => {
    const { HUD_SCALE } = await loadTs(`export { HUD_SCALE } from './src/components/ui/hudScale';`);
    assert.equal(HUD_SCALE, 2);
    assert.equal(240 * HUD_SCALE, 480, 'hotbar width');
    assert.equal(24 * HUD_SCALE, 48, 'slot size');
    assert.equal(16 * HUD_SCALE, 32, 'item size');
    // Nothing sizes the HUD from the window.
    for (const file of ['src/components/ui/HUD.tsx', 'src/components/ui/Chat.tsx', 'src/App.tsx']) {
        assert.doesNotMatch(read(file), /useHudScale|hudScaleFor/, file);
    }
});

test('every vital icon is 11x11 and fully coloured in both its full and empty forms', async () => {
    const icons = await loadTs(`export * from './src/components/ui/kit/vitalIcons';`);
    for (const name of ['LIFE_CRYSTAL', 'PROVISIONS', 'ARMOR_PLATE', 'BREATH_BUBBLE']) {
        const icon = icons[name];
        assert.equal(icon.rows.length, 11, name);
        for (const row of icon.rows) {
            assert.equal(row.length, 11, `${name} row "${row}"`);
            for (const cell of row.replace(/\./g, '')) {
                assert.ok(icon.full[cell], `${name} full colours "${cell}"`);
                assert.ok(icon.empty[cell], `${name} empty colours "${cell}"`);
            }
        }
    }
});

test('game screens use art, not emoji or font glyphs, for their icons', () => {
    for (const file of ['HUD', 'InventoryUI', 'RecipeBookPanel', 'CombatFeedback', 'UiNotice', 'TextureAtlasViewer', 'LoadingScreen', 'DeathScreen', 'Chat', 'BossBar']) {
        // Comments may say what they like; the rendered markup and strings may not.
        const source = read(`src/components/ui/${file}.tsx`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]|[✓✕×→]/u, file);
    }
    const menus = read('src/components/ui/mainMenu/MainMenuPanels.tsx');
    // The title is the pixel wordmark, and the world picker has no native select.
    assert.match(menus, /<AtlasWordmark scale=\{7\} \/>/);
    assert.doesNotMatch(menus, /<select|animate-pulse/);
});
