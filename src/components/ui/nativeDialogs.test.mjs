import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const uiDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(uiDir, '../..');

const productionSources = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(entryPath);
    if (!/\.[jt]sx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [entryPath];
});

const readSource = (relativePath) => readFileSync(path.join(srcDir, relativePath), 'utf8');

test('production renderer code contains no blocking browser dialogs', () => {
    const dialogPattern = /\b(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)\s*\(/;
    const offenders = [];

    for (const filePath of productionSources(srcDir)) {
        const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (!line.trimStart().startsWith('//') && dialogPattern.test(line)) {
                offenders.push(`${path.relative(srcDir, filePath)}:${index + 1}`);
            }
        });
    }

    assert.deepEqual(offenders, [], `native dialogs can break Electron keyboard focus:\n${offenders.join('\n')}`);
});

test('affected screens use the shared non-blocking notice component', () => {
    const noticePath = path.join(srcDir, 'components/ui/UiNotice.tsx');
    assert.ok(existsSync(noticePath), 'UiNotice.tsx must provide shared non-blocking feedback');

    for (const relativePath of [
        'App.tsx',
        'components/ui/MainMenu.tsx',
        'components/ui/PauseMenu.tsx',
        'components/ui/FeatureEditor/FeatureEditor.tsx',
        'components/ui/FeatureEditor/TextureEditorView.tsx',
    ]) {
        assert.match(readSource(relativePath), /<UiNotice\b/, `${relativePath} must render UiNotice`);
    }
});

test('persistent file inputs and texture object URLs are cleaned up', () => {
    const featureEditor = readSource('components/ui/FeatureEditor/FeatureEditor.tsx');
    const textureEditor = readSource('components/ui/FeatureEditor/TextureEditorView.tsx');
    const pauseMenu = readSource('components/ui/PauseMenu.tsx');

    assert.match(featureEditor, /e\.target\.value = ''/);
    assert.match(textureEditor, /e\.target\.value = ''/);
    assert.match(pauseMenu, /e\.target\.value = ''/);
    assert.match(textureEditor, /URL\.revokeObjectURL\(url\)/);
    assert.match(textureEditor, /img\.onerror/);
    assert.match(featureEditor, /reader\.onerror/);
    assert.match(pauseMenu, /reader\.onerror/);
});
