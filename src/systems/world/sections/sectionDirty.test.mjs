import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../storage/bundleTs.mjs";

globalThis.__APP_VERSION__ = "test";
globalThis.__APP_DISPLAY_VERSION__ = "test";

const mod = await loadTs(`
  export { affectedSectionsForEdit, packSectionKey, unpackSectionKey }
    from './src/systems/world/sections/sectionDirty';
  export { WorldEditTransaction } from './src/systems/world/worldEditTransaction';
`);
const { affectedSectionsForEdit, packSectionKey, unpackSectionKey, WorldEditTransaction } = mod;
const sorted = (keys) => [...keys].map(unpackSectionKey).sort((a,b)=>a.cx-b.cx||a.cz-b.cz||a.sectionY-b.sectionY);

test("interior edit dirties only its own section", () => {
  assert.deepEqual(sorted(affectedSectionsForEdit(2,5,3)), [{cx:0,cz:0,sectionY:4}]);
});

test("vertical boundary edit dirties only the adjacent vertical section", () => {
  assert.deepEqual(sorted(affectedSectionsForEdit(2,0,3)), [
    {cx:0,cz:0,sectionY:3},{cx:0,cz:0,sectionY:4},
  ]);
  assert.deepEqual(sorted(affectedSectionsForEdit(2,15,3)), [
    {cx:0,cz:0,sectionY:4},{cx:0,cz:0,sectionY:5},
  ]);
});

test("chunk edge edit dirties only face-neighbor sections", () => {
  assert.deepEqual(sorted(affectedSectionsForEdit(15,6,7)), [
    {cx:0,cz:0,sectionY:4},{cx:1,cz:0,sectionY:4},
  ]);
  assert.deepEqual(sorted(affectedSectionsForEdit(-16,6,-16)), [
    {cx:-2,cz:-1,sectionY:4},{cx:-1,cz:-2,sectionY:4},{cx:-1,cz:-1,sectionY:4},
  ]);
});

test("packed keys round-trip signed 32-bit coordinates", () => {
  for (const value of [
    {cx:0,cz:0,sectionY:0},
    {cx:-1,cz:1,sectionY:23},
    {cx:2_000_000_000,cz:-2_000_000_000,sectionY:12},
  ]) assert.deepEqual(unpackSectionKey(packSectionKey(value.cx,value.cz,value.sectionY)), value);
});

test("transaction applies immediately and deduplicates sections/chunks", () => {
  const applied=[];
  const transaction = new WorldEditTransaction((edit)=>applied.push(edit));
  transaction.setBlock(1,5,1,2,0);
  transaction.setBlock(2,5,2,3,1);
  transaction.setBlock(15,5,2,4,0);
  const result=transaction.commit();
  assert.equal(applied.length,3);
  assert.equal(result.editCount,3);
  assert.deepEqual([...result.chunkKeys].sort(),['0,0','1,0']);
  assert.equal(result.sectionKeys.size,2);
});

test("transaction commit is idempotent and writes close after commit", () => {
  const transaction=new WorldEditTransaction(()=>{});
  transaction.setBlock(0,0,0,1);
  const first=transaction.commit();
  assert.equal(transaction.commit(),first);
  assert.throws(()=>transaction.setBlock(0,0,0,2),/committed/);
});