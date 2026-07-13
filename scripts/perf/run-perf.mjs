#!/usr/bin/env node
/**
 * Atlas performance benchmark runner.
 *
 * Builds the game with the perf harness page (ATLAS_PERF=1), serves the
 * production bundle via `vite preview`, drives deterministic streaming
 * scenarios in headless Chromium (playwright-core + the system browser),
 * and writes JSON + Markdown results.
 *
 * Usage:
 *   npm run perf                                  # default scenario set
 *   npm run perf -- --scenarios travel:rd=16,blocks=10000 hashCheck
 *   npm run perf -- --label baseline --no-build   # reuse existing dist/
 *   npm run perf -- --dev                         # run against `vite dev` (unminified)
 *
 * Scenario syntax: name[:k=v,k=v...]  (numeric values are coerced)
 * Output: docs/performance/results/<timestamp>-<label>.{json,md}
 */

/* global window -- page.evaluate/waitForFunction callbacks run in the browser */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULT_SCENARIOS = [
    'hashCheck',
    'stationary:renderDistance=8',
    'stationary:renderDistance=16',
    'stationary:renderDistance=24',
    'travel:renderDistance=16,blocks=10000,speed=64',
    'teleport:renderDistance=16,jumps=8,jumpDistance=4096',
    'outAndBack:renderDistance=16,blocks=2000,speed=64',
    'editChurn:renderDistance=8,durationMs=30000',
];

function parseArgs(argv) {
    const args = { scenarios: [], label: 'run', build: true, dev: false, port: 4179 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--scenarios') {
            while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.scenarios.push(argv[++i]);
        } else if (a === '--label') args.label = argv[++i];
        else if (a === '--no-build') args.build = false;
        else if (a === '--dev') args.dev = true;
        else if (a === '--port') args.port = Number(argv[++i]);
        else if (a.startsWith('--')) throw new Error(`Unknown flag ${a}`);
        else args.scenarios.push(a);
    }
    if (args.scenarios.length === 0) args.scenarios = DEFAULT_SCENARIOS;
    return args;
}

function parseScenario(spec) {
    const [name, optsStr] = spec.split(':');
    const opts = {};
    if (optsStr) {
        for (const pair of optsStr.split(',')) {
            const [k, v] = pair.split('=');
            const num = Number(v);
            opts[k] = Number.isFinite(num) ? num : v;
        }
    }
    return { name, opts };
}

function findChromium() {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    if (existsSync(base)) {
        for (const entry of readdirSync(base)) {
            if (!entry.startsWith('chromium')) continue;
            for (const candidate of [
                resolve(base, entry, 'chrome-linux', 'chrome'),
                resolve(base, entry, 'chrome-linux', 'headless_shell'),
                resolve(base, entry),
            ]) {
                if (existsSync(candidate) && !readdirSyncSafe(candidate)) return candidate;
            }
        }
    }
    for (const candidate of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error('No Chromium executable found; set CHROMIUM_PATH');
}

function readdirSyncSafe(p) {
    try { readdirSync(p); return true; } catch { return false; }
}

function run(cmd, args, opts = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
        child.on('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited ${code}`))));
        child.on('error', reject);
    });
}

async function waitForHttp(url, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function fmtBytes(n) {
    if (n == null) return 'n/a';
    if (n > 1024 * 1024 * 1024) return `${(n / (1024 ** 3)).toFixed(2)} GiB`;
    if (n > 1024 * 1024) return `${(n / (1024 ** 2)).toFixed(1)} MiB`;
    if (n > 1024) return `${(n / 1024).toFixed(1)} KiB`;
    return `${n} B`;
}

function fmtMs(n) {
    return n == null ? 'n/a' : `${Number(n).toFixed(2)} ms`;
}

function summarizeScenario(r) {
    const lines = [];
    lines.push(`### ${r.scenario} ${JSON.stringify(r.opts)}`);
    lines.push('');
    if (r.hashes) {
        lines.push('| Chunk | Hash |', '| --- | --- |');
        for (const [k, v] of Object.entries(r.hashes)) lines.push(`| ${k} | \`${v}\` |`);
        lines.push('');
        return lines.join('\n');
    }
    if (r.crashed) {
        lines.push(`**CRASHED**: ${r.error} (partial timeline below, ${r.samples.length} samples)`);
        lines.push('');
    }
    const end = r.end ?? r.afterReturn ?? (r.crashed && r.samples.length ? r.samples[r.samples.length - 1] : null);
    const peak = (key) => r.samples ? Math.max(...r.samples.map(s => s[key] ?? 0)) : null;
    lines.push('| Metric | Value |', '| --- | --- |');
    if (r.frames) {
        lines.push(`| frame p50 / p95 / p99 | ${fmtMs(r.frames.p50Ms)} / ${fmtMs(r.frames.p95Ms)} / ${fmtMs(r.frames.p99Ms)} |`);
        lines.push(`| frames >25/>50/>100 ms | ${r.frames.over25Ms} / ${r.frames.over50Ms} / ${r.frames.over100Ms} (of ${r.frames.count}) |`);
        lines.push(`| avg FPS | ${r.frames.avgFps.toFixed(1)} |`);
    }
    if (r.timeToIdleMs != null) lines.push(`| time to idle | ${fmtMs(r.timeToIdleMs)} |`);
    if (end) {
        lines.push(`| resident chunks (end / peak) | ${end.residentChunks} / ${peak('residentChunks')} |`);
        lines.push(`| raw chunk bytes (end / peak) | ${fmtBytes(end.rawChunkBytes)} / ${fmtBytes(peak('rawChunkBytes'))} |`);
        lines.push(`| CPU mesh bytes (end / peak) | ${fmtBytes(end.cpuMeshBytes)} / ${fmtBytes(peak('cpuMeshBytes'))} |`);
        lines.push(`| JS heap (end / peak) | ${fmtBytes(end.heapUsed)} / ${fmtBytes(peak('heapUsed'))} |`);
        lines.push(`| evicted / deferred-dirty | ${end.evicted} / ${end.evictDeferredDirty} |`);
        lines.push(`| stale results discarded | ${end.staleDiscarded} |`);
        lines.push(`| mesh input bytes total | ${fmtBytes(end.meshInputBytes)} |`);
        lines.push(`| main-thread gen/mesh jobs | ${end.mainThreadJobs} |`);
        lines.push(`| workers (end) | ${end.workers} (enabled: ${end.workersEnabled}) |`);
    }
    if (r.initialIdle && r.afterReturn) {
        lines.push(`| resident after initial idle vs return | ${r.initialIdle.residentChunks} → ${r.afterReturn.residentChunks} |`);
        lines.push(`| raw bytes after initial idle vs return | ${fmtBytes(r.initialIdle.rawChunkBytes)} → ${fmtBytes(r.afterReturn.rawChunkBytes)} |`);
    }
    const wm = r.telemetry?.durations?.['worker.mesh'];
    const wg = r.telemetry?.durations?.['worker.gen'];
    if (wg) lines.push(`| worker gen avg / p95 / max | ${fmtMs(wg.avgMs)} / ${fmtMs(wg.p95Ms)} / ${fmtMs(wg.maxMs)} |`);
    if (wm) lines.push(`| worker mesh avg / p95 / max | ${fmtMs(wm.avgMs)} / ${fmtMs(wm.p95Ms)} / ${fmtMs(wm.maxMs)} |`);
    lines.push('');
    return lines.join('\n');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const commit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim().length > 0;

    let server;
    let baseUrl;
    if (args.dev) {
        server = spawn('npx', ['vite', '--port', String(args.port), '--strictPort'], { cwd: root, stdio: 'pipe' });
        baseUrl = `http://localhost:${args.port}`;
    } else {
        if (args.build) {
            console.log('[perf] building with ATLAS_PERF=1 ...');
            await run('npx', ['vite', 'build'], { env: { ...process.env, ATLAS_PERF: '1' } });
        }
        server = spawn('npx', ['vite', 'preview', '--port', String(args.port), '--strictPort'], { cwd: root, stdio: 'pipe' });
        baseUrl = `http://localhost:${args.port}`;
    }
    server.stdout?.on('data', () => {});
    server.stderr?.on('data', d => process.stderr.write(d));

    try {
        await waitForHttp(`${baseUrl}/perf.html`);
        const { chromium } = await import('playwright-core');
        const executablePath = findChromium();
        console.log(`[perf] chromium: ${executablePath}`);
        const browser = await chromium.launch({
            executablePath,
            args: ['--enable-precise-memory-info', '--disable-gpu', '--no-sandbox'],
        });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

        // Samples streamed live from the page, so a tab crash (e.g. reproducing
        // an allocation failure) still leaves the timeline up to the crash.
        const liveSamples = new Map(); // scenario name -> samples[]
        const newHarnessPage = async () => {
            const page = await context.newPage();
            page.on('console', msg => {
                const text = msg.text();
                if (text.startsWith('[perf]')) console.log(text);
            });
            page.on('pageerror', err => console.error('[page error]', err.message));
            await page.exposeFunction('__ATLAS_PERF_SINK__', json => {
                try {
                    const { scenario, sample } = JSON.parse(json);
                    if (!liveSamples.has(scenario)) liveSamples.set(scenario, []);
                    liveSamples.get(scenario).push(sample);
                } catch { /* ignore malformed */ }
            });
            await page.goto(`${baseUrl}/perf.html`);
            await page.waitForFunction(() => !!window.__ATLAS_HARNESS__, undefined, { timeout: 30000 });
            return page;
        };
        let page = await newHarnessPage();

        const browserVersion = browser.version();
        const meta = {
            commit,
            dirtyWorkingTree: dirty,
            date: new Date().toISOString(),
            browser: `Chromium ${browserVersion}`,
            mode: args.dev ? 'vite dev' : 'vite build+preview',
            viewport: '1280x720 (headless, no renderer mounted)',
            node: process.version,
            platform: process.platform,
            notes: [
                'Harness drives WorldManager + worker pool directly; renderer stats (draw calls, triangles) are not applicable in this mode.',
                'Heap via performance.memory (--enable-precise-memory-info).',
                'Storage is bypassed (empty world id): pure generation/meshing/streaming cost.',
            ],
        };

        const results = [];
        for (const spec of args.scenarios) {
            const { name, opts } = parseScenario(spec);
            console.log(`[perf] scenario ${name} ${JSON.stringify(opts)}`);
            liveSamples.delete(name);
            try {
                const result = await page.evaluate(
                    ([n, o]) => window.__ATLAS_HARNESS__.run(n, o),
                    [name, opts],
                );
                results.push(result);
            } catch (err) {
                // Likely a renderer crash (OOM / allocation failure) — a real
                // finding, not a harness failure. Record the partial timeline
                // and continue on a fresh page.
                console.error(`[perf] scenario ${name} crashed: ${err.message}`);
                results.push({
                    scenario: name,
                    opts,
                    crashed: true,
                    error: String(err.message ?? err),
                    samples: liveSamples.get(name) ?? [],
                });
                try { await page.close(); } catch { /* already gone */ }
                page = await newHarnessPage();
            }
        }

        await browser.close();

        const outDir = resolve(root, 'docs', 'performance', 'results');
        mkdirSync(outDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const basename = `${stamp}-${args.label}`;
        writeFileSync(resolve(outDir, `${basename}.json`), JSON.stringify({ meta, results }, null, 2));

        const md = [
            `# Atlas perf run: ${args.label}`,
            '',
            `- Commit: \`${commit}\`${dirty ? ' (dirty working tree)' : ''}`,
            `- Date: ${meta.date}`,
            `- Browser: ${meta.browser}`,
            `- Mode: ${meta.mode}`,
            `- Notes: ${meta.notes.join(' ')}`,
            '',
            ...results.map(summarizeScenario),
        ].join('\n');
        writeFileSync(resolve(outDir, `${basename}.md`), md);
        console.log(`[perf] wrote ${basename}.json / .md in docs/performance/results/`);
    } finally {
        server.kill();
    }
}

main().then(() => {
    // vite preview is spawned via npx; killing the wrapper can leave the child
    // holding our stdio pipes open, so exit explicitly once results are written.
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
