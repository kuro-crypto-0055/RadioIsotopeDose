import {rows,facilitySheetLabel} from './model.js';
export const SESSION_LIMIT=50;
// Delete the oldest created measurement rounds, regardless of sync state.
export function retainRecent(state,limit=SESSION_LIMIT){
 if(!Number.isInteger(limit)||limit<1)throw Error('Invalid retention limit');
 const sorted=state.sessions.map((session,index)=>({session,index})).sort((a,b)=>Date.parse(a.session.createdAt)-Date.parse(b.session.createdAt)||a.index-b.index);
 const removed=sorted.slice(0,Math.max(0,sorted.length-limit)).map(x=>x.session.id),ids=new Set(removed);
 state.sessions=state.sessions.filter(s=>!ids.has(s.id));
 if(!state.sessions.some(s=>s.id===state.active))state.active=sorted.filter(x=>!ids.has(x.session.id)).at(-1)?.session.id||null;
 return removed;
}
export async function syncSnapshot(session,pack){
 const values=[['測定地点番号','図面名','線量','測定日時'],...rows(session,pack).map(r=>[r[0],r[1],r[2]===''?'':Number(r[2]),r[3]])];
 const content={version:1,id:session.id,name:session.name,createdAt:session.createdAt,values};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(content)));
 const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 const date=new Date(Date.parse(session.createdAt)+9*60*60*1000).toISOString().slice(0,10);
 return {...content,hash,title:date+' '+facilitySheetLabel(pack).replace(/[\\/:?*\[\]\x00-\x1f]/g,'_').trim().slice(0,40)};
}
export function availableTitle(base,sheets){const titles=new Set(sheets.map(s=>s.properties.title));let title=base,n=2;while(titles.has(title))title=`${base} (${n++})`;return title;}
export function snapshotSheet(sheets,snapshot){return sheets.find(s=>s.developerMetadata?.some(m=>m.metadataKey==='ri_note_snapshot'&&m.metadataValue===snapshot.hash)||s.properties.title.startsWith('RI_')&&s.properties.title.endsWith('_'+snapshot.hash))?.properties;}
export function snapshotMetadata(snapshot,sheetId){return {createDeveloperMetadata:{developerMetadata:{metadataKey:'ri_note_snapshot',metadataValue:snapshot.hash,location:{sheetId},visibility:'DOCUMENT'}}};}
export function sheetIdFromURL(value){
 const s=value.trim();if(/^[A-Za-z0-9_-]{20,100}$/.test(s))return s;
 let u;try{u=new URL(s);}catch{throw Error('GoogleスプレッドシートのURLを入力してください。');}
 const match=u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/);
 if(u.protocol!=='https:'||u.hostname!=='docs.google.com'||!match)throw Error('GoogleスプレッドシートのURLを入力してください。');return match[1];
}
export function sameValues(actual,expected){return expected.every((row,i)=>row.every((v,j)=>(actual[i]?.[j]??'')===v))&&actual.slice(expected.length).every(row=>row.every(v=>v===''));}
export function createSheetBatch(snapshot,sheetId){
 const cells=snapshot.values.map(row=>({values:row.map(value=>value===''?{}:{userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}})}));
 return {requests:[
 {addSheet:{properties:{sheetId,title:snapshot.title,gridProperties:{rowCount:Math.max(100,snapshot.values.length),columnCount:4,frozenRowCount:1}}}},
 {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:cells,fields:'userEnteredValue'}},
 {repeatCell:{range:{sheetId,startRowIndex:1,startColumnIndex:2,endColumnIndex:3},cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'0.00'}}},fields:'userEnteredFormat.numberFormat'}},
 {autoResizeDimensions:{dimensions:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:4}}},
 snapshotMetadata(snapshot,sheetId)
 ]};
}
