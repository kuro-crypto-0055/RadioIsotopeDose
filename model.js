const fail=message=>{throw Error(message);};
const text=(s,max=200)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const id=n=>Number.isSafeInteger(n)&&n>0&&n<=999999;
export function validatePackage(raw){
 if(raw?.format!=='ri-note-plans'||![1,2].includes(raw.version)||!text(raw.title)||!Array.isArray(raw.plans)||!raw.plans.length||raw.plans.length>50)fail('図面セットの形式が異なります。');
 if(raw.version===2&&(!text(raw.facility,60)||!text(raw.sheetLabel,40)))fail('施設名が不正です。');
 const pointId=n=>id(n)||(raw.version===2&&typeof n==='string'&&/^[A-Z]{1,4}[1-9][0-9]{0,4}$/.test(n));
 const planIds=new Set(),pointIds=new Set();let size=0;
 const plans=raw.plans.map(p=>{
  if(!id(p.id)||planIds.has(p.id)||!text(p.name)||typeof p.subtitle!=='string'||p.subtitle.length>200||!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<1||p.height<1||p.width>30000||p.height>30000)fail('図面情報が不正です。');planIds.add(p.id);
  if(!Array.isArray(p.crop)||p.crop.length!==4||!p.crop.every(Number.isFinite)||p.crop[0]<0||p.crop[1]<0||p.crop[2]<=0||p.crop[3]<=0||p.crop[0]+p.crop[2]>p.width+1||p.crop[1]+p.crop[3]>p.height+1)fail('図面の表示範囲が不正です。');
  if(typeof p.image!=='string'||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image)||p.image.length>12e6)fail('図面は埋め込みのJPEGまたはPNGにしてください。');size+=p.image.length;if(size>40e6)fail('図面セットが大きすぎます。');
  if(!Array.isArray(p.points)||p.points.length>1000||!Array.isArray(p.extras||[]))fail('測定点の形式が不正です。');
  const add=n=>{if(!pointId(n)||pointIds.has(String(n)))fail('測定地点番号が重複または不正です。');pointIds.add(String(n));};
  const points=p.points.map(t=>{if(!Array.isArray(t)||t.length!==3||!t.slice(1).every(Number.isFinite)||t[1]<p.crop[0]||t[1]>p.crop[0]+p.crop[2]||t[2]<p.crop[1]||t[2]>p.crop[1]+p.crop[3])fail('測定点の座標が不正です。');add(t[0]);return [...t];});
  const extras=(p.extras||[]).map(e=>{if(!text(e.label))fail('図面外の測定点名が不正です。');add(e.id);return {id:e.id,label:e.label};});
  const pointColors={};if(raw.version===2&&p.pointColors){for(const [key,color] of Object.entries(p.pointColors)){if(!points.some(t=>String(t[0])===key)||!/^#[0-9a-f]{6}$/i.test(color))fail('地点の色が不正です。');pointColors[key]=color;}}
  return {...(raw.version===2?{pointColors}:{}),id:p.id,name:p.name,subtitle:p.subtitle,width:p.width,height:p.height,crop:[...p.crop],points,extras,image:p.image};
 });
 if(!pointIds.size||pointIds.size>1000)fail('測定点は1〜1000個にしてください。');
 return {format:'ri-note-plans',version:raw.version,title:raw.title,...(raw.version===2?{facility:raw.facility,sheetLabel:raw.sheetLabel}:{}),plans};
}
export function facilityName(pack){return pack.facility||pack.title?.replace(/\s*線量測定図面\s*$/,'')||'施設';}
export function facilitySheetLabel(pack){return pack.sheetLabel||facilityName(pack);}
export function pointsOf(pack){return pack.plans.flatMap(p=>[...p.points.map(([id])=>({id,plan:p.id,name:`${p.name} ${p.subtitle}`.trim(),label:''})),...p.extras.map(e=>({id:e.id,plan:p.id,name:`${p.name}｜${e.label}`,label:e.label}))]).sort((a,b)=>typeof a.id==='number'&&typeof b.id==='number'?a.id-b.id:typeof a.id==='number'?-1:typeof b.id==='number'?1:String(a.id).localeCompare(String(b.id),'en',{numeric:true}));}
export async function packageId(pack){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(pack)));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function validDose(value){return /^\d{1,6}(\.\d{1,2})?$/.test(value)&&Number.isFinite(Number(value));}
export function formatTime(time){if(!time)return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(time)).replaceAll('-','/');}
export function rows(session,pack){return pointsOf(pack).map(p=>{const r=session.records[p.id];return [p.id,p.name,r?.status==='measured'?Number(r.value).toFixed(2):'',formatTime(r?.at)];});}
function cell(value){const s=String(value);return /^[=+\-@\t\r]/.test(s)?"'"+s:s;}
export function csv(session,pack){return '\uFEFF'+[['測定地点番号','図面名','線量','測定日時'],...rows(session,pack)].map(r=>r.map(v=>'"'+cell(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
export function column(session,pack){return rows(session,pack).map(r=>r[2]).join('\r\n')+'\r\n';}
export function stats(session,pack,ids=pointsOf(pack).map(p=>p.id)){const result={measured:0,skipped:0,unable:0,empty:0};ids.forEach(id=>result[session.records[id]?.status||'empty']++);return result;}
export function validateSession(s,pack){
 if(!s||!text(s.id)||!text(s.name)||!Number.isFinite(Date.parse(s.createdAt))||typeof s.packageId!=='string'||!s.records||Array.isArray(s.records)||typeof s.records!=='object')fail('測定回の形式が不正です。');
 const ids=new Set(pointsOf(pack).map(p=>String(p.id)));
 for(const [n,r] of Object.entries(s.records))if(!ids.has(n)||!r||!['measured','skipped','unable'].includes(r.status)||!Number.isFinite(Date.parse(r.at))||(r.status==='measured'&&(typeof r.value!=='string'||!validDose(r.value))))fail('測定記録が不正です。');
 return s;
}
export async function validateBackup(raw){
 if(raw?.format!=='ri-note-backup'||raw.version!==2||!Array.isArray(raw.packages)||!raw.packages.length||raw.packages.length>20||!Array.isArray(raw.sessions)||!raw.sessions.length||raw.sessions.length>1000)fail('試作02のバックアップを選んでください。');
 const packs=new Map();
 for(const item of raw.packages){const data=validatePackage(item.data),hash=await packageId(data);if(hash!==item.id||packs.has(hash))fail('図面セットの識別情報が一致しません。');packs.set(hash,data);}
 const sessionIds=new Set();
 for(const s of raw.sessions){if(!packs.has(s.packageId)||sessionIds.has(s.id))fail('測定回と図面の対応が不正です。');validateSession(s,packs.get(s.packageId));sessionIds.add(s.id);}
 return {packages:[...packs].map(([id,data])=>({id,data})),sessions:structuredClone(raw.sessions)};
}
