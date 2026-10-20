/** Create only a new Atlas profile; never edits another CurseForge profile or its saves. */
import {readFile,writeFile,mkdir,copyFile,readdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const name='Atlas - Light and Polarity';
const root=resolve(process.argv[2]??join(homedir(),'curseforge/minecraft/Instances',name));
const marker=join(root,'.atlas-curseforge.json');
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
if(await exists(root)&&!await exists(marker))throw Error('Refusing to change an existing unmarked profile: '+root);
await mkdir(root,{recursive:true});
let guid=await exists(marker)?JSON.parse(await readFile(marker,'utf8')).guid:randomUUID();
await writeFile(marker,JSON.stringify({guid,name},null,2));
// setup-instance confines all runtime downloads to the new profile as well.
// Its separate ownership stamp allows interrupted setup to resume safely.
if(!await exists(join(root,'.atlas-instance.json')))await writeFile(join(root,'.atlas-instance.json'),'{}');
execFileSync(process.execPath,['tools/setup-instance.mjs','--dir',root],{stdio:'inherit'});
const loader=await(await fetch('https://meta.fabricmc.net/v2/versions/loader/1.21.1/0.16.14/profile/json')).json();
const version=(await readFile('gradle.properties','utf8')).match(/^mod_version=(.+)$/m)[1].trim();
const files=JSON.parse(await readFile('pack/curseforge-files.json','utf8')).map(f=>({projectID:f.projectID,fileID:f.fileID,required:true}));
const manifest={minecraft:{version:'1.21.1',modLoaders:[{id:'fabric-0.16.14',primary:true}],recommendedRam:4096},manifestType:'minecraftModpack',manifestVersion:1,name,version,author:'Logan Reddell',files,overrides:'overrides'};
const profile={baseModLoader:{forgeVersion:'0.16.14',name:'fabric-0.16.14-1.21.1',type:4,downloadUrl:'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.16.14/fabric-loader-0.16.14.jar',filename:'fabric-loader-0.16.14.jar',installMethod:4,latest:false,recommended:false,versionJson:JSON.stringify(loader),librariesInstallLocation:'{0}libraries/net/fabricmc/fabric-loader/0.16.14',minecraftVersion:'1.21.1'},isUnlocked:true,javaArgsOverride:null,lastPlayed:'0001-01-01T00:00:00',playedCount:0,timePlayed:0,manifest,fileDate:new Date().toISOString(),installedModpack:null,projectID:0,fileID:0,customAuthor:'Logan Reddell',modpackOverrides:[],isMemoryOverride:true,allocatedMemory:4096,memoryAllocatedType:1,profileImagePath:join(root,'atlas-icon.png'),groupId:null,isVanilla:false,guid,gameTypeID:432,installPath:root,name,cachedScans:[],isValid:true,isEnabled:true,gameVersion:'1.21.1',gameVersionFlavor:null,gameVersionTypeId:null,preferenceAlternateFile:false,preferenceAutoInstallUpdates:false,preferenceDeleteOrphanedDependencies:false,preferenceDeleteSavedVariables:false,preferenceReleaseType:1,preferenceModdingFolderPath:null,installDate:new Date().toISOString(),installedAddons:[],installedGamePrerequisites:[],wasNameManuallyChanged:true,wasGameVersionTypeIdManuallyChanged:false};
// Preserve CurseForge's own metadata once it has adopted the profile.
if(!await exists(join(root,'minecraftinstance.json')))await writeFile(join(root,'minecraftinstance.json'),JSON.stringify(profile,null,2));
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
await copyFile('build/generated/atlas/assets/atlas/icon.png',join(root,'atlas-icon.png'));
await mkdir(join(root,'config'),{recursive:true});
if(!await exists(join(root,'config/atlas-client.json')))await copyFile('pack/overrides/config/atlas-client.json',join(root,'config/atlas-client.json'));
for(const file of await readdir('build/pack/mods'))if(file.endsWith('.jar'))await copyFile('build/pack/mods/'+file,join(root,'mods',file));
await copyFile('pack/README.md',join(root,'ATLAS-START-HERE.md'));
console.log(JSON.stringify({profile:root,guid,launchUrl:`curseforge://launch-game?instanceId=${guid}&gameId=432`},null,2));
