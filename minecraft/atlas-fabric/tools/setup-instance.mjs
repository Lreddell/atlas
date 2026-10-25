/** Assemble a normal, isolated Windows Minecraft client from official artifacts.
 * Never edits .minecraft, launcher profiles, accounts, or existing saves. */
import {readFile,writeFile,mkdir,copyFile,access,readdir,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {homedir,release} from 'node:os';
import {createHash} from 'node:crypto';

const options=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>v.startsWith('--')?[...a,[v.slice(2),all[i+1]]]:a,[]));
const game=resolve(options.dir??join(homedir(),'Games','Atlas Fabric 1.21.1'));
const ordinary=resolve(homedir(),'AppData/Roaming/.minecraft');
if(game.toLowerCase()===ordinary.toLowerCase()||game.toLowerCase().startsWith(ordinary.toLowerCase()+'/')||game.toLowerCase().startsWith(ordinary.toLowerCase()+'\\'))throw Error('Choose a game directory outside your normal Minecraft installation.');
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
if(await exists(game)&&!await exists(join(game,'.atlas-instance.json'))&&(await readdir(game)).length)throw Error('Refusing to use a non-empty unmarked directory.');
const previous=await exists(join(game,'.atlas-instance.json'))?JSON.parse(await readFile(join(game,'.atlas-instance.json'),'utf8')):{};
await mkdir(game,{recursive:true});
await writeFile(join(game,'.atlas-instance.json'),JSON.stringify({...previous,setup:true,minecraft:'1.21.1'}));
const headers={'User-Agent':'Atlas-Fabric-Isolated-Client/0.2'};
const get=async url=>{const r=await fetch(url,{headers});if(!r.ok)throw Error(url+': '+r.status);return r;};
const json=async url=>(await get(url)).json();
const manifest=await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
const mc=await json(manifest.versions.find(v=>v.id==='1.21.1').url);
const loader=await json('https://meta.fabricmc.net/v2/versions/loader/1.21.1/0.16.14/profile/json');
const hash=(b,kind='sha1')=>createHash(kind).update(b).digest('hex');
async function artifact(target,url,sha1,cache){
 if(await exists(target)&&(!sha1||hash(await readFile(target))===sha1))return;
 await mkdir(dirname(target),{recursive:true});
 if(cache&&await exists(cache)&&(!sha1||hash(await readFile(cache))===sha1)){await copyFile(cache,target);return;}
 const data=Buffer.from(await(await get(url)).arrayBuffer());if(sha1&&hash(data)!==sha1)throw Error('Checksum mismatch: '+url);await writeFile(target,data);
}
function allowed(library){if(!library.rules)return true;let allow=false;for(const rule of library.rules){if(rule.os?.name&&rule.os.name!=='windows')continue;if(rule.os?.arch&&!new RegExp(rule.os.arch).test('amd64'))continue;if(rule.os?.version&&!new RegExp(rule.os.version).test(release()))continue;if(rule.features)continue;allow=rule.action==='allow';}return allow;}
const jobs=[],classpath=[];
for(const lib of [...mc.libraries.filter(allowed),...loader.libraries]){
 const parts=lib.name.split(':'),path=lib.downloads?.artifact?.path??parts[0].replaceAll('.','/')+'/'+parts[1]+'/'+parts[2]+'/'+parts[1]+'-'+parts[2]+(parts[3]?'-'+parts[3]:'')+'.jar';
 const file=join(game,'libraries',path);if(classpath.includes(file))continue;classpath.push(file);
 jobs.push(()=>artifact(file,lib.downloads?.artifact?.url??(lib.url??'https://libraries.minecraft.net/')+path,lib.downloads?.artifact?.sha1,join(ordinary,'libraries',path)));
 if(lib.natives?.windows&&lib.downloads?.classifiers){const key=lib.natives.windows.replace('${arch}','64'),n=lib.downloads.classifiers[key];if(n){const f=join(game,'libraries',n.path);classpath.push(f);jobs.push(()=>artifact(f,n.url,n.sha1,join(ordinary,'libraries',n.path)));}}
}
const client=join(game,'versions/1.21.1/1.21.1.jar');classpath.push(client);jobs.push(()=>artifact(client,mc.downloads.client.url,mc.downloads.client.sha1,join(ordinary,'versions/1.21.1/1.21.1.jar')));
async function parallel(tasks,count=8){let next=0;await Promise.all(Array.from({length:count},async()=>{while(next<tasks.length){const i=next++;await tasks[i]();}}));}
await parallel(jobs);console.log('Minecraft and Fabric libraries verified: '+jobs.length);
const index=await json(mc.assetIndex.url),assetJobs=[];
// Use read-only local caches first; downloads remain confined to this instance.
for(const {hash:h}of Object.values(index.objects)){const path=h.slice(0,2)+'/'+h;assetJobs.push(async()=>{const gradle=join(homedir(),'.gradle/caches/fabric-loom/assets/objects',path),normal=join(ordinary,'assets/objects',path);await artifact(join(game,'assets/objects',path),'https://resources.download.minecraft.net/'+path,h,await exists(gradle)?gradle:normal);});}
await parallel(assetJobs,16);await mkdir(join(game,'assets/indexes'),{recursive:true});await writeFile(join(game,'assets/indexes',mc.assetIndex.id+'.json'),JSON.stringify(index));
await mkdir(join(game,'mods'),{recursive:true});const jar=resolve(options.jar??`build/libs/atlas-1.21.1-${(await readFile('gradle.properties','utf8')).match(/^mod_version=(.+)$/m)[1].trim()}.jar`);const jarName=jar.split(/[\\/]/).at(-1);await copyFile(jar,join(game,'mods',jarName));
if(previous.jar&&previous.jar!==jarName&&/^atlas-1\.21\.1-[\w.-]+\.jar$/.test(previous.jar)) {
  const old=resolve(game,'mods',previous.jar);
  if(dirname(old)===resolve(game,'mods')&&await exists(old)&&hash(await readFile(old),'sha256')===previous.sha256)await unlink(old);
}
const java=resolve(options.java??join(homedir(),'.codex/tools/atlas-fabric/jdk-21.0.12.1+1/bin/javaw.exe'));
const name='AtlasExplorer',md5=createHash('md5').update('OfflinePlayer:'+name).digest();md5[6]=(md5[6]&15)|48;md5[8]=(md5[8]&63)|128;
const args=['-Xms512M','-Xmx4G','-Djava.library.path='+join(game,'natives'),'-Dorg.lwjgl.system.SharedLibraryExtractPath='+join(game,'natives'),'-Dfile.encoding=UTF-8','-cp',classpath.join(';'),loader.mainClass,'--username',name,'--uuid',md5.toString('hex'),'--accessToken','0','--userType','legacy','--version',loader.id,'--versionType','release','--gameDir',game,'--assetsDir',join(game,'assets'),'--assetIndex',mc.assetIndex.id,'--width','1440','--height','900'];
await writeFile(join(game,'launch.args'),args.map(a=>JSON.stringify(a.replaceAll('\\','/'))).join('\n'));
await writeFile(join(game,'Start Atlas Fabric.ps1'),`$ErrorActionPreference='Stop'\nSet-Location -LiteralPath $PSScriptRoot\n$atlasArguments='@"'+(Join-Path $PSScriptRoot 'launch.args')+'"'\n$atlasClient=Start-Process -FilePath '${java.replaceAll("'","''")}' -ArgumentList $atlasArguments -WorkingDirectory $PSScriptRoot -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'client-stdout.log') -RedirectStandardError (Join-Path $PSScriptRoot 'client-stderr.log')\n$atlasClient.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'client.pid')\n`);
await writeFile(join(game,'Start Atlas Fabric.bat'),'@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start Atlas Fabric.ps1"\r\n');
if(!await exists(join(game,'options.txt')))await writeFile(join(game,'options.txt'),'version:3955\nonboardAccessibility:false\nguiScale:2\nrenderDistance:12\nsimulationDistance:5\ntutorialStep:none\nmaxFps:120\npauseOnLostFocus:true\nsoundCategory_music:0.6\n');
await writeFile(join(game,'.atlas-instance.json'),JSON.stringify({minecraft:mc.id,loader:loader.id,normalInstallationUntouched:true,localProfile:name,jar:jar.split(/[\\/]/).at(-1),sha256:hash(await readFile(jar),'sha256')},null,2));
console.log('Isolated normal client ready: '+game);console.log('Start Atlas Fabric.bat starts the production client without any QA flags.');
