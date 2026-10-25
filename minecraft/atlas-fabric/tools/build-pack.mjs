/** Download only pinned upstream files and produce a standard Modrinth pack. */
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const lock=JSON.parse(await readFile('pack/mods.lock.json','utf8'));
const version=(await readFile('gradle.properties','utf8')).match(/^mod_version=(.+)$/m)[1].trim();
const dir='build/pack';await mkdir(dir+'/mods',{recursive:true});
const files=[];
for(const mod of lock.mods){
  const response=await fetch(mod.url,{headers:{'User-Agent':'AtlasFabricPack/0.2'}});
  if(!response.ok)throw Error(mod.slug+': '+response.status);
  const data=Buffer.from(await response.arrayBuffer());
  for(const [kind,expected]of Object.entries(mod.hashes))if(createHash(kind).update(data).digest('hex')!==expected)throw Error('Checksum mismatch: '+mod.slug);
  await writeFile(dir+'/mods/'+mod.filename,data);
  files.push({path:'mods/'+mod.filename,hashes:mod.hashes,env:{client:mod.client,server:mod.server},downloads:[mod.url],fileSize:mod.size});
}
await mkdir(dir+'/overrides/mods',{recursive:true});await mkdir(dir+'/overrides/config',{recursive:true});
await copyFile(`build/libs/atlas-1.21.1-${version}.jar`,dir+`/overrides/mods/atlas-1.21.1-${version}.jar`);
await copyFile('pack/overrides/config/atlas-client.json',dir+'/overrides/config/atlas-client.json');
await copyFile('pack/README.md',dir+'/overrides/ATLAS-START-HERE.md');
await mkdir(dir+'/overrides/docs',{recursive:true});
for(const file of await readdir('docs'))if(file.endsWith('.md')||file==='mod-candidates.json')await copyFile('docs/'+file,dir+'/overrides/docs/'+file);
await copyFile('THIRD_PARTY_NOTICES.md',dir+'/overrides/THIRD_PARTY_NOTICES.md');
await writeFile(dir+'/modrinth.index.json',JSON.stringify({formatVersion:1,game:'minecraft',versionId:version,name:'Atlas: Light & Polarity',summary:'Magnetic Fields, the Warden, Resonant Vaults and an intentionally small performance/recipe pack.',files,dependencies:{minecraft:lock.minecraft,'fabric-loader':lock.fabricLoader}},null,2));
await mkdir('dist',{recursive:true});
const curseforge=JSON.parse(await readFile('pack/curseforge-files.json','utf8'));
for(const f of curseforge) {
  const pinned=lock.mods.find(m=>m.filename===f.filename);
  if(!pinned||pinned.hashes.sha1!==f.hashes.find(h=>h.type===1)?.value)throw Error('CurseForge pin differs from tested artifact: '+f.filename);
}
await writeFile(dir+'/manifest.json',JSON.stringify({minecraft:{version:lock.minecraft,modLoaders:[{id:'fabric-'+lock.fabricLoader,primary:true}],recommendedRam:4096},manifestType:'minecraftModpack',manifestVersion:1,name:'Atlas - Light and Polarity',version,author:'Logan Reddell',files:curseforge.map(f=>({projectID:f.projectID,fileID:f.fileID,required:true})),overrides:'overrides'},null,2));
execFileSync('python',['-c',`from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path('build/pack')
with ZipFile('dist/atlas-fabric-${version}.mrpack','w',ZIP_DEFLATED) as z:
 z.write(root/'modrinth.index.json','modrinth.index.json')
 for f in (root/'overrides').rglob('*'):
  if f.is_file() and (f.suffix!='.jar' or f.name=='atlas-1.21.1-${version}.jar'): z.write(f,f.relative_to(root).as_posix())
with ZipFile('dist/atlas-curseforge-${version}.zip','w',ZIP_DEFLATED) as z:
 z.write(root/'manifest.json','manifest.json')
 for f in (root/'overrides').rglob('*'):
  if f.is_file() and (f.suffix!='.jar' or f.name=='atlas-1.21.1-${version}.jar'): z.write(f,f.relative_to(root).as_posix())
`]);
console.log(`Created dist/atlas-curseforge-${version}.zip and dist/atlas-fabric-${version}.mrpack; ${files.length} pinned external mods verified.`);
