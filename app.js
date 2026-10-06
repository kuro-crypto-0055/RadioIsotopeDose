import {validatePackage,packageId,pointsOf,validDose,formatTime,rows,csv,column,stats,validateSession,validateBackup} from './model.js';
import {openDB,get,update} from './storage.js';
const $=s=>document.querySelector(s),labels={measured:'入力済み',skipped:'測定せず',unable:'測定不能',empty:'未入力'};
const dbName='ri-note-public-v2:'+new URL('./',location.href).pathname;
let db,state={version:2,active:null,sessions:[]},pack=null,points=[],currentPlan=null,zoom=1,editing=null,draft='',saving=false,pending=null,importing=false;
const session=()=>state.sessions.find(s=>s.id===state.active);
const newSession=(name,hash)=>({id:crypto.randomUUID(),name,packageId:hash,createdAt:new Date().toISOString(),records:{}});
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function error(message){$('#storage-alert').hidden=false;$('#storage-alert').textContent=message;}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
async function change(fn,packages=[]){if(!db)throw Error('端末保存を利用できません。');state=await update(db,fn,packages);}
async function activate(){
 const s=session();if(!s){pack=null;points=[];currentPlan=null;render();return;}
 const next=await get(db,'packages',s.packageId);if(!next)throw Error('対応する図面セットが端末にありません。バックアップを確認してください。');
 pack=validatePackage(next);validateSession(s,pack);points=pointsOf(pack);if(!pack.plans.some(p=>p.id===currentPlan))currentPlan=pack.plans[0].id;render();
}
function record(id){return session()?.records[id];}
function updateNetwork(){$('#network').textContent=navigator.onLine?'接続あり · 端末保存':'オフライン · 端末保存';$('#network').classList.toggle('offline',!navigator.onLine);}
function marker(id){const r=record(id),status=r?.status||'empty',b=el('button',`marker ${status}`,id);b.type='button';b.dataset.point=id;b.setAttribute('aria-label',`測定地点 ${id}、${labels[status]}${status==='measured'?'、'+r.value:''}`);if(status!=='empty')b.append(el('span','badge',status==='measured'?'✓':status==='skipped'?'せず':'不能'));b.onclick=()=>openEntry(id);return b;}
function render(){
 const ready=!!pack;$('#welcome').hidden=ready;$('#measurement-layout').hidden=!ready;$('#export-open').disabled=!ready;$('#new-session').disabled=!ready;
 if(!ready)return;
 $('#session-select').replaceChildren(...[...state.sessions].reverse().map(s=>{const o=el('option','',s.name);o.value=s.id;o.selected=s.id===state.active;return o;}));
 const total=points.length,s=stats(session(),pack),done=total-s.empty;
 $('#progress-count').replaceChildren(document.createTextNode(done),el('small','',` / ${total}`));$('#progress-bar').style.width=`${done/total*100}%`;$('#progress-detail').textContent=`数値 ${s.measured} · せず ${s.skipped} · 不能 ${s.unable} · 未入力 ${s.empty}`;$('#plan-count').textContent=`${pack.plans.length} PLANS`;$('#dataset-label').textContent=pack.title;
 $('#plan-nav').replaceChildren(...pack.plans.map((p,index)=>{
  const b=el('button','plan-item'+(p.id===currentPlan?' active':''));b.setAttribute('aria-current',p.id===currentPlan?'page':'false');
  const ids=points.filter(x=>x.plan===p.id).map(x=>x.id),desc=el('span');desc.append(el('strong','',p.name),el('small','',p.subtitle));b.append(el('span','index',String(index+1).padStart(2,'0')),desc,el('span','count',`${ids.length-stats(session(),pack,ids).empty}/${ids.length}`));
  b.onclick=()=>{currentPlan=p.id;zoom=1;render();$('#map-viewport').scrollTo(0,0);};return b;
 }));renderMap();
}
function fitMap(){if(!pack)return;const p=pack.plans.find(p=>p.id===currentPlan),vp=$('#map-viewport'),stage=$('#map-stage'),fit=Math.min(vp.clientWidth/p.crop[2],vp.clientHeight/p.crop[3]);stage.style.width=`${Math.max(1,p.crop[2]*fit*zoom-.5)}px`;stage.style.height=`${p.crop[3]*fit*zoom}px`;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;$('#zoom-out').disabled=zoom<=1;$('#zoom-in').disabled=zoom>=4;}
function renderMap(){
 const p=pack.plans.find(p=>p.id===currentPlan),[x,y,w,h]=p.crop;$('#plan-title').textContent=p.name;$('#plan-eyebrow').textContent=p.subtitle;
 const img=$('#plan-image');if(img.dataset.plan!==String(p.id)||img.dataset.package!==session().packageId){img.src=p.image;img.dataset.plan=p.id;img.dataset.package=session().packageId;}img.style.width=`${p.width/w*100}%`;img.style.height=`${p.height/h*100}%`;img.style.left=`${-x/w*100}%`;img.style.top=`${-y/h*100}%`;img.alt=`${p.name} ${p.subtitle}の測定図面`;
 $('#markers').replaceChildren(...p.points.map(([id,px,py])=>{const b=marker(id);b.style.left=`${(px-x)/w*100}%`;b.style.top=`${(py-y)/h*100}%`;return b;}));
 $('#extra-points').replaceChildren(...p.extras.map(e=>{const b=el('button','special-point'),desc=el('span');desc.append(el('strong','',e.label),el('small','','図面に位置表示がない測定点'));const r=record(e.id);b.append(el('span','special-number',e.id),desc,el('span','extra-state',r?(r.status==='measured'?r.value:labels[r.status]):'入力する →'));b.dataset.point=e.id;b.onclick=()=>openEntry(e.id);return b;}));
 const ids=points.filter(a=>a.plan===p.id).map(a=>a.id);$('#point-grid').replaceChildren(...ids.map(marker));const s=stats(session(),pack,ids);$('#map-summary').textContent=`この図面：${ids.length-s.empty} / ${ids.length} 地点を記録`;applyFilter();fitMap();
}
function applyFilter(){document.querySelectorAll('.marker').forEach(b=>b.classList.toggle('dim',$('#only-empty').checked&&!b.classList.contains('empty')));}
function openEntry(id){editing={id,sessionId:state.active};const p=points.find(p=>p.id===id),r=record(id);draft=r?.status==='measured'?r.value:'';$('#entry-title').textContent=`測定地点 ${id}`;$('#entry-plan').textContent=p.label||p.name;$('#entry-previous').textContent=r?`${labels[r.status]}${r.status==='measured'?' '+r.value:''} · ${formatTime(r.at)}`:'未入力 · 数値または状態を登録';$('#dose').value=draft;$('#entry-error').textContent='';$('#clear-record').hidden=!r;$('#entry-dialog').showModal();$('#entry-close').focus();}
function addKey(key){if(saving)return;if(key==='back')draft=draft.slice(0,-1);else if(key==='.') {if(!draft.includes('.'))draft=(draft||'0')+'.';}else if(/^\d$/.test(key)){const next=draft+key;if(/^\d{0,6}(\.\d{0,2})?$/.test(next))draft=next;}$('#dose').value=draft;$('#entry-error').textContent='';}
async function saveRecord(status){
 if(saving||!editing)return;if(status==='measured'&&!validDose(draft)){$('#entry-error').textContent='小数点以下2桁までの数値を入力してください。';return;}
 const {id,sessionId}=editing,at=new Date().toISOString(),value=status==='measured'?Number(draft).toFixed(2):null;saving=true;$('#entry-form').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await change(s=>{const target=s.sessions.find(x=>x.id===sessionId);if(!target)throw Error('測定回が見つかりません。');target.records[id]={status,value,at};});await activate();$('#entry-dialog').close();toast(`${id}番 · ${status==='measured'?value:labels[status]}を端末に保存しました`);}
 catch(e){$('#entry-error').textContent='保存できません。入力は残っています。空き容量を確認してください。';error('端末保存に失敗しました。'+e.message);}
 finally{saving=false;$('#entry-form').querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function exportView(){const s=session();$('#export-session').textContent=s.name;const counts=stats(s,pack);$('#export-warning').textContent=counts.empty?`未入力が${counts.empty}地点あります。「測定せず」とは区別して確認してください。`:'全地点に数値または状態が登録されています。';if(counts.measured<points.length)$('#export-warning').textContent+=' 空欄がある場合、線量列の直接コピーは利用できません。CSVをExcelで開いて線量列をコピーしてください。';$('#records-body').replaceChildren(...rows(s,pack).map(r=>{const tr=el('tr');[r[0],r[1],r[2],labels[s.records[r[0]]?.status||'empty'],r[3]].forEach(value=>tr.append(el('td','',value)));return tr;}));}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function copyColumn(){if(rows(session(),pack).some(r=>r[2]==='')){const message='空欄を含む列はiPadで行が詰まるためコピーできません。「4列のCSVを保存」でExcelに開き、線量列をセル範囲としてコピーしてください。';$('#export-warning').textContent=message;toast(message);return;}const data=column(session(),pack),html='<table>'+rows(session(),pack).map(r=>`<tr><td>${r[2]}</td></tr>`).join('')+'</table>';try{if(navigator.clipboard?.write&&window.ClipboardItem)await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([data],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);else await navigator.clipboard.writeText(data);toast(`${points.length}行をコピーしました。Excelで1セルを選んで貼り付けてください。`);}catch{toast('コピーできませんでした。CSVを保存し、線量列をコピーしてください。');}}
async function checkImages(data){for(const p of data.plans)await new Promise((resolve,reject)=>{const img=new Image(),timer=setTimeout(()=>reject(Error('画像の確認がタイムアウトしました。')),10000);img.onload=()=>{clearTimeout(timer);if(img.naturalWidth<1||Math.abs(img.naturalWidth/img.naturalHeight-p.width/p.height)>.02)reject(Error('図面画像の縦横比が座標情報と一致しません。'));else resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('図面画像を読み込めません。'));};img.src=p.image;});}
function openImport(){pending=null;$('#package-file').value='';$('#import-summary').textContent='ファイルは端末内で処理します。アップロードは行いません。';$('#import-confirm').disabled=true;$('#import-dialog').showModal();}
async function readPackage(file){
 if(!file||importing)return;importing=true;pending=null;$('#import-confirm').disabled=true;$('#package-file').disabled=true;$('#import-summary').textContent='図面セットを確認しています…';
 try{if(file.size>45e6)throw Error('図面セットが大きすぎます。');const data=validatePackage(JSON.parse(await file.text()));await checkImages(data);const hash=await packageId(data);pending={id:hash,data};$('#import-summary').textContent=`${data.title}\n${data.plans.length}図面・${pointsOf(data).length}地点\nこの端末に保存します。現在の測定記録は残ります。`;$('#import-confirm').disabled=false;}
 catch(e){$('#import-summary').textContent='読み込めません：'+e.message;}finally{importing=false;$('#package-file').disabled=false;}
}
async function acceptPackage(){if(!pending||importing)return;importing=true;$('#import-confirm').disabled=true;const selected=pending;
 try{await change(s=>{const existing=[...s.sessions].reverse().find(x=>x.packageId===selected.id);if(existing)s.active=existing.id;else{const created=newSession(`${formatTime(new Date()).slice(0,10)} 測定`,selected.id);s.sessions.push(created);s.active=created.id;}},[selected]);currentPlan=null;zoom=1;await activate();$('#import-dialog').close();toast('図面セットをこの端末に保存しました');await prepareOffline();}
 catch(e){$('#import-summary').textContent='保存できません：'+e.message;$('#import-confirm').disabled=false;}finally{importing=false;}
}
async function backup(){try{const snapshot=await get(db,'state','app'),ids=[...new Set(snapshot.sessions.map(s=>s.packageId))],packages=[];for(const id of ids)packages.push({id,data:await get(db,'packages',id)});download(`RI-NOTE-backup-${Date.now()}.json`,JSON.stringify({format:'ri-note-backup',version:2,sessions:snapshot.sessions,packages}),'application/json');toast('図面と記録を含むバックアップを保存しました');}catch(e){error('バックアップを作成できません。'+e.message);}}
async function restore(file){if(!file)return;try{if(file.size>100e6)throw Error('バックアップが大きすぎます。');const data=await validateBackup(JSON.parse(await file.text()));for(const p of data.packages)await checkImages(p.data);if(!confirm(`${data.sessions.length}件の測定回と図面をコピーとして追加します。既存記録は残します。よろしいですか？`))return;await change(s=>{for(const original of data.sessions){const added=structuredClone(original);added.id=crypto.randomUUID();added.name=(added.name.slice(0,190)+'（復元）');s.sessions.push(added);s.active=added.id;}},data.packages);currentPlan=null;await activate();if($('#export-dialog').open)exportView();toast('図面と測定記録を復元しました');await prepareOffline();}catch(e){toast('復元できません：'+e.message);}finally{$('#restore-file').value='';}}
async function prepareOffline(){
 $('#prepare').disabled=true;$('#offline-status').textContent='アプリの保存を確認しています…';
 try{if(!('serviceWorker'in navigator)||!isSecureContext)throw Error('HTTPSで開いてください。');await navigator.serviceWorker.register('./sw.js',{scope:'./'});const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('アプリの準備がタイムアウトしました。')),20000))]);
 await new Promise((resolve,reject)=>{const ch=new MessageChannel(),timer=setTimeout(()=>reject(Error('接続を確認して再試行してください。')),20000);ch.port1.onmessage=e=>{clearTimeout(timer);e.data.ok?resolve():reject(Error(e.data.error));};reg.active.postMessage({type:'PREPARE'},[ch.port2]);});
 await navigator.storage?.persist?.().catch(()=>false);$('#offline-status').textContent=pack?`アプリと${pack.plans.length}図面を保存済み。機内モードで再起動を確認してください。`:'アプリを保存済み。図面セットを読み込んでください。';$('#prepare').textContent='準備状態を再確認';
 }catch(e){$('#offline-status').textContent='未完了：'+e.message;}finally{$('#prepare').disabled=false;}
}
function bind(){
 $('#import-open').onclick=openImport;$('#welcome-import').onclick=openImport;$('#import-close').onclick=()=>{if(!importing)$('#import-dialog').close();};$('#import-dialog').addEventListener('cancel',e=>{if(importing)e.preventDefault();});$('#package-file').onchange=e=>readPackage(e.target.files[0]);$('#import-confirm').onclick=acceptPackage;
 $('#keypad').replaceChildren(...['1','2','3','4','5','6','7','8','9','.','0','back'].map(key=>{const b=el('button','',key==='back'?'⌫':key);b.type='button';b.setAttribute('aria-label',key==='back'?'1文字削除':key);b.onclick=()=>addKey(key);return b;}));
 $('#entry-form').onsubmit=e=>{e.preventDefault();saveRecord('measured');};document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>saveRecord(b.dataset.status));$('#entry-close').onclick=()=>$('#entry-dialog').close();$('#entry-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 $('#entry-dialog').addEventListener('keydown',e=>{if(/^\d$/.test(e.key)||e.key==='.'||e.key==='Backspace'){e.preventDefault();addKey(e.key==='Backspace'?'back':e.key);}else if(e.key==='Enter'){e.preventDefault();saveRecord('measured');}});
 $('#clear-record').onclick=async()=>{if(!confirm(`${editing.id}番を未入力に戻しますか？`))return;try{await change(s=>{delete s.sessions.find(x=>x.id===editing.sessionId).records[editing.id];});await activate();$('#entry-dialog').close();toast('未入力に戻しました');}catch(e){error('変更を保存できません。'+e.message);}};
 $('#only-empty').onchange=applyFilter;$('#zoom-in').onclick=()=>{zoom=Math.min(4,zoom+.5);fitMap();};$('#zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.5);fitMap();};$('#zoom-reset').onclick=()=>{zoom=1;fitMap();$('#map-viewport').scrollTo(0,0);};new ResizeObserver(fitMap).observe($('#map-viewport'));
 $('#session-select').onchange=async e=>{try{const id=e.target.value;await change(s=>s.active=id);currentPlan=null;zoom=1;await activate();}catch(e){error('測定回を変更できません。'+e.message);}};
 $('#new-session').onclick=()=>{$('#session-name').value=`${formatTime(new Date()).slice(0,10)} 測定 ${state.sessions.length+1}`;$('#new-dialog').showModal();};$('#new-close').onclick=()=>$('#new-dialog').close();$('#new-form').onsubmit=async e=>{e.preventDefault();const name=$('#session-name').value.trim();if(!name)return;try{const created=newSession(name,session().packageId);await change(s=>{s.sessions.push(created);s.active=created.id;});await activate();$('#new-dialog').close();toast('新しい測定を開始しました');}catch(e){error('測定回を保存できません。'+e.message);}};
 $('#export-open').onclick=()=>{exportView();$('#export-dialog').showModal();};$('#export-close').onclick=()=>$('#export-dialog').close();$('#copy-column').onclick=copyColumn;$('#download-csv').onclick=()=>download(`RI線量_${formatTime(new Date()).slice(0,10).replaceAll('/','-')}.csv`,csv(session(),pack),'text/csv;charset=utf-8');$('#download-backup').onclick=backup;
 $('#restore').onclick=()=>$('#restore-file').click();$('#welcome-restore').onclick=()=>$('#restore-file').click();$('#restore-file').onchange=e=>restore(e.target.files[0]);$('#prepare').onclick=prepareOffline;
}
async function boot(){
 bind();updateNetwork();window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
 try{db=await openDB(dbName);state=(await get(db,'state','app'))||state;if(state.version!==2||!Array.isArray(state.sessions))throw Error('保存データの形式を確認してください。');await activate();}
 catch(e){db=null;error('端末保存を開けません。入力を開始せず、バックアップとブラウザ設定を確認してください。 '+e.message);$('#import-open').disabled=true;$('#welcome-import').disabled=true;$('#welcome-restore').disabled=true;}
 await prepareOffline();
}
boot();
