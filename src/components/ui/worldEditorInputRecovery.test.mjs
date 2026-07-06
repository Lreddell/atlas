import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'src/components/ui/ChunkBase.tsx'), 'utf8');

test('saving a World Editor preset uses non-blocking inline feedback', () => {
    const saveHandler = source.match(/const handleSavePreset = async \(\) => \{[\s\S]*?\n {4}\};/);
    assert.ok(saveHandler, 'handleSavePreset not found');
    assert.doesNotMatch(saveHandler[0], /\balert\s*\(/, 'native alert can leave Electron keyboard focus broken');
    assert.match(saveHandler[0], /setEditorStatus/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
});

test('World Editor never uses native blocking dialogs', () => {
    assert.doesNotMatch(
        source,
        /\b(?:alert|confirm|prompt)\s*\(/,
        'native dialogs can leave Electron keyboard focus broken',
    );
    assert.match(source, /import \{ ConfirmModal \}/);
    assert.match(source, /pendingDeletePreset/);
    assert.match(source, /showResetConfirmation/);
});

test('preset list refresh failures are handled without unhandled rejections', () => {
    assert.match(source, /const handleRefreshPresetList = useCallback\(async \(\) => \{/);
    assert.match(source, /\[WorldEditor\] Failed to refresh presets:/);
    assert.doesNotMatch(source, /void refreshPresetList\(\)/);
});
