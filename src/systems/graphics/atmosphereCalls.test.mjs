import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// GLSL is only compiled in the browser, so a changed signature in the shared
// atmosphere functions (atmosphereUniforms.ts) breaks a caller silently: the
// shader fails to compile and whatever it draws disappears. This checks every
// call site in the source against the signatures.
const root = path.resolve(import.meta.dirname, '../../..');
const files = execFileSync('git', ['ls-files', 'src/*.ts', 'src/*.tsx'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);

const SIGNATURES = { atlasFogAmount: 2, atlasApplyFog: 2, atlasSkyRadiance: 1, atlasSkyGradient: 1, atlasSunHalo: 1 };

/** The top-level argument count of the call whose '(' is at `open`. */
function argumentCount(source, open) {
    let depth = 0;
    let count = 1;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === '(') depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0) return source.slice(open + 1, i).trim() === '' ? 0 : count;
        } else if (c === ',' && depth === 1) count++;
    }
    return -1;
}

test('every call to the shared atmosphere functions matches their signatures', () => {
    const problems = [];
    let calls = 0;
    for (const file of files) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        for (const [name, expected] of Object.entries(SIGNATURES)) {
            const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
            for (const match of source.matchAll(pattern)) {
                // Skip the definitions themselves ("float atlasFogAmount(vec3 v, ...").
                const before = source.slice(Math.max(0, match.index - 8), match.index);
                if (/(float|vec3|vec4)\s+$/.test(before)) continue;
                calls++;
                const got = argumentCount(source, match.index + match[0].length - 1);
                if (got !== expected) problems.push(`${file}: ${name} called with ${got} arguments, takes ${expected}`);
            }
        }
    }
    assert.ok(calls > 5, 'the call sites were found');
    assert.deepEqual(problems, []);
});
