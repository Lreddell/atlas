import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../storage/bundleTs.mjs";

globalThis.__APP_VERSION__ = "test";
globalThis.__APP_DISPLAY_VERSION__ = "test";

const { mergeOpaqueGeometryQuads } = await loadTs(`
  export { mergeOpaqueGeometryQuads } from './src/systems/world/meshing/geometryPostprocess';
`);

const quad = (x, z, color = [1, 1, 1], uv = [0, 0, 0.1, 0.1], y = 1) => ({
  positions: [x,y,z, x+1,y,z, x+1,y,z+1, x,y,z+1],
  normals: [0,1,0, 0,1,0, 0,1,0, 0,1,0],
  uvs: [uv[0],uv[1], uv[2],uv[1], uv[2],uv[3], uv[0],uv[3]],
  colors: [...color,...color,...color,...color],
});
const geometry = (quads) => {
  const positions=[], normals=[], uvs=[], colors=[], indices=[];
  quads.forEach((value,index)=>{
    positions.push(...value.positions); normals.push(...value.normals); uvs.push(...value.uvs); colors.push(...value.colors);
    const base=index*4; indices.push(base,base+1,base+2,base,base+2,base+3);
  });
  return {
    positions: Float32Array.from(positions), normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs), colors: Float32Array.from(colors), indices: Uint32Array.from(indices),
  };
};

test("16x16 uniform plane becomes one repeating quad", () => {
  const quads=[];
  for(let z=0;z<16;z++) for(let x=0;x<16;x++) quads.push(quad(x,z));
  const result=mergeOpaqueGeometryQuads(geometry(quads));
  assert.equal(result.positions.length/12,1);
  assert.equal(result.mergedQuadCount,255);
  assert.equal(Math.max(...result.tileUvs),16);
});

test("different lighting prevents merge", () => {
  const result=mergeOpaqueGeometryQuads(geometry([quad(0,0),quad(1,0,[0.5,0.5,1])]));
  assert.equal(result.positions.length/12,2);
  assert.equal(result.mergedQuadCount,0);
});

test("different atlas tiles prevent merge", () => {
  const result=mergeOpaqueGeometryQuads(geometry([quad(0,0),quad(1,0,[1,1,1],[0.2,0,0.3,0.1])]));
  assert.equal(result.positions.length/12,2);
});

test("partial shaped quad remains unmerged", () => {
  const shaped=quad(0,0); shaped.positions[4]=0.5; shaped.positions[7]=0.5;
  const result=mergeOpaqueGeometryQuads(geometry([shaped,quad(1,0)]));
  assert.equal(result.positions.length/12,2);
  assert.equal(result.mergedQuadCount,0);
});

test("separate planes never merge", () => {
  const result=mergeOpaqueGeometryQuads(geometry([quad(0,0),quad(1,0,[1,1,1],[0,0,0.1,0.1],2)]));
  assert.equal(result.positions.length/12,2);
});