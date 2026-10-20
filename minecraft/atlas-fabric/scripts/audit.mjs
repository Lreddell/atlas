import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='build/generated/atlas/assets/atlas/';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const audit=await json(base+'source-audit.json');
assert.equal(audit.content,249);assert.equal(audit.customContent,67);assert.equal(audit.musicTracks,23);
const provenance=await json(base+'audio-provenance.json');
for(const p of provenance){
 const data=await readFile(base+'sounds/'+p.target);
 assert.equal(createHash('sha256').update(data).digest('hex'),p.sha256,p.target);
}
const content=await json(base+'content.json');
for(const d of content.filter(x=>x.custom))assert.ok(await readFile(base+`models/item/${d.path}.json`),d.path);
const recipeDir='build/generated/atlas/data/atlas/recipe/';
assert.ok((await readdir(recipeDir)).includes('induction_relay.json'));
assert.ok(await readFile(base+'logic/bosses.js'));
console.log(`Audit passed: ${audit.content} source definitions, ${audit.customContent} source items, induction relay, ${provenance.length} original music files verified by SHA-256.`);
