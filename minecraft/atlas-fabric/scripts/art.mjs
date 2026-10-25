import {createCanvas} from '@napi-rs/canvas';
import {resolve} from 'node:path';

/** New Minecraft-density material sheets and articulated voxel models. */
export async function createMinecraftArt(atlas,asset,put){
 for(const entity of ['magnetic_warden','bell_titan','vault_guard','vault_marksman','bell_hound','tollkeeper','lodestone_mite'])await put(resolve(asset,`models/item/${entity}_spawn_egg.json`),{parent:'minecraft:item/template_spawn_egg'});
 const element=(from,to,texture='#all')=>({from,to,faces:Object.fromEntries(['north','south','east','west','up','down'].map(f=>[f,{texture}]))});
 for(const[name,elements]of Object.entries({
  resonance_pylon:[element([0,0,0],[16,4,16]),element([3,4,3],[13,13,13]),element([1,13,1],[15,16,15])],
  magnetic_boss_summoner:[element([0,0,0],[16,4,16]),element([2,4,2],[14,6,14]),element([5,6,5],[11,14,11]),element([3,13,3],[13,15,13])],
  resonance_plate:[element([1,0,1],[15,2,15])],
  magnetic_shield_crystal:[element([5,0,5],[11,4,11]),element([3,4,3],[13,11,13]),element([5,11,5],[11,16,11])],
  sentinel_core:[element([0,0,0],[16,3,16]),element([1,3,1],[4,13,4]),element([12,3,1],[15,13,4]),element([1,3,12],[4,13,15]),element([12,3,12],[15,13,15]),element([0,13,0],[16,16,16]),element([5,5,5],[11,11,11])]
 }))await put(resolve(asset,`models/block/${name}.json`),{textures:{all:`atlas:block/${name}`,particle:`atlas:block/${name}`},elements});
 await put(resolve(asset,'models/block/magnetic_shield_crystal_dormant.json'),{parent:'atlas:block/magnetic_shield_crystal',textures:{all:'atlas:block/chiseled_magnetite',particle:'atlas:block/chiseled_magnetite'}});
 await put(resolve(asset,'blockstates/magnetic_shield_crystal.json'),{variants:{'active=false':{model:'atlas:block/magnetic_shield_crystal_dormant'},'active=true':{model:'atlas:block/magnetic_shield_crystal'}}});
 const reed=createCanvas(16,16), rc=reed.getContext('2d');
 for(const [x,height] of [[4,11],[8,14],[11,9]]) {
  rc.fillStyle='#48534c';rc.fillRect(x,16-height,1,height);rc.fillStyle='#82938a';rc.fillRect(x+1,16-height,1,height-1);
  for(let y=17-height;y<14;y+=3){rc.fillStyle='#aab6ac';rc.fillRect(x-2,y,2,1);rc.fillRect(x+2,y+1,2,1);}
  rc.fillStyle='#b8bcb2';rc.fillRect(x-1,16-height,3,2);rc.fillStyle=x===4?'#a66e67':x===11?'#6b889f':'#c7c6ad';rc.fillRect(x,15-height,1,2);
 }
 await put(resolve(asset,'textures/block/ferric_reed.png'),reed.toBuffer('image/png'));
 await put(resolve(asset,'blockstates/ferric_reed.json'),{variants:{'':{model:'atlas:block/ferric_reed'}}});
 await put(resolve(asset,'models/block/ferric_reed.json'),{parent:'minecraft:block/cross',textures:{cross:'atlas:block/ferric_reed'}});
 await put(resolve(asset,'models/item/ferric_reed.json'),{parent:'minecraft:item/generated',textures:{layer0:'atlas:block/ferric_reed'}});
 const colors=['#59615b','#343c3b','#a18751','#718b81','#77b7ac','#554f48','#b96660','#567ca6'];
 const materials={stone:0,dark_stone:1,darkStone:1,bronze:2,worn_bronze:2,bell:2,chain:1,core:4,accent:4,cloth:5,positive:6,negative:7};
 const sheet=createCanvas(1024,512),ctx=sheet.getContext('2d');
 for(let mat=0;mat<8;mat++){
  const ox=mat%4*256,oy=Math.floor(mat/4)*256,base=parseInt(colors[mat].slice(1),16);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const grain=((Math.imul(x+19,374761393)^Math.imul(y+37,668265263)^mat*719)>>>4)%11-5;let r=(base>>16)+grain,g=((base>>8)&255)+grain,b=(base&255)+grain;
   if((y%16===0&&x%16>1)||(x%16===0&&y%16>1)){r-=15;g-=15;b-=15;}if((x%16===3||x%16===12)&&(y%16===3||y%16===12)&&mat===2){r+=25;g+=20;b+=14;}
   ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(ox+x,oy+y,1,1);
  }
 }
 await put(resolve(asset,'textures/entity/atlas_materials.png'),sheet.toBuffer('image/png'));
 const glow=createCanvas(1024,512),gl=glow.getContext('2d');gl.drawImage(sheet,0,256,256,256,0,256,256,256);await put(resolve(asset,'textures/entity/atlas_glow.png'),glow.toBuffer('image/png'));
 const part=(id,size,position,material='stone',parent,extra={})=>({id,size,position,material,parent,...extra});
 const groups=[{id:'left_arm',position:[-1.86,4.1,0]},{id:'right_arm',position:[1.96,4.1,0]},{id:'left_leg',position:[-.72,1.8,0]},{id:'right_leg',position:[.72,1.8,0]},{id:'bell_bone',position:[0,3.8,1.16]}];
 const titan=atlas.BELL_TITAN_MODEL.parts.map(p=>{
  let bone=/^left_(shoulder|pauldron|upper_arm|elbow|hammer)/.test(p.name)?'left_arm':/^right_(shoulder|pauldron|upper_arm|elbow|hammer)/.test(p.name)?'right_arm':/^left_(thigh|knee|foot|heel)/.test(p.name)?'left_leg':/^right_(thigh|knee|foot|heel)/.test(p.name)?'right_leg':/^(hanging_bell|bell_(crown|lower|lip|corner|crack|clapper))/.test(p.name)?'bell_bone':null;
  const pivot=groups.find(g=>g.id===bone)?.position??[0,0,0];return part(p.name,p.size,p.position.map((v,i)=>v-pivot[i]),p.material,bone,{rotation:p.rotation,hiddenAtStage:p.hiddenAtStage});
 });
 await put(resolve(asset,'models/entity/bell_titan.json'),{groups,parts:titan,materials});
 const mg=[{id:'head_bone',position:[0,.3,.3]},
  ...['left_front','right_front','left_rear','right_rear'].map((id,i)=>({id,position:[i%2?.25:-.25,.16,i<2?.18:-.18]})),
  {id:'antenna_left',position:[-.12,.42,.34]},{id:'antenna_right',position:[.12,.42,.34]}];
 const mp=[part('body',[.5,.25,.54],[0,.27,0],'dark_stone'),part('positive_plate',[.48,.12,.5],[0,.44,-.04],'positive'),
  part('negative_plate',[.48,.12,.5],[0,.44,-.04],'negative'),part('spine',[.06,.15,.52],[0,.44,-.04],'bronze'),
  part('head',[.3,.2,.24],[0,0,0],'stone','head_bone'),part('eyes',[.24,.06,.05],[0,.02,.14],'core','head_bone')];
 for(const bone of ['left_front','right_front','left_rear','right_rear'])mp.push(part(bone+'_foot',[.22,.1,.14],[bone.startsWith('left')?-.08:.08,-.06,0],'bronze',bone));
 for(const side of ['left','right'])mp.push(part(side+'_stem',[.05,.22,.05],[0,.1,0],'dark_stone','antenna_'+side),part(side+'_tip',[.09,.08,.09],[0,.24,0],side==='left'?'positive':'negative','antenna_'+side));
 await put(resolve(asset,'models/entity/lodestone_mite.json'),{groups:mg,parts:mp,materials});
 const wg=[{id:'head_bone',position:[0,4.85,0]},{id:'left_arm',position:[-1.55,3.75,0]},{id:'right_arm',position:[1.55,3.75,0]},{id:'left_leg',position:[-.65,1.75,0]},{id:'right_leg',position:[.65,1.75,0]},...Array.from({length:4},(_,i)=>({id:'orbit_'+i,position:[0,3.1,0]}))];
 const wp=[
  part('waist',[1.4,.5,.95],[0,1.8,0],'dark_stone'),part('chest',[1.9,1.65,1.1],[0,2.95,0]),part('chest_band',[2.02,.23,1.25],[0,3.55,0],'bronze'),part('lower_band',[1.7,.2,1.16],[0,2.15,0],'dark_stone'),
  part('core',[.75,.85,.42],[0,3.05,.69],'core'),part('core_frame_left',[.2,1.2,.3],[-.58,3.05,.65],'dark_stone'),part('core_frame_right',[.2,1.2,.3],[.58,3.05,.65],'dark_stone'),
  part('head',[1.05,.85,1.03],[0,0,0],'stone','head_bone'),part('visor',[1.12,.19,.17],[0,.06,.58],'core','head_bone'),part('brow',[1.26,.25,1.16],[0,.37,0],'dark_stone','head_bone'),
  part('crown_left',[.24,.7,.3],[-.52,.73,0],'positive','head_bone'),part('crown_right',[.24,.7,.3],[.52,.73,0],'negative','head_bone'),part('neck',[.6,.5,.65],[0,4.1,0],'bronze')
 ];
 for(const [side,sign]of [['left',-1],['right',1]]){
  wp.push(part(side+'_shoulder',[1.05,.83,1.2],[0,-.1,0],side==='left'?'positive':'negative',side+'_arm'),part(side+'_upper_arm',[.6,1.3,.63],[0,-.8,0],'dark_stone',side+'_arm'),part(side+'_hand',[.92,.85,.92],[0,-1.75,.14],'stone',side+'_arm'),part(side+'_hand_band',[1,.17,1],[0,-1.5,.14],'bronze',side+'_arm'),part(side+'_thigh',[.68,1.28,.75],[0,-.55,0],'stone',side+'_leg'),part(side+'_knee',[.82,.35,.9],[0,-1,.08],'bronze',side+'_leg'),part(side+'_foot',[.9,.48,1.2],[0,-1.5,.17],'dark_stone',side+'_leg'));
 }
 for(let i=0;i<4;i++)wp.push(part('shard_'+i,[.45,1.3,.48],[2.8,0,0],i%2?'negative':'positive','orbit_'+i,{rotation:[0,0,.2]}));
 await put(resolve(asset,'models/entity/magnetic_warden.json'),{groups:wg,parts:wp,materials});
 for(const[kind,model]of Object.entries(atlas.VAULT_ENEMY_MODELS)){
  const parts=model.parts.map(p=>({...p,size:p.shape==='cylinder'?[Math.max(p.size[0],p.size[1])*2,p.size[2],Math.max(p.size[0],p.size[1])*2]:p.size}));
  const head=parts.find(p=>p.id==='head');const groups=[];if(head){const hp=[...head.position];groups.push({id:'head_bone',position:hp});for(const p of parts)if(!p.parent&&['head','helmetBrow','hood','faceSlit','headCrown'].includes(p.id)){p.parent='head_bone';p.position=p.position.map((v,i)=>v-hp[i]);}}
  await put(resolve(asset,`models/entity/${kind}.json`),{groups,parts,materials,scale:model.visualScale});
 }
 for(const layer of [1,2]){
  const armor=createCanvas(64,32),a=armor.getContext('2d');a.fillStyle='#a76d49';a.fillRect(0,0,64,32);for(let y=0;y<32;y++)for(let x=0;x<64;x++){if((x%8===0)||(y%8===0)){a.fillStyle='#634a3b';a.fillRect(x,y,1,1);}if(x%8===2&&y%8===2){a.fillStyle='#c99865';a.fillRect(x,y,1,1);}}await put(resolve(asset,`textures/models/armor/copper_layer_${layer}.png`),armor.toBuffer('image/png'));
 }
 const icons=createCanvas(128,128),i=icons.getContext('2d');i.fillStyle='#272f31';i.fillRect(0,0,128,128);i.fillStyle='#b96660';i.fillRect(20,28,28,72);i.fillRect(20,12,88,28);i.fillStyle='#567ca6';i.fillRect(80,28,28,72);i.fillStyle='#a18751';i.fillRect(16,96,36,16);i.fillRect(76,96,36,16);await put(resolve(asset,'icon.png'),icons.toBuffer('image/png'));
}
