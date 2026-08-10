const fs=require('fs'),path=require('path'),vm=require('vm');
const PLAT='C:/Projet/jdr créateur de carte/plateforme',OUT=process.env.CLAUDE_JOB_DIR+'/tmp';
const ctx=vm.createContext({console,JSON,Math,Date,Object,Array,String,Number,Boolean,Error,RegExp,parseInt,parseFloat,isNaN});
ctx.window=ctx;ctx.globalThis=ctx;ctx.KJ={};
for (const f of ['js/modele.js','js/rendu.js']) vm.runInContext(fs.readFileSync(path.join(PLAT,f),'utf8'),ctx,{filename:f});
const M=ctx.KJ.modele,R=ctx.KJ.rendu;
const c=JSON.parse(fs.readFileSync(OUT+'/cathay-ville-moyenne.json','utf8'));
const CEL=c.grille.cell;
let ko=0;const ok=(x,n,i)=>{console.log((x?'  OK   ':'  ECHEC')+' '+n+(x?'':'  -> '+i));if(!x)ko++};

console.log('===== '+c.nom+' =====');
ok(c.campagne==='Roland','campagne Roland',c.campagne);
ok(c.id==='cathay-ville-moyenne','id attendu par le portail de la vue d ensemble',c.id);

console.log('\n— Ce qui a ete demande —');
const noms=c.elements.filter(e=>e.type==='piece'&&e.nom).map(e=>e.nom);
ok(noms.some(n=>/Auberge/.test(n)),'une auberge',noms.join(' / '));
ok(noms.some(n=>/Église de Carel/.test(n)),'une eglise appartenant a Carel',noms.join(' / '));
ok(noms.some(n=>/Presbytère/.test(n)),'le logis de Carel a cote de son eglise','absent');
const boutiques=noms.filter(n=>/Tailleur|Mercerie|Chandelier|Cordonnier|Libraire/.test(n));
ok(boutiques.length>=4,'plusieurs boutiques',boutiques.join(', '));
const anon=c.elements.filter(e=>e.type==='piece'&&!e.nom&&e.forme!=='rond'&&!e.sol);
ok(anon.length>=12,'des habitations en nombre',anon.length+' habitations');

console.log('\n— L eglise : taille et composition —');
const nef=c.elements.find(e=>/Église/.test(e.nom||''));
const cases=(nef.w/CEL)+' x '+(nef.h/CEL);
ok(nef.w/CEL>=8&&nef.h/CEL>=12,'nef de taille moyenne/grande',cases+' cases');
const surf=(nef.w/CEL)*(nef.h/CEL)*c.grille.metres*c.grille.metres;
console.log('       nef : '+cases+' cases, soit '+Math.round(nef.w/CEL*c.grille.metres)+' x '
  +Math.round(nef.h/CEL*c.grille.metres)+' m ('+Math.round(surf)+' m2) — la plus grande batisse du quartier');
const plusGrande=c.elements.filter(e=>e.type==='piece').sort((a,b)=>b.w*b.h-a.w*a.h)[0];
ok(plusGrande===nef,'l eglise domine bien le quartier',(plusGrande.nom||'sans nom')+' est plus grande');
// les volumes de l eglise doivent se TOUCHER sans se chevaucher
const rects=c.elements.filter(e=>e.type==='piece'&&e.forme!=='rond');
const chev=[];
for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];
 if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)chev.push((a.nom||'?')+'/'+(b.nom||'?'));}
ok(!chev.length,'aucun batiment ne chevauche un autre (y compris la croix de l eglise)',chev.join(' | '));

console.log('\n— Rues : la signature du quartier —');
const voies=c.elements.filter(e=>e.type==='voie');
const larges=voies.filter(e=>e.l/CEL>=2);
ok(larges.length>=3,'des rues larges (>=2 cases), contrairement a la Ville basse',larges.length);
ok(!voies.some(e=>e.l/CEL<1.4),'aucune ruelle d une seule case ici',
  voies.filter(e=>e.l/CEL<1.4).map(e=>(e.l/CEL)).join(','));
ok(voies.some(e=>Math.max(e.y1,e.y2)>=c.taille.h-CEL),'une rue rejoint le bord sud (vers le Marche)','aucune');

console.log('\n— Portes, portails, cle —');
const portes=c.elements.filter(e=>e.type==='porte');
const surMur=(p)=>c.elements.some(e=>e.type==='piece'&&e.forme!=='rond'&&(p.o==='h'
  ? (Math.abs(p.y-e.y)<8||Math.abs(p.y-(e.y+e.h))<8)&&p.x>e.x&&p.x<e.x+e.w
  : (Math.abs(p.x-e.x)<8||Math.abs(p.x-(e.x+e.w))<8)&&p.y>e.y&&p.y<e.y+e.h));
const orph=portes.filter(p=>!surMur(p));
ok(!orph.length,'chaque porte est posee sur un mur',orph.map(p=>p.x+','+p.y).join(' '));
const pts=c.elements.filter(e=>e.type==='portail');
ok(pts.length>=1&&pts.every(p=>p.vers==='cathay-marche'),'un portail vers la Place du Marche',
  pts.map(p=>p.label+'->'+p.vers).join(' '));
const nums=c.elements.filter(e=>e.type==='numero').map(e=>e.num).sort((a,b)=>a-b);
ok(nums.length===c.cle.length&&new Set(nums).size===nums.length,'cle coherente',nums.join(','));
ok(c.cle.every(k=>k.titre&&k.desc&&k.desc.length>80),'chaque entree de cle est etoffee',
  c.cle.filter(k=>k.desc.length<=80).map(k=>k.num).join(','));

console.log('\n— Rendu —');
for (const v of [true,false]) { let s='';try{s=R.svgString(c,{grain:false,vueMJ:v,grille:true,ids:true});}catch(e){s='ERR '+e.message}
  ok(s.startsWith('<svg')&&s.endsWith('</svg>')&&!/undefined|NaN/.test(s),'rendu '+(v?'MJ':'joueurs')+' sain',s.slice(0,100)); }
ok(!c.elements.some(e=>e.sym==='tapis'),'pas de tapis (son style sort en rouge vif)','tapis present');
ok(!c.elements.some(e=>e.type==='lumiere'),'aucun element « Lumiere » (il se dessine comme un portail)','lumiere presente');
const parType={};for(const e of c.elements)parType[e.type]=(parType[e.type]||0)+1;
console.log('\n       '+Object.entries(parType).map(([k,v])=>k+'×'+v).join(', '));
console.log(ko?'\n'+ko+' ECHEC':'\nLa Ville moyenne est conforme.');process.exit(ko?1:0);
