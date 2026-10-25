import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile, readFile, cp, readdir } from 'node:fs/promises';
import { resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createMinecraftArt } from './art.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mod = resolve(here, '..'), root = resolve(mod, '../..'), out = resolve(mod, 'build/generated/atlas');
const asset = resolve(out, 'assets/atlas'), data = resolve(out, 'data/atlas');
const put = async (p, v) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n'); };
await mkdir(resolve(mod, 'build/bridge'), { recursive: true });
const entry = `
import '${root.replaceAll('\\','/')}/src/data/resonantInit.ts';
export { BlockType } from '${root.replaceAll('\\','/')}/src/types.ts';
export { BLOCKS } from '${root.replaceAll('\\','/')}/src/data/blocks.ts';
export { RECIPES } from '${root.replaceAll('\\','/')}/src/recipes.ts';
export * from '${root.replaceAll('\\','/')}/src/systems/world/magneticArena.ts';
export * from '${root.replaceAll('\\','/')}/src/systems/world/magneticFields.ts';
export * from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaults.ts';
export { getMusicLoopDefinition } from '${root.replaceAll('\\','/')}/src/systems/sound/musicLoops.ts';
export { paintResonantVaultStructure } from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaultGeneration.ts';
export { buildVaultPuzzleDescriptor } from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaultPuzzles.ts';
export { getVaultCacheDescriptors, getVaultCacheLoot } from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaultLoot.ts';
export { getVaultEscapeRoutes } from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaultEscapes.ts';
export * from '${root.replaceAll('\\','/')}/src/systems/boss/magneticWardenCore.ts';
export { createBellTitanState, advanceBellTitan } from '${root.replaceAll('\\','/')}/src/systems/entities/BellTitanEncounterCore.ts';
export { generateAtlasCanvas } from '${root.replaceAll('\\','/')}/src/utils/textures.ts';
export { getResonantTilePixels } from '${root.replaceAll('\\','/')}/src/systems/textures/resonantTexturePixels.ts';
export { SimpleNoise } from '${root.replaceAll('\\','/')}/src/utils/noise.ts';
export { VAULT_ENEMY_PROFILES } from '${root.replaceAll('\\','/')}/src/systems/entities/resonantVaultEnemies.ts';
export { BELL_TITAN_MODEL } from '${root.replaceAll('\\','/')}/src/components/bellTitanModel.ts';
export { VAULT_ENEMY_MODELS } from '${root.replaceAll('\\','/')}/src/components/resonantVaultEnemyModels.ts';
export { resolveTile } from '${root.replaceAll('\\','/')}/src/systems/world/textureResolver.ts';
export { getRoomEncounterWaves, getBellTitanReinforcementWave } from '${root.replaceAll('\\','/')}/src/systems/entities/resonantVaultEnemies.ts';
export { buildVaultHazards, getHazardFloorCells, sampleVaultHazard } from '${root.replaceAll('\\','/')}/src/systems/world/resonantVaultHazards.ts';
`;
await build({ stdin: { contents: entry, resolveDir: mod, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', nodePaths: [resolve(mod, 'node_modules')], define: {__APP_VERSION__:JSON.stringify('1.3.0'),__APP_DISPLAY_VERSION__:JSON.stringify('Alpha 1.3.0')}, outfile: resolve(mod, 'build/bridge/source.mjs') });
const atlas = await import(pathToFileURL(resolve(mod, 'build/bridge/source.mjs')));
globalThis.document = { createElement: () => createCanvas(16, 16) };
const sheet = atlas.generateAtlasCanvas();
const custom = new Set(`COPPER_PICKAXE COPPER_AXE COPPER_SHOVEL COPPER_SWORD COPPER_HOE COPPER_HELMET COPPER_CHESTPLATE COPPER_LEGGINGS COPPER_BOOTS POLARITY_BOOTS POLARITY_BOOTS_UPGRADE UPGRADED_POLARITY_BOOTS POSITIVE_MAGNET NEGATIVE_MAGNET MAGNETITE_BLOCK POSITIVE_MAGNETITE_CRYSTAL NEGATIVE_MAGNETITE_CRYSTAL MAGNETIC_SPIKE MAGNETIC_BOSS_SUMMONER MAGNETIC_SHIELD_CRYSTAL CHARGED_MAGNETITE MAGNETITE_SHARD MAGNETITE_SLAB MAGNETITE_STAIRS MAGNETITE_BRICKS MAGNETITE_BRICK_SLAB MAGNETITE_BRICK_STAIRS CHISELED_MAGNETITE ECHO_STONE ECHO_BRICKS CRACKED_ECHO_BRICKS CHISELED_ECHO_STONE ECHO_MOSAIC ECHO_CRYSTAL RESONANCE_PYLON PULSE_CONDUIT PHASE_BLOCK RESONANCE_PLATE RESONANT_LAMP ECHO_SPIKES SENTINEL_CORE LISTENING_STONE VAULT_SEAL ECHO_SHARD ECHO_DUST ECHO_CORE FRACTURED_CORE ECHO_STONE_SLAB ECHO_STONE_STAIRS ECHO_BRICK_SLAB ECHO_BRICK_STAIRS VAULTSTEEL_SPEAR VAULT_CROSSBOW VAULT_BOLT BELLBREAKER_MAUL ECHO_TUNING_FORK TITAN_HAMMER BANANA LUMEN_BERRY FORAGERS_BOWL MOSSY_GRASS LUSH_GRASS DARK_GRASS MEADOW_GRASS SAVANNA_GRASS JUNGLE_GRASS DEBUG_CROSS`.split(' '));
const aliases = { GRASS:'grass_block', LOG:'oak_log', LEAVES:'oak_leaves', SAPLING:'oak_sapling', BRICK:'bricks', BRICK_SLAB:'brick_slab', BRICK_STAIRS:'brick_stairs', FURNACE_ACTIVE:'furnace', BED_FOOT:'red_bed', BED_HEAD:'red_bed', BED_ITEM:'red_bed', WOOL:'white_wool', MAGMA:'magma_block', SNOWY_GRASS:'grass_block', GRASS_PLANT:'short_grass', ROSE:'poppy', PINK_FLOWER:'pink_petals', BOAT:'oak_boat', WHEAT:'wheat', TERRACOTTA_YELLOW:'yellow_terracotta', TERRACOTTA_RED:'red_terracotta', TERRACOTTA_WHITE:'white_terracotta', TERRACOTTA_ORANGE:'orange_terracotta', TERRACOTTA_MAGENTA:'magenta_terracotta', TERRACOTTA_LIGHT_GRAY:'light_gray_terracotta', TERRACOTTA_BROWN:'brown_terracotta', LAPIS_ORE:'lapis_ore' };
const names = Object.fromEntries(Object.entries(atlas.BlockType).filter(([k,v]) => typeof v === 'number').map(([k,v]) => [v,k]));
const mcName = n => aliases[n] ?? n.toLowerCase().replace(/^wood_/, 'wooden_').replace(/^gold_(pickaxe|axe|hoe|shovel|sword|helmet|chestplate|leggings|boots)$/, 'golden_$1');
const id = n => custom.has(n) ? 'atlas:' + n.toLowerCase() : 'minecraft:' + mcName(n);
const idByNumber = Object.fromEntries(Object.entries(names).map(([v,n]) => [v,id(n)]));
const defs = Object.entries(names).filter(([v])=>atlas.BLOCKS[v]).map(([v,n])=>({ ...atlas.BLOCKS[v], key:n, path:n.toLowerCase(), mc:id(n), custom:custom.has(n), hardness: Number.isFinite(atlas.BLOCKS[v].hardness) ? atlas.BLOCKS[v].hardness : -1, drops:(atlas.BLOCKS[v].drops??[]).map(d=>({...d, item:idByNumber[d.type]})) }));
await put(resolve(asset,'content.json'), defs);
await put(resolve(asset,'legacy-ids.json'), idByNumber);
await put(resolve(asset,'enemy-profiles.json'),atlas.VAULT_ENEMY_PROFILES);
await put(resolve(asset,'titan-reinforcements.json'),[atlas.getBellTitanReinforcementWave(1),atlas.getBellTitanReinforcementWave(2)]);
await put(resolve(out,'data/minecraft/tags/item/arrows.json'),{replace:false,values:['atlas:vault_bolt']});
const lang = { 'itemGroup.atlas':'Atlas: Light & Polarity','key.categories.atlas':'Atlas','key.atlas.free':'Free third person','key.atlas.shoulder':'Shoulder camera','key.atlas.detached':'Detached camera','key.atlas.dodge':'Dodge / magnetic dash','key.atlas.polarity':'Flip polarity','key.atlas.boots':'Toggle polarity boots','key.atlas.config':'Atlas settings','entity.atlas.magnetic_warden':'Magnetic Warden','entity.atlas.bell_titan':'Bell Titan','entity.atlas.vault_guard':'Vault Guard','entity.atlas.vault_marksman':'Vault Marksman','entity.atlas.bell_hound':'Bell Hound','entity.atlas.tollkeeper':'Tollkeeper','biome.atlas.magnetic_fields':'Magnetic Fields','biome.atlas.volcanic':'Volcanic Highlands' };
for(const name of ['magnetic_warden','bell_titan','vault_guard','vault_marksman','bell_hound','tollkeeper'])lang['item.atlas.'+name+'_spawn_egg']=lang['entity.atlas.'+name]+' Spawn Egg';
const tools = [], solids=[];
const mechanisms = new Set('magnetic_boss_summoner magnetic_shield_crystal resonance_pylon pulse_conduit phase_block resonance_plate sentinel_core listening_stone vault_seal'.split(' '));
const crystalNames = new Set('positive_magnetite_crystal negative_magnetite_crystal magnetic_shield_crystal echo_crystal magnetic_spike echo_spikes magnetite_shard'.split(' '));
for (const d of defs.filter(d=>d.custom)) {
  const p=d.path, isBlock=!d.isItem || ['positive_magnet','negative_magnet','magnetite_shard'].includes(p);
  d.block=isBlock;
  lang[(isBlock?'block.':'item.')+'atlas.'+p]=d.name;
  const tile = createCanvas(16,16), ctx=tile.getContext('2d');
  if (d.textureSlot>=237) ctx.putImageData(new ImageData(atlas.getResonantTilePixels(d.textureSlot),16,16),0,0);
  else ctx.drawImage(sheet,(d.textureSlot%8)*32+8,Math.floor(d.textureSlot/8)*32+8,16,16,0,0,16,16);
  await put(resolve(asset,`textures/${isBlock?'block':'item'}/${p}.png`),tile.toBuffer('image/png'));
  if(isBlock) {
    tools.push(d.mc); solids.push(d.mc);
    const parent = d.textureParent ? idByNumber[d.textureParent].split(':')[1] : p;
    const texture = 'atlas:block/'+parent;
    let variants = { '': { model:'atlas:block/'+p } };
    if(d.shape==='slab') {
      await put(resolve(asset,`models/block/${p}.json`),{parent:'minecraft:block/slab',textures:{bottom:texture,top:texture,side:texture}});
      await put(resolve(asset,`models/block/${p}_top.json`),{parent:'minecraft:block/slab_top',textures:{bottom:texture,top:texture,side:texture}});
      variants={ 'type=bottom':{model:'atlas:block/'+p},'type=top':{model:'atlas:block/'+p+'_top'},'type=double':{model:'atlas:block/'+parent} };
    } else if(d.shape==='stairs') {
      for(const suffix of ['', '_inner','_outer']) await put(resolve(asset,`models/block/${p+suffix}.json`),{parent:'minecraft:block/'+(suffix?suffix==='_inner'?'inner_stairs':'outer_stairs':'stairs'),textures:{bottom:texture,top:texture,side:texture}});
      variants={};
      for(const [f,rot] of Object.entries({east:0,south:90,west:180,north:270})) for(const half of ['bottom','top']) for(const shape of ['straight','inner_left','inner_right','outer_left','outer_right']) {
        let y=rot+(shape.endsWith('left')?270:0); if(half==='top'&&shape!=='straight')y+=90;
        variants[`facing=${f},half=${half},shape=${shape}`]={model:'atlas:block/'+p+(shape.startsWith('inner')?'_inner':shape.startsWith('outer')?'_outer':''),y:y%360,x:half==='top'?180:0,uvlock:true};
      }
    } else if(crystalNames.has(p)) {
      await put(resolve(asset,`models/block/${p}.json`),{parent:'minecraft:block/cross',textures:{cross:'atlas:block/'+p}});
    } else if(p.endsWith('_grass')){
      const textures={};for(const[face,vec]of Object.entries({top:[0,1,0],bottom:[0,-1,0],side:[1,0,0]})){const slot=atlas.resolveTile(d.id,face,...vec).texIdx;const image=createCanvas(16,16);image.getContext('2d').drawImage(sheet,(slot%8)*32+8,Math.floor(slot/8)*32+8,16,16,0,0,16,16);await put(resolve(asset,`textures/block/${p}_${face}.png`),image.toBuffer('image/png'));textures[face]=`atlas:block/${p}_${face}`;}await put(resolve(asset,`models/block/${p}.json`),{parent:'minecraft:block/cube_bottom_top',textures});
    } else {
      await put(resolve(asset,`models/block/${p}.json`),{parent:'minecraft:block/cube_all',textures:{all:'atlas:block/'+p}});
    }
    if(mechanisms.has(p)) variants={'':{model:'atlas:block/'+p}};
    await put(resolve(asset,`blockstates/${p}.json`),{variants});
    await put(resolve(asset,`models/item/${p}.json`),crystalNames.has(p)?{parent:'minecraft:item/generated',textures:{layer0:'atlas:block/'+p}}:{parent:'atlas:block/'+p});
    const drop=d.drops?.[0];
    await put(resolve(data,`loot_table/blocks/${p}.json`),{type:'minecraft:block',pools:d.hardness<0?[]:[{rolls:1,entries:[{type:'minecraft:item',name:drop?.item??d.mc,functions:drop? [{function:'minecraft:set_count',count:{type:'minecraft:uniform',min:drop.min,max:drop.max}}]:[]}],conditions:[{condition:'minecraft:survives_explosion'}]}]});
  } else await put(resolve(asset,`models/item/${p}.json`),{parent:/spear|maul|hammer|fork|sword|axe|shovel|hoe/.test(p)?'minecraft:item/handheld':'minecraft:item/generated',textures:{layer0:'atlas:item/'+p}});
}
await put(resolve(asset,'content.json'),defs);
await put(resolve(asset,'lang/en_us.json'),lang);
await put(resolve(out,'data/minecraft/tags/block/mineable/pickaxe.json'),{replace:false,values:tools});
await put(resolve(out,'data/minecraft/tags/block/needs_stone_tool.json'),{replace:false,values:solids.filter(x=>!x.includes('crystal'))});
for(const[tier,tag]of [[2,'needs_stone_tool'],[3,'needs_iron_tool'],[4,'needs_diamond_tool']])await put(resolve(out,`data/minecraft/tags/block/${tag}.json`),{replace:false,values:defs.filter(d=>d.custom&&d.block&&d.minHarvestTier===tier).map(d=>d.mc)});
let recipeCount=0;
for(const r of atlas.RECIPES) {
 const n=names[r.output.type]; if(!custom.has(n)) continue;
 const keys={},symbols=new Map(); let sym=65;
 const pattern=Array.from({length:r.gridSize},(_,y)=>Array.from({length:r.gridSize},(_,x)=>{const v=r.pattern[y*r.gridSize+x];if(v==null)return ' ';if(!symbols.has(v)){const ch=String.fromCharCode(sym++);symbols.set(v,ch);keys[ch]={item:idByNumber[v]};}return symbols.get(v);}).join(''));
 while(pattern.length&&pattern[0].trim()==='')pattern.shift();while(pattern.length&&pattern.at(-1).trim()==='')pattern.pop();
 const all=pattern.join(''); if(!all.trim())continue;
 let left=0,right=r.gridSize-1;while(pattern.every(row=>row[left]===' '))left++;while(pattern.every(row=>row[right]===' '))right--;
 const recipeId=`${n.toLowerCase()}_${recipeCount++}`;await put(resolve(data,`recipe/${recipeId}.json`),{type:'minecraft:crafting_shaped',category:'misc',pattern:pattern.map(row=>row.slice(left,right+1)),key:keys,result:{id:id(n),count:r.output.count}});
 const criteria=Object.fromEntries(Object.entries(keys).map(([key,value])=>[key,{trigger:'minecraft:inventory_changed',conditions:{items:[{items:[value.item]}]}}]));await put(resolve(data,`advancement/recipes/${recipeId}.json`),{parent:'minecraft:recipes/root',criteria,requirements:[Object.keys(criteria)],rewards:{recipes:['atlas:'+recipeId]}});
}
const index=JSON.parse(await readFile(resolve(root,'public/assets/rvx/sounds/music-index.json'))), sounds={}, music={}, durations={}, provenance=[],loops={};
for(const [tag,tracks] of Object.entries(index)) {
 music[tag]=[];
 for(const [i,track] of tracks.entries()) {
  const p=`music/${tag}/${basename(track,'.ogg').toLowerCase().replace(/[^a-z0-9_]/g,'_')}`;
  const bytes=await readFile(resolve(root,'public',track));await put(resolve(asset,`sounds/${p}.ogg`),bytes);
  const event=`music.${tag}.${i}`;sounds[event]={sounds:[{name:'atlas:'+p,stream:true,preload:false,volume:0.72}]};music[tag].push(event);
  const loop=atlas.getMusicLoopDefinition(track);if(loop){
   const target=resolve(asset,`sounds/${p}_loop.ogg`);execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',resolve(root,'public',track),'-af',`atrim=start_sample=${loop.startSample}:end_sample=${loop.endSample}`,'-ar',String(loop.sampleRate),'-c:a','libvorbis','-q:a','6',target],{stdio:'pipe'});
   const loopEvent=event+'.loop';sounds[loopEvent]={sounds:[{name:'atlas:'+p+'_loop',stream:false,preload:false,volume:0.72}]};loops[event]={...loop,event:loopEvent};
  }
  const vorbis=bytes.indexOf(Buffer.from([1,118,111,114,98,105,115])),page=bytes.lastIndexOf('OggS');
  if(vorbis>=0&&page>=0)durations[event]=Number(bytes.readBigUInt64LE(page+6))/bytes.readUInt32LE(vorbis+12);
  provenance.push({source:track,target:p+'.ogg',sha256:createHash('sha256').update(bytes).digest('hex')});
 }
}
for(const folder of ['magnetic_warden','resonant_vault','player','polarity'])for(const f of await readdir(resolve(root,'public/assets/rvx/sounds',folder)))if(f.endsWith('.ogg')){
 const event=folder+'.'+basename(f,'.ogg');await cp(resolve(root,'public/assets/rvx/sounds',folder,f),resolve(asset,'sounds',folder,f)).catch(async()=>{await mkdir(resolve(asset,'sounds',folder),{recursive:true});await cp(resolve(root,'public/assets/rvx/sounds',folder,f),resolve(asset,'sounds',folder,f));});
 sounds[event]={subtitle:'subtitles.atlas.'+event,sounds:[{name:'atlas:'+folder+'/'+basename(f,'.ogg'),volume:folder==='resonant_vault'?0.55:0.65,attenuation_distance:folder==='magnetic_warden'||folder==='resonant_vault'?64:24}]};lang['subtitles.atlas.'+event]=event.split('.').at(-1).replaceAll('_',' ');
}
lang['block.atlas.ferric_reed']='Ferric Reed';lang['item.atlas.ferric_reed']='Ferric Reed';
await put(resolve(data,'loot_table/blocks/ferric_reed.json'),{type:'minecraft:block',pools:[{rolls:1,entries:[{type:'minecraft:item',name:'atlas:ferric_reed'}],conditions:[{condition:'minecraft:survives_explosion'}]}]});
await put(resolve(data,'recipe/ferric_reed_iron.json'),{type:'minecraft:smelting',category:'misc',ingredient:{item:'atlas:ferric_reed'},result:{id:'minecraft:iron_nugget'},experience:.1,cookingtime:200});
await put(resolve(data,'advancement/recipes/ferric_reed_iron.json'),{parent:'minecraft:recipes/root',criteria:{reed:{trigger:'minecraft:inventory_changed',conditions:{items:[{items:['atlas:ferric_reed']}]}}},requirements:[['reed']],rewards:{recipes:['atlas:ferric_reed_iron']}});
lang['entity.atlas.lodestone_mite']='Lodestone Mite';lang['item.atlas.lodestone_mite_spawn_egg']='Lodestone Mite Spawn Egg';
lang['biome.atlas.ironwind_verge']='Ironwind Verge';lang['biome.atlas.compass_barrens']='Compass Barrens';lang['biome.atlas.railgrave']='Railgrave';
lang['key.atlas.field']='Warden Field';lang['key.atlas.journal']='Field journal';lang['block.atlas.induction_relay']='Induction Relay';
await put(resolve(asset,'blockstates/induction_relay.json'),{variants:{'active=false':{model:'atlas:block/induction_relay_off'},'active=true,tone=0':{model:'atlas:block/induction_relay_positive'},'active=true,tone=1':{model:'atlas:block/induction_relay_negative'},'active=true,tone=2':{model:'atlas:block/induction_relay_positive'},'active=true,tone=3':{model:'atlas:block/induction_relay_negative'}}});
for(const[variant,texture]of Object.entries({off:'magnetite_bricks',positive:'positive_magnet',negative:'negative_magnet'}))await put(resolve(asset,`models/block/induction_relay_${variant}.json`),{parent:'minecraft:block/cube',textures:{particle:'atlas:block/'+texture,down:'atlas:block/magnetite_bricks',up:'atlas:block/chiseled_magnetite',north:'atlas:block/'+texture,south:'atlas:block/'+texture,east:'atlas:block/'+texture,west:'atlas:block/'+texture}});
await put(resolve(asset,'models/item/induction_relay.json'),{parent:'atlas:block/induction_relay_positive'});
await put(resolve(data,'loot_table/blocks/induction_relay.json'),{type:'minecraft:block',pools:[{rolls:1,entries:[{type:'minecraft:item',name:'atlas:induction_relay'}],conditions:[{condition:'minecraft:survives_explosion'}]}]});
await put(resolve(data,'recipe/induction_relay.json'),{type:'minecraft:crafting_shaped',category:'redstone',pattern:['CRC','PIN','CRC'],key:{C:{item:'minecraft:copper_ingot'},R:{item:'minecraft:redstone'},P:{item:'atlas:positive_magnetite_crystal'},I:{item:'minecraft:iron_ingot'},N:{item:'atlas:negative_magnetite_crystal'}},result:{id:'atlas:induction_relay',count:2}});
await put(resolve(data,'advancement/recipes/induction_relay.json'),{parent:'minecraft:recipes/root',criteria:{crystal:{trigger:'minecraft:inventory_changed',conditions:{items:[{items:['atlas:positive_magnetite_crystal']}]}}},requirements:[['crystal']],rewards:{recipes:['atlas:induction_relay']}});
await put(resolve(asset,'sounds.json'),sounds);await put(resolve(asset,'music.json'),music);await put(resolve(asset,'lang/en_us.json'),lang);
await put(resolve(asset,'music-durations.json'),durations);
await put(resolve(asset,'music-loops.json'),loops);
await put(resolve(asset,'audio-provenance.json'),provenance);
const span=161, minY=-26, maxY=59, volume=new Uint16Array(span*span*(maxY-minY+1)).fill(65535);
atlas.generateMagneticWardenArena(0,0,0,{minX:-80,maxX:80,minZ:-80,maxZ:80,setBlock:(x,y,z,t)=>{if(x>=-80&&x<=80&&z>=-80&&z<=80&&y>=minY&&y<=maxY)volume[((x+80)*span+z+80)*(maxY-minY+1)+y-minY]=t;}});
const arena=Buffer.alloc(16+volume.length*2);arena.writeInt32BE(span,0);arena.writeInt32BE(minY,4);arena.writeInt32BE(maxY,8);arena.writeInt32BE(80,12);volume.forEach((v,i)=>arena.writeUInt16BE(v,16+i*2));
await put(resolve(asset,'generation/magnetic-arena.bin.gz'),gzipSync(arena));
// Keep the source reducers intact for parity tests. The playable policy is a
// separate, checked adaptation: no global shields, damage caps or lost overkill.
function replaceOnce(source, before, after) {
 if(source.split(before).length!==2)throw Error('Native boss adapter drift: '+before);
 return source.replace(before,after);
}
let nativeWarden=await readFile(resolve(root,'src/systems/boss/magneticWardenCore.ts'),'utf8');
nativeWarden=replaceOnce(nativeWarden,"if (isWardenTransitioning(state)) return 'transition';",'');
nativeWarden=replaceOnce(nativeWarden,"if (isWardenShielded(state)) return 'shielded';",'');
nativeWarden=replaceOnce(nativeWarden,"if (relation === 'same') return 'repelled';",'');
nativeWarden=replaceOnce(nativeWarden,'Math.min(WARDEN_DAMAGE_CAP, clampDuration(input.amount) * multiplier)','clampDuration(input.amount) * multiplier');
for(const phase of [2,3])nativeWarden=replaceOnce(nativeWarden,`hp: state.maxHp * WARDEN_FORM_THRESHOLDS[${phase}],`,'hp: state.hp,');
await put(resolve(mod,'build/bridge/native-warden.ts'),nativeWarden);
// Titan retains the powerful exposed-bell opening; the closed shell takes chip damage.
let nativeTitan=await readFile(resolve(root,'src/systems/entities/BellTitanEncounterCore.ts'),'utf8');
nativeTitan=replaceOnce(nativeTitan,'Math.min(BELL_TITAN_DAMAGE_CAP, clampDuration(input.amount) * multiplier)','clampDuration(input.amount) * (coreHit ? multiplier : 0.25)');
// This file also contains the original TS runtime; relative imports must resolve
// against its source directory while esbuild eliminates unused runtime exports.
nativeTitan=nativeTitan.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+q+resolve(root,'src/systems/entities',p).replaceAll('\\','/')+q);
await put(resolve(mod,'build/bridge/native-titan.ts'),nativeTitan);
const coreEntry=`
import {createWardenState,advanceWarden} from '${root.replaceAll('\\','/')}/src/systems/boss/magneticWardenCore.ts';
import {createBellTitanState,advanceBellTitan} from '${root.replaceAll('\\','/')}/src/systems/entities/BellTitanEncounterCore.ts';
import {advanceWarden as nativeWarden} from './build/bridge/native-warden.ts';
import {advanceBellTitan as nativeTitan} from './build/bridge/native-titan.ts';
export function step(kind,state,input){var s=state?JSON.parse(state):(kind==='warden'?createWardenState():createBellTitanState());return JSON.stringify(kind==='warden'?advanceWarden(s,JSON.parse(input)):advanceBellTitan(s,JSON.parse(input)));}
export function play(kind,state,input){var s=state?JSON.parse(state):(kind==='warden'?createWardenState():createBellTitanState());return JSON.stringify(kind==='warden'?nativeWarden(s,JSON.parse(input)):nativeTitan(s,JSON.parse(input)));}
`;
const js=await build({stdin:{contents:coreEntry,resolveDir:mod,loader:'ts'},bundle:true,platform:'neutral',format:'iife',globalName:'AtlasCore',target:'es2015',write:false});
const es5=await transformAsync(js.outputFiles[0].text,{presets:[['@babel/preset-env',{targets:{ie:'11'},modules:false}]],comments:false,compact:false});
await put(resolve(asset,'logic/bosses.js'),es5.code);
const fixtures=[];for(const seed of [0,1,42,-1943,2147483647]){const noise=new atlas.SimpleNoise(seed+800);const sample=(x,z)=>noise.noise2D(x,z);for(const [x,z]of [[0,0],[100,200],[-42,812],[1536,-1536],[5028,4831]])fixtures.push({seed,x,z,noise:sample(x*.011,z*.011),nearest:atlas.findNearestMagneticField(x,z,seed,sample,15000),column:atlas.getMagneticFieldColumn(x,z,seed,sample)});}
await put(resolve(asset,'generation/golden.json'),fixtures);
const columns=[];for(const seed of [0,1,42,-1943,2147483647]){const n=new atlas.SimpleNoise(seed+800),sample=(x,z)=>n.noise2D(x,z);const c=atlas.findNearestMagneticField(0,0,seed,sample);for(const[dx,dz]of [[0,0],[80,0],[90,20],[200,200],[350,0],[-400,0],[-370,-300]]){let x=c.centerX+dx,z=c.centerZ+dz;columns.push({seed,x,z,column:atlas.getMagneticFieldColumn(x,z,seed,sample)});}}await put(resolve(asset,'generation/golden-columns.json'),columns);
const templateCandidate={gridX:0,gridZ:0,centerX:0,centerZ:0,seed:42,active:true,orientation:0};
await put(resolve(asset,'generation/vault-layout.json'),atlas.getVaultLayout(templateCandidate,70,()=>70));
for(const [variant,seed] of [42,1,2].entries()){
 const candidate={...templateCandidate,seed};const layout=atlas.getVaultLayout(candidate,70,()=>70);
 const vs=545,vy0=-64,vy1=150,vh=vy1-vy0+1,blocks=new Uint16Array(vs*vs*vh).fill(65535),metadata=new Uint8Array(blocks.length);
 const offset=(x,y,z)=>x< -272||x>272||z< -272||z>272||y<vy0||y>vy1?-1:((x+272)*vs+z+272)*vh+y-vy0;
 const writer={get:(x,y,z)=>{let i=offset(x,y,z);return i<0?null:blocks[i]===65535?3:blocks[i];},set:(x,y,z,t,m=0,only)=>{let i=offset(x,y,z);if(i<0||only&&!only.has(writer.get(x,y,z)))return;blocks[i]=t;metadata[i]=m;}};
 atlas.paintResonantVaultStructure(writer,candidate,layout,{seed,getSurfaceY:()=>70});
 const columns=[];let total=0;
 for(let x=-272;x<=272;x++)for(let z=-272;z<=272;z++){
  const runs=[];let y=vy0;while(y<=vy1){let i=offset(x,y,z),t=blocks[i],m=metadata[i],start=y;y++;while(y<=vy1&&blocks[offset(x,y,z)]===t&&metadata[offset(x,y,z)]===m)y++;if(t!==65535)runs.push([start,y-1,t,m]);}
  if(runs.length){columns.push([x,z,runs]);total+=6+runs.length*8;}
 }
 const buf=Buffer.alloc(4+total);buf.writeInt32BE(columns.length,0);let at=4;for(const[x,z,runs]of columns){buf.writeInt16BE(x,at);buf.writeInt16BE(z,at+2);buf.writeUInt16BE(runs.length,at+4);at+=6;for(const[y0,y1,t,m]of runs){buf.writeInt16BE(y0,at);buf.writeInt16BE(y1,at+2);buf.writeUInt16BE(t,at+4);buf.writeUInt16BE(m,at+6);at+=8;}}
 await put(resolve(asset,`generation/vault-${variant}.bin.gz`),gzipSync(buf));
 layout.puzzles=layout.rooms.filter(r=>['memory_choir','counterweight_gallery','acoustic_relay','broken_crossing'].includes(r.kind)).map(atlas.buildVaultPuzzleDescriptor);
 for(const room of layout.rooms)if(['guard_hall','resonance_foundry','fractured_archive','inner_works','bell_crypt','grand_ascent'].includes(room.kind))room.waves=atlas.getRoomEncounterWaves(room.kind,seed^room.variant);
 layout.caches=atlas.getVaultCacheDescriptors(layout).map(c=>({...c,loot:atlas.getVaultCacheLoot(layout.vaultId,c.id,true)}));layout.escapeRoutes=atlas.getVaultEscapeRoutes(layout);layout.hazards=atlas.buildVaultHazards(layout.escapeRoutes).map(h=>({...h,cells:atlas.getHazardFloorCells(h)}));
 await put(resolve(asset,`generation/vault-layout-${variant}.json`),layout);
 console.log(`Vault ${variant}: ${columns.length} columns, ${buf.length} bytes before compression`);
}
const hazardFixtures=[];for(const d of atlas.buildVaultHazards('fixture:all'))for(const tier of [0,1,2,3])for(const time of [0,.8,1.7,2.5,3.2,4.5,17.5])hazardFixtures.push({descriptor:d,time,tier,expected:atlas.sampleVaultHazard(d,time,tier)});await put(resolve(asset,'generation/golden-hazards.json'),hazardFixtures);
for(const file of ['bell_hound','bell_titan','tollkeeper','vault_guard','vault_marksman']) {await mkdir(resolve(asset,'textures/entity'),{recursive:true});await cp(resolve(root,`public/assets/rvx/textures/entities/${file}.png`),resolve(asset,`textures/entity/${file}.png`));}
await createMinecraftArt(atlas,asset,put);
// Atlas stores its menu captures as a 4-by-3 cubemap cross. Offer the three
// originals through Minecraft's existing resource-pack picker.
for(const[name,file,label]of [['riverlands','riverlands-1.3.0','Riverlands'],['tundra','tundra-1.3.0','Tundra'],['classic','alpha-1.0.1','Classic Atlas']]){
 const capture=await loadImage(resolve(root,`public/assets/panoramas/${file}.webp`)),size=capture.width/4;
 const pack=resolve(out,`resourcepacks/${name}`);
 await put(resolve(pack,'pack.mcmeta'),{pack:{pack_format:34,description:`Atlas menu panorama: ${label}`}});
 for(const[i,[x,y]]of [[0,1],[1,1],[2,1],[3,1],[1,2],[1,0]].entries()){
  const face=createCanvas(512,512);face.getContext('2d').drawImage(capture,x*size,y*size,size,size,0,0,512,512);await put(resolve(pack,`assets/minecraft/textures/gui/title/background/panorama_${i}.png`),face.toBuffer('image/png'));
 }
}
const audit={sourceCommit:'d7444cb6a56b984a1d9a71e6362419d5d6653fed',content:defs.length,customContent:defs.filter(d=>d.custom).length,recipes:recipeCount,musicTracks:provenance.length,musicGroups:Object.keys(music),effects:Object.keys(sounds).filter(x=>!x.startsWith('music.')).length,arenaBytes:arena.length};
await put(resolve(asset,'source-audit.json'),audit);await put(resolve(mod,'build/source-audit.json'),audit);console.log(JSON.stringify(audit,null,2));
