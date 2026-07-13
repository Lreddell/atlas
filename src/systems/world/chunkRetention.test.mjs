import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
    isWithinRetention, sortFarthestFirst, budgetLevel, effectiveRadiusSq,
    evictionDrainBudget, RETENTION_HYSTERESIS, distanceSq,
} from './chunkRetention.ts';

const wm = readFileSync(new URL('../WorldManager.ts', import.meta.url), 'utf8');

test('retention circle: desired radius plus hysteresis, squared math', () => {
    const r = 16;
    // Inside the desired radius: retained.
    assert.ok(isWithinRetention(10, 10, 0, 0, r));
    // Just beyond desired but within hysteresis: retained.
    assert.ok(isWithinRetention(r + RETENTION_HYSTERESIS, 0, 0, 0, r));
    // Beyond hysteresis: not retained.
    assert.ok(!isWithinRetention(r + RETENTION_HYSTERESIS + 1, 0, 0, 0, r));
    // Works at extreme negative world positions.
    const base = -2_000_000;
    assert.ok(isWithinRetention(base + 5, base - 5, base, base, r));
    assert.ok(!isWithinRetention(base + 50, base, base, base, r));
});

test('eviction candidates are ordered farthest-first', () => {
    const items = [
        { cx: 1, cz: 0 }, { cx: 30, cz: 30 }, { cx: -50, cz: 0 }, { cx: 10, cz: -10 },
    ];
    sortFarthestFirst(items, 0, 0);
    const dists = items.map(i => distanceSq(i, 0, 0));
    for (let i = 1; i < dists.length; i++) assert.ok(dists[i - 1] >= dists[i]);
    assert.deepEqual(items[0], { cx: -50, cz: 0 });
});

test('budget levels and effective radius shrink under pressure', () => {
    const config = { softLimitBytes: 100, hardLimitBytes: 200, bytesPerChunk: 10 };
    assert.equal(budgetLevel(50, config), 'ok');
    assert.equal(budgetLevel(150, config), 'soft');
    assert.equal(budgetLevel(250, config), 'hard');

    const rd = 20;
    assert.equal(effectiveRadiusSq(rd, 'ok', config), rd * rd);
    // Soft: outer prefetch ring dropped but most of the view kept.
    const soft = effectiveRadiusSq(rd, 'soft', config);
    assert.ok(soft < rd * rd && soft >= (rd * 0.8) ** 2);
    // Hard: radius small enough that the retained disc fits the hard byte cap.
    const hard = effectiveRadiusSq(rd, 'hard', config);
    const rHard = Math.sqrt(hard);
    assert.ok(Math.PI * rHard * rHard * config.bytesPerChunk <= config.hardLimitBytes);
    // The active player area always survives.
    assert.ok(hard >= 1);
    // Drain budget rises with pressure and always guarantees progress.
    assert.ok(evictionDrainBudget('ok') > 0);
    assert.ok(evictionDrainBudget('soft') > evictionDrainBudget('ok'));
    assert.ok(evictionDrainBudget('hard') > evictionDrainBudget('soft'));
});

test('WorldManager wires continuous eviction into every scheduler cycle', () => {
    // Chunks leaving retention are enqueued and their in-flight work cancelled
    // immediately on every desired-set update (no %6 pass, no 16-chunk cap).
    assert.doesNotMatch(wm, /desiredUpdateCounter % 6/);
    assert.doesNotMatch(wm, /maxEvictionsPerPass = 16/);
    assert.match(wm, /this\.evictionPending\.set\(key, coord\);[\s\S]{0,200}?this\.cancelInFlightWork\(key, coord\.cx, coord\.cz\);/);
    // Drain runs each cycle, before dispatch.
    assert.match(wm, /this\.drainEvictions\(\);[\s\S]*?const poolDown/);
    // No sqrt / string parsing in the retention scan or drain loop.
    assert.match(wm, /isWithinRetention\(coord\.cx, coord\.cz/);
    {
        const drainBody = wm.split('private drainEvictions()')[1].split('\n  }')[0];
        assert.ok(!drainBody.includes("split(',')"), 'drain loop must not parse string keys');
        assert.ok(!drainBody.includes('Math.sqrt'), 'drain loop must not use sqrt');
    }
    // A chunk desired again while pending is reclaimed, not evicted.
    assert.match(wm, /this\.evictionPending\.delete\(key\);/);
    // Dirty chunks stay resident and get a save requested (evict() contract).
    assert.match(wm, /deferredDirty && this\.activeWorldId\) void this\.processSaveQueue\(\)/);
});

test('memory budget gates generation and is fully visible in telemetry', () => {
    assert.match(wm, /effectiveRadiusSq\(this\.desiredRadius, level, this\.budget\)/);
    assert.match(wm, /streaming\.genRejectedOverBudget/);
    assert.match(wm, /configureMemoryBudget/);
    for (const field of ['accountedBytes', 'budgetLevel', 'budgetSoftLimitBytes', 'budgetHardLimitBytes', 'evictionPending', 'inFlightMeshInputBytes', 'desiredRadius']) {
        assert.match(wm, new RegExp(`${field}:`), `streaming stats must expose ${field}`);
    }
});
