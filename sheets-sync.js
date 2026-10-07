import {createSheetBatch,sameValues} from './sync-model.js';
const SCOPE='https://www.googleapis.com/auth/spreadsheets';
let libraryPromise,token=null;
export function disconnectGoogle(){token=null;}
export function loadGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(libraryPromise)return libraryPromise;
 libraryPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();libraryPromise=null;reject(Error('Googleの読込がタイムアウトしました。通信を確認してください。'));},20000);script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();libraryPromise=null;reject(Error('Googleを読み込めません。通信または大学の利用制限を確認してください。'));};document.head.append(script);});return libraryPromise;
}
// Call directly inside a user click after loadGoogle resolves to preserve popup activation.
export function authorizeGoogle(clientId){
 return new Promise((resolve,reject)=>{if(!window.google?.accounts?.oauth2){reject(Error('先に「Google接続を準備」を押してください。'));return;}
 const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,include_granted_scopes:false,
 callback:response=>{if(response.error||!response.access_token||!google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){token=null;reject(Error('Googleのアクセス許可を取得できませんでした。'));return;}token={value:response.access_token,expires:Date.now()+Number(response.expires_in)*1000-60000};resolve();},
 error_callback:()=>{token=null;reject(Error('Googleログインが完了しませんでした。ポップアップの許可と大学アカウントの制限を確認してください。'));}});
 client.requestAccessToken({prompt:'select_account'});
 });
}
export function googleReady(){return !!token&&token.expires>Date.now();}
async function api(id,suffix,options={}){
 if(!googleReady())throw Error('Googleにログインし直してください。');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id)+suffix,{...options,headers:{Authorization:'Bearer '+token.value,'Content-Type':'application/json'},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
 if(!response.ok){const err=Error(response.status===401?'Googleにログインし直してください。':response.status===403?'編集権限・Sheets APIの有効化・大学の利用制限を確認してください。':response.status===404?'同期先が見つかりません。URLと共有設定を確認してください。':response.status===429?'Googleの処理上限です。1分ほど待って再同期してください。':`Googleへの同期に失敗しました（${response.status}）。`);err.status=response.status;if(response.status===401)token=null;throw err;}return await response.json();
 }catch(e){if(e.name==='AbortError')throw Error('同期がタイムアウトしました。端末データは残っています。同じ操作で再同期できます。');throw e;}finally{clearTimeout(timer);}
}
export async function inspectSpreadsheet(id){return api(id,'?fields=spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(sheetId,title))');}
async function verifySheet(id,sheet,snapshot){const range="'"+sheet.title.replaceAll("'","''")+"'!A:D";const result=await api(id,'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE');if(!sameValues(result.values||[],snapshot.values))throw Error('同期済みの表がGoogle側で変更されています。元の表を上書きせず停止しました。');return {sheetId:sheet.sheetId,title:sheet.title};}
// Immutable snapshots: exact retries reuse a tab; edits create another tab, never overwrite cloud data.
export async function uploadSnapshot(id,snapshot){
 let meta=await inspectSpreadsheet(id),existing=meta.sheets?.map(s=>s.properties).find(s=>s.title===snapshot.title);
 if(existing)return verifySheet(id,existing,snapshot);
 const used=new Set(meta.sheets?.map(s=>s.properties.sheetId)||[]);let sheetId;do{sheetId=crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;}while(used.has(sheetId));
 try{await api(id,':batchUpdate',{method:'POST',body:JSON.stringify(createSheetBatch(snapshot,sheetId))});}
 catch(error){if(error.status!==400)throw error;meta=await inspectSpreadsheet(id);existing=meta.sheets?.map(s=>s.properties).find(s=>s.title===snapshot.title);if(!existing)throw error;return verifySheet(id,existing,snapshot);}
 return verifySheet(id,{sheetId,title:snapshot.title},snapshot);
}
