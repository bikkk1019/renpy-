"use strict";

(() => {
  const $ = id => document.getElementById(id), PAGE_SIZE = 60;
  let active = state.steps[0]?.id, chapter = '*', page = 0, marked = new Set(), filtered = [], loading = true;
  let saveTimer, pendingSnapshot = '', saveChain = Promise.resolve(), dirty = false, lastBackup = 0, revision = 0;
  const dbPromise = new Promise((resolve,reject) => {
    const r=indexedDB.open('renpy-story-drafts',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('drafts');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  const currentIndex = () => state.steps.findIndex(s=>s.id===active);
  const bytes = text => new Blob([text]).size;
  async function dbGet(key) {const db=await dbPromise;return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function commit(snapshot) {
    const db=await dbPromise;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'), store=tx.objectStore('drafts'), now=Date.now();
      if(now-lastBackup>60000) {const r=store.get('current');r.onsuccess=()=>{if(r.result&&r.result.snapshot!==snapshot)store.put(r.result,'previous');};lastBackup=now;}
      store.put({snapshot,savedAt:now},'current');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  function persist(snapshot) {
    if(loading)return;
    pendingSnapshot=snapshot;dirty=true;revision++;clearTimeout(saveTimer);
    $('saveStatus').textContent=state.steps.length+' 个步骤 · 正在保存草稿…';
    saveTimer=setTimeout(flush,400);
  }
  function flush() {
    clearTimeout(saveTimer);const snapshot=pendingSnapshot;if(!snapshot)return saveChain;
    pendingSnapshot='';const savingRevision=revision;
    saveChain=saveChain.catch(()=>{}).then(()=>commit(snapshot)).then(()=>{
      if(savingRevision===revision){dirty=false;$('saveStatus').textContent=state.steps.length+' 个步骤 · 草稿已保存到本机数据库';}
      // Keep a small synchronous fallback; the database is authoritative for large projects.
      try {if(bytes(snapshot)<3*1024*1024){localStorage.setItem(DRAFT_KEY,snapshot);localStorage.setItem(DRAFT_KEY+'-time',String(Date.now()));}}catch(_){}
    }).catch(()=>{$('saveStatus').textContent='自动保存失败，请立即保存工程文件';dirty=true;});
    return saveChain;
  }
  window.addEventListener('beforeunload',ev=>{if(dirty){ev.preventDefault();ev.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});

  function sections() {
    const result=[{id:'root',name:state.labelName,start:0,end:state.steps.length}];
    state.steps.forEach((s,i)=>{if(s.type==='label'){result[result.length-1].end=i;result.push({id:s.id,name:s.name,start:i,end:state.steps.length});}});
    return result;
  }
  function sectionOf(i) {return sections().find(c=>i>=c.start&&i<c.end)||sections()[0];}
  function summary(s) {return String(s.type==='say'?(s.speaker? s.speaker+'：':'旁白：')+s.text:s.type==='label'?s.name:s.type==='menu'?s.menuText:s.image||s.path||s.target||s.expression||s.code||TYPE_NAMES[s.type]);}
  function filterRows() {
    const q=$('storySearch').value.trim().toLowerCase(),type=$('storyType').value,status=$('storyStatus').value,only=$('onlyBookmarks').checked;
    const c=sections().find(x=>x.id===chapter), result=[];
    state.steps.forEach((s,i)=>{
      if(c&&(i<c.start||i>=c.end))return;
      if(type&&s.type!==type||status&&(s.editorStatus||'draft')!==status||only&&!s.bookmark)return;
      if(q&&!([summary(s),s.editorNote,s.speaker,s.name].join(' ').toLowerCase().includes(q)))return;
      result.push(i);
    });return result;
  }
  function meta(s,i) {
    return '<div class="step-meta">'+fieldSelect('制作状态',i,'editorStatus',s.editorStatus||'draft',[{value:'draft',label:'草稿'},{value:'todo',label:'待处理'},{value:'reviewed',label:'已校对'}])+'<label>制作备注<textarea data-index="'+i+'" data-field="editorNote" rows="2">'+escapeHtml(s.editorNote||'')+'</textarea></label><label class="checkbox"><input type="checkbox" data-index="'+i+'" data-field="bookmark" '+(s.bookmark?'checked':'')+'>加入书签</label></div>';
  }
  function render() {
    if(!state.steps.some(s=>s.id===active))active=state.steps[0]?.id;
    filtered=filterRows();page=Math.max(0,Math.min(page,Math.ceil(filtered.length/PAGE_SIZE)-1));
    const indices=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),compact=$('compactMode').checked;
    el.stepList.innerHTML=indices.map(i=>{
      const s=state.steps[i],check=s.type==='label'?'':'<input class="step-mark" type="checkbox" data-mark="'+escapeHtml(s.id)+'" aria-label="多选第 '+(i+1)+' 步" '+(marked.has(s.id)?'checked':'')+'>';
      if(!compact||s.id===active) {
        return renderStep(s,i).replace('<div class="step-head">','<div class="step-head">'+check).replace(/<\/div><\/div>$/,meta(s,i)+'</div></div>');
      }
      return '<div class="step" data-index="'+i+'" tabindex="0"><div class="step-head">'+check+'<span class="step-title">'+(i+1)+'. '+TYPE_NAMES[s.type]+(s.bookmark?' ★':'')+'</span><span class="small">'+({draft:'草稿',todo:'待处理',reviewed:'已校对'}[s.editorStatus||'draft'])+'</span></div><div class="step-summary">'+escapeHtml(summary(s).slice(0,160))+'</div></div>';
    }).join('')||'<div class="empty">当前没有匹配的步骤。清空搜索或切换段落查看。</div>';
    document.querySelectorAll('.step').forEach(n=>n.classList.toggle('selected',state.steps[Number(n.dataset.index)]?.id===active));
    $('pageInfo').textContent=(filtered.length?page+1:0)+' / '+Math.ceil(filtered.length/PAGE_SIZE)+' 页 · '+filtered.length+' 条匹配 · '+marked.size+' 条多选';
    $('pagePrevious').disabled=page===0;$('pageNext').disabled=(page+1)*PAGE_SIZE>=filtered.length;
  }
  function select(id,fromStory=true) {
    if(!state.steps.some(s=>s.id===id))return;
    const changed=active!==id;active=id;
    if(changed){const i=currentIndex(),allowed=filterRows();if(!allowed.includes(i)){chapter=sectionOf(i).id;$('storySearch').value='';$('storyType').value='';$('storyStatus').value='';$('onlyBookmarks').checked=false;}page=Math.floor(filterRows().indexOf(i)/PAGE_SIZE);render();}
    if(fromStory)window.visualEditor?.select?.(id);
  }
  function insert(items) {
    if(state.steps.length+items.length>30000){toast('当前工程最多 30000 步，请拆分为多个制作工程');return false;}
    const i=$('insertPosition').value==='after'&&currentIndex()>=0?currentIndex()+1:state.steps.length;
    state.steps.splice(i,0,...items);active=items[0]?.id||active;
    chapter='*';$('storySearch').value='';$('storyType').value='';$('storyStatus').value='';$('onlyBookmarks').checked=false;page=Math.floor(i/PAGE_SIZE);
  }
  function refresh() {
    const cs=sections(),needle=$('chapterSearch').value.toLowerCase();
    $('chapterList').innerHTML=cs.filter(c=>String(c.name).toLowerCase().includes(needle)).map(c=>'<button class="'+(chapter===c.id?'active':'')+'" data-chapter="'+escapeHtml(c.id)+'">'+escapeHtml(c.name||'未命名')+' · '+(c.end-c.start)+'</button>').join('');
    const prev=$('moveDestination').value;
    $('moveDestination').innerHTML=cs.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
    if(cs.some(c=>c.id===prev))$('moveDestination').value=prev;
    const dialogue=state.steps.filter(s=>s.type==='say'),count=dialogue.reduce((n,s)=>n+Array.from(s.text||'').length,0);
    $('storyStats').textContent=cs.length+' 段 · '+dialogue.length+' 句 · '+count.toLocaleString()+' 字 · '+state.steps.filter(s=>s.editorStatus==='todo').length+' 待处理';
    if(document.activeElement!==$('projectTitle'))$('projectTitle').value=state.projectTitle||'未命名故事';
    if(document.activeElement!==$('externalLabels'))$('externalLabels').value=(state.externalLabels||[]).join('\n');
    $('gameIndexStatus').textContent=state.gameIndex?.source?'已读取 '+state.gameIndex.source+'：'+state.gameIndex.labels.length+' 个 label，'+state.gameIndex.images.length+' 个图片名（静态索引）':'';
  }
  function changed() {renderSteps();updateOutput();window.visualEditor?.select?.(active);}
  function selectedBody() {return state.steps.filter(s=>marked.has(s.id)&&s.type!=='label');}

  function edges() {
    const result=[];let source=state.labelName;
    state.steps.forEach((s,i)=>{
      if(s.type==='label')source=s.name;
      const add=(target,kind)=>{if(String(target||'').trim())result.push({source,target:String(target).trim(),kind,index:i,id:s.id});};
      if(s.type==='jump')add(s.target,s.mode==='call'?'调用':'跳转');
      if(s.type==='condition'){add(s.target,'条件成立');add(s.otherwise,'否则');}
      if(s.type==='menu')parseMenuText(s.menuText).forEach(c=>add(c.target,c.text));
    });return result;
  }
  function issues() {
    const local=new Set(sections().map(c=>c.name)),external=new Set([...(state.externalLabels||[]),...(state.gameIndex?.labels||[])]),list=[];
    for(const e of edges())if(!local.has(e.target)&&!external.has(e.target))list.push({level:'error',index:e.index,message:'目标段落不存在：'+e.target+'（若来自其他文件，请登记为外部 label 或读取游戏索引）'});
    const all=edges(),incoming=new Set(all.map(e=>e.target));
    sections().slice(1).forEach(c=>{if(!incoming.has(c.name))list.push({level:'warning',index:c.start,message:'段落 '+c.name+' 没有本工程内的入口（也可能供外部调用）'});});
    let ended=false;
    state.steps.forEach((s,i)=>{
      if(s.type==='label'){ended=false;return;}
      if(ended)list.push({level:'warning',index:i,message:'此步骤位于无条件跳转 / return 后，通常不会执行'});
      if(s.type==='return'||s.type==='jump'&&s.mode==='jump')ended=true;
      if(s.editorStatus==='todo')list.push({level:'info',index:i,message:'标记为待处理：'+(s.editorNote||summary(s)).slice(0,100)});
      if(state.gameIndex?.source&&s.type==='say'&&s.speaker&&!state.gameIndex.characters.includes(s.speaker))list.push({level:'warning',index:i,message:'索引未找到角色变量 '+s.speaker+'；动态定义请在引擎检查'});
    });return list;
  }
  function modal(title,html) {$('dialogTitle').textContent=title;$('dialogContent').innerHTML=html;if(!$('storyDialog').open)$('storyDialog').showModal();}
  function showIssues() {
    const basic=validateProject().map(message=>({level:'error',index:Number(message.match(/^第 (\d+) 步/)?.[1]||0)-1,message})),items=[...basic,...issues()];
    modal('剧情检查与分支关系','<p>错误 '+items.filter(x=>x.level==='error').length+' · 提示 '+items.filter(x=>x.level!=='error').length+'。点击项目定位；Python 表达式和素材仍需引擎检查。</p>'+items.slice(0,500).map(x=>'<button class="issue '+x.level+'" data-jump-index="'+x.index+'">'+escapeHtml(x.message)+'</button>').join('')+(items.length>500?'<p>仅显示前 500 项，请修复后重新检查。</p>':'')+'<h3>段落关系</h3>'+sections().map(c=>'<div class="flow-block"><b>'+escapeHtml(c.name)+'</b>'+edges().filter(e=>e.source===c.name).map(e=>'<div>'+escapeHtml(e.kind)+' → <button data-jump-index="'+(sections().find(c=>c.name===e.target)?.start??e.index)+'">'+escapeHtml(e.target)+'</button></div>').join('')+'</div>').join(''));
  }
  function rename() {
    const c=chapter==='*'?sectionOf(currentIndex()):sections().find(c=>c.id===chapter);if(!c)return;
    const name=prompt('新段落名（会同步更新选项、条件、跳转与调用；原始代码需手动检查）',c.name);
    if(name===null||name===c.name)return;
    if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)||sections().some(x=>x.name===name)){toast('段落名无效或重复');return;}
    const old=c.name;
    if(c.id==='root'){state.labelName=name;el.labelName.value=name;}else state.steps[c.start].name=name;
    for(const s of state.steps){if(['jump','condition'].includes(s.type)&&s.target===old)s.target=name;if(s.type==='condition'&&s.otherwise===old)s.otherwise=name;
      if(s.type==='menu')s.menuText=String(s.menuText).split('\n').map(line=>{const parts=line.split('|'),first=parts[0].split('->');if(first.length===2&&first[1].trim()===old){parts[0]=first[0].trim()+' -> '+name;}return parts.join('|');}).join('\n');}
    changed();toast('段落及结构化引用已更新；原始代码中的引用请手动检查');
  }

  async function readDataURL(blob) {return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
  async function bundle() {
    updateOutput();await flush();const project=clone(state),files=[];let total=0;
    for(const a of project.visual?.assets||[]){const blob=await window.visualEditor.readAsset(a.id);if(!blob)throw Error('素材缺失：'+a.name+'，请重新导入后打包');total+=blob.size;if(total>180*1024*1024)throw Error('图片总量超过 180 MB，请拆分工程或压缩图片');files.push({id:a.id,data:await readDataURL(blob)});}
    return {format:'renpy-story-bundle',version:1,project,files};
  }
  function clone(x){return JSON.parse(JSON.stringify(x));}
  async function loadFile(file) {
    try {
      if(file.size>260*1024*1024)throw Error('工程文件超过 260 MB');
      const data=JSON.parse(await file.text()),packed=data.format==='renpy-story-bundle',next=normalizeProject(packed?data.project:data);
      if(state.steps.length&&!confirm('读取工程将替换当前内容（可撤销）。继续吗？'))return;
      if(packed){
        if(data.version!==1||!Array.isArray(data.files))throw Error('工程包格式不支持');
        const needed=new Set(next.visual.assets.map(a=>a.id)), seen=new Set(), decoded=[];let size=0;
        for(const f of data.files){if(!needed.has(f.id)||seen.has(f.id)||typeof f.data!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(f.data))throw Error('工程包图片记录无效');seen.add(f.id);
          const raw=atob(f.data.slice(f.data.indexOf(',')+1));size+=raw.length;if(size>180*1024*1024||raw.length>30*1024*1024)throw Error('图片超过大小限制');
          const arr=Uint8Array.from(raw,c=>c.charCodeAt(0)),blob=new Blob([arr],{type:f.data.slice(5,f.data.indexOf(';'))});
          const bitmap=await createImageBitmap(blob);if(bitmap.width>12000||bitmap.height>12000){bitmap.close();throw Error('图片尺寸超过限制');}bitmap.close();
          decoded.push({old:f.id,id:crypto.randomUUID(),blob});
        }
        if(seen.size!==needed.size)throw Error('工程包缺少图片，未替换当前工程');
        for(const f of decoded){await window.visualEditor.writeAsset(f.id,f.blob);next.visual.assets.filter(a=>a.id===f.old).forEach(a=>a.id=f.id);}
      }
      state=next;chapter='*';page=0;active=state.steps[0]?.id;marked.clear();syncStateUI();window.visualEditor.resetAssets();toast(packed?'工程与图片已恢复':'工程已读取');
    }catch(e){toast('读取失败：'+e.message,6000);}
  }

  async function indexGame() {
    if(!window.showDirectoryPicker){toast('请使用 Edge 的目录选择功能');return;}
    try {
      let dir=await showDirectoryPicker({mode:'read'});if(dir.name.toLowerCase()!=='game')dir=await dir.getDirectoryHandle('game');
      const result={source:dir.name+' · '+new Date().toLocaleString(),labels:[],characters:[],images:[],audio:[]};let count=0;
      async function scan(d,prefix='',depth=0){if(depth>12)return;for await(const [name,h] of d.entries()){
        if(++count>30000)throw Error('工程文件过多，请减少扫描范围');
        const path=prefix+name;
        if(h.kind==='directory'){if(!['saves','cache','.git'].includes(name))await scan(h,path+'/',depth+1);continue;}
        if(/\.(ogg|mp3|wav|opus|flac)$/i.test(name))result.audio.push(path);
        if(path.startsWith('images/')&&/\.(png|jpe?g|webp|avif)$/i.test(name))result.images.push(path.slice(7).replace(/\.[^.]+$/,'').toLowerCase());
        if(!name.endsWith('.rpy'))continue;const f=await h.getFile();if(f.size>8*1024*1024)continue;const text=await f.text();
        for(const m of text.matchAll(/^\s*label\s+([\p{L}_][\p{L}\p{N}_.]*)\s*(?:\([^\n]*\))?\s*:/gmu))result.labels.push(m[1]);
        for(const m of text.matchAll(/^\s*define\s+([\p{L}_][\p{L}\p{N}_.]*)\s*=\s*(?:Character|DynamicCharacter)\s*\(/gmu))result.characters.push(m[1]);
        for(const m of text.matchAll(/^\s*image\s+([^=\n:]+)\s*[=:]/gm))result.images.push(m[1].trim());
      }}
      await scan(dir);for(const k of ['labels','characters','images','audio'])result[k]=[...new Set(result[k])];state.gameIndex=result;updateOutput();toast('游戏工程索引读取完成（未修改游戏文件）');
    }catch(e){if(e.name!=='AbortError')toast('读取索引失败：'+e.message,5000);}
  }

  function zipFiles(files) {
    const encoder=new TextEncoder(),local=[],central=[];let offset=0;
    const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
    const header=size=>{const bytes=new Uint8Array(size);return {bytes,v:new DataView(bytes.buffer)};};
    for(const file of files){
      const name=encoder.encode(file.name),body=encoder.encode(file.text);let crc=0xffffffff;for(const b of body)crc=table[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
      const h=header(30);h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,body.length,true);h.v.setUint32(22,body.length,true);h.v.setUint16(26,name.length,true);
      local.push(h.bytes,name,body);
      const c=header(46);c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,body.length,true);c.v.setUint32(24,body.length,true);c.v.setUint16(28,name.length,true);c.v.setUint32(42,offset,true);central.push(c.bytes,name);offset+=30+name.length+body.length;
    }
    const size=central.reduce((n,b)=>n+b.length,0),end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);
    return new Blob([...local,...central,end.bytes],{type:'application/zip'});
  }
  function exportChapters() {
    if(checkedScript()===null)return;
    const script=generateScript(),files=[],cs=sections(),lines=script.split('\n');let start=0,name=state.labelName;
    for(let i=1;i<=lines.length;i++)if(i===lines.length||/^label /.test(lines[i])){files.push({name:'story_'+String(files.length+1).padStart(3,'0')+'_'+safeFileName(name)+'.rpy',text:lines.slice(start,i).join('\n')+'\n'});if(i<lines.length){start=i;name=lines[i].slice(6).replace(/:$/,'');}}
    downloadText(safeFileName(state.projectTitle||state.labelName)+'_chapters.zip',zipFiles(files));
    toast('已导出分段脚本 ZIP。解压后放入 game；请勿同时保留同内容的整合脚本，以免 label 重复。',6000);
  }

  for(const [type,label] of Object.entries(TYPE_NAMES))$('storyType').add(new Option(label,type));
  $('compactMode').checked=localStorage.getItem('renpy-compact-mode')!=='false';
  $('compactMode').onchange=()=>{localStorage.setItem('renpy-compact-mode',String($('compactMode').checked));render();};
  for(const id of ['storySearch','storyType','storyStatus','onlyBookmarks'])$(id).addEventListener(id==='storySearch'?'input':'change',()=>{page=0;render();});
  $('chapterSearch').oninput=refresh;
  $('chapterList').onclick=ev=>{const b=ev.target.closest('[data-chapter]');if(!b)return;chapter=b.dataset.chapter;page=0;const c=sections().find(x=>x.id===chapter);active=state.steps[c.start]?.id;render();refresh();window.visualEditor?.select?.(active);};
  $('allChapters').onclick=()=>{chapter='*';page=0;render();refresh();};
  $('pagePrevious').onclick=()=>{page--;render();};$('pageNext').onclick=()=>{page++;render();};
  $('projectTitle').onchange=()=>{state.projectTitle=$('projectTitle').value;updateOutput();};
  $('externalLabels').onchange=()=>{state.externalLabels=$('externalLabels').value.split(/\s+/).filter(Boolean);updateOutput();};
  $('stepList').addEventListener('change',ev=>{const id=ev.target.dataset.mark;if(id){if(ev.target.checked)marked.add(id);else marked.delete(id);$('pageInfo').textContent=(page+1)+' / '+Math.ceil(filtered.length/PAGE_SIZE)+' 页 · '+filtered.length+' 条匹配 · '+marked.size+' 条多选';}});
  $('stepList').addEventListener('click',ev=>{if(ev.target.classList.contains('step-mark')||ev.target.closest('button,input,textarea,select'))return;const node=ev.target.closest('.step');if(node)select(state.steps[Number(node.dataset.index)]?.id);});
  $('stepList').addEventListener('keydown',ev=>{if(ev.target.classList.contains('step')&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();select(state.steps[Number(ev.target.dataset.index)]?.id);}});
  $('selectPage').onclick=()=>{filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).forEach(i=>{if(state.steps[i].type!=='label')marked.add(state.steps[i].id);});render();};
  $('clearSelection').onclick=()=>{marked.clear();render();};
  $('deleteSelected').onclick=()=>{const items=selectedBody();if(!items.length)return;if(!confirm('删除选中的 '+items.length+' 个正文步骤？可撤销。'))return;const ids=new Set(items.map(s=>s.id));state.steps=state.steps.filter(s=>!ids.has(s.id));marked.clear();changed();};
  $('copySelected').onclick=()=>{const items=selectedBody().map(s=>({...s,id:uid()}));if(!items.length)return;insert(items);marked=new Set(items.map(s=>s.id));changed();};
  $('moveSelected').onclick=()=>{const items=selectedBody();if(!items.length)return;const id=$('moveDestination').value,ids=new Set(items.map(s=>s.id));state.steps=state.steps.filter(s=>!ids.has(s.id));const c=sections().find(c=>c.id===id);state.steps.splice(c.end,0,...items);chapter=id;active=items[0].id;page=0;marked.clear();changed();select(active);};
  $('applyBatchStatus').onclick=()=>{selectedBody().forEach(s=>s.editorStatus=$('batchStatus').value);changed();};
  $('renameChapter').onclick=rename;$('inspectProject').onclick=showIssues;$('linkGame').onclick=indexGame;$('downloadChapters').onclick=exportChapters;
  $('closeStoryDialog').onclick=()=>$('storyDialog').close();
  $('dialogContent').onclick=ev=>{const b=ev.target.closest('[data-jump-index]');if(b){const s=state.steps[Number(b.dataset.jumpIndex)];if(s){$('storyDialog').close();select(s.id);el.stepList.querySelector('.selected')?.scrollIntoView({block:'nearest'});}}};
  $('importDialogue').onclick=()=>{
    modal('批量导入台词','<p>每行一句：角色变量: 台词。没有冒号或使用“旁白:”的行作为旁白；空行忽略。插入位置遵循列表上方设置。</p><textarea id="dialogueInput" rows="14" placeholder="e: 你好。\n旁白: 风吹过走廊。"></textarea><div id="dialogueCount"></div><button id="confirmDialogue">插入台词</button>');
    $('dialogueInput').oninput=()=>$('dialogueCount').textContent=$('dialogueInput').value.split('\n').filter(x=>x.trim()).length+' 句';
    $('confirmDialogue').onclick=()=>{const rows=$('dialogueInput').value.split('\n').map(x=>x.trim()).filter(Boolean);if(state.steps.length+rows.length>30000){toast('最多 30000 个步骤');return;}
      const items=rows.map(line=>{const match=line.match(/^([\p{L}_][\p{L}\p{N}_.]*|旁白)\s*[:：]\s*(.*)$/u);return {...defaultStep('say'),speaker:match&&match[1]!=='旁白'?match[1]:'',text:match?match[2]:line};});insert(items);changed();$('storyDialog').close();};
  };
  $('replaceDialogue').onclick=()=>{
    modal('查找替换','<p>仅替换台词正文与制作备注；范围为当前段落筛选（“查看全部段落”则为全工程）。不修改 label、表达式或原始代码。</p><label>查找<input id="findText"></label><label>替换为<input id="replaceText"></label><div id="replaceCount"></div><button id="confirmReplace">替换全部匹配（可撤销）</button>');
    const scope=()=>{const c=sections().find(x=>x.id===chapter);return state.steps.filter((s,i)=>!c||i>=c.start&&i<c.end);};
    const count=()=>{const q=$('findText').value;let n=0;if(q)for(const s of scope())for(const key of s.type==='say'?['text','editorNote']:['editorNote'])n+=(String(s[key]||'').split(q).length-1);$('replaceCount').textContent=n+' 处匹配';return n;};
    $('findText').oninput=count;
    $('confirmReplace').onclick=()=>{const q=$('findText').value;if(!q||!count())return;for(const s of scope())for(const key of s.type==='say'?['text','editorNote']:['editorNote'])if(s[key])s[key]=String(s[key]).split(q).join($('replaceText').value);changed();$('storyDialog').close();};
  };
  $('saveBundleBtn').onclick=async()=>{const button=$('saveBundleBtn');button.disabled=true;try{const data=await bundle();downloadText(safeFileName(state.projectTitle||state.labelName)+'.rpe',JSON.stringify(data));toast('已打包编辑工程与导入图片；游戏外部音频等文件不包含在内',5000);}catch(e){toast('打包失败：'+e.message,6000);}finally{button.disabled=false;}};
  $('recoverDraft').onclick=async()=>{try{const record=await dbGet('previous');if(!record){toast('暂无备份草稿');return;}if(!confirm('恢复 '+new Date(record.savedAt).toLocaleString()+' 的备份草稿？当前编辑可撤销。'))return;state=normalizeProject(JSON.parse(record.snapshot));chapter='*';page=0;active=state.steps[0]?.id;syncStateUI();}catch(e){toast('恢复失败：'+e.message);}};
  window.storyEditor={render,refresh,select,insert,issues,edges,persist,flush,loadFile,bundle,sections,zipFiles};
  const initial=JSON.stringify(normalizeProject(state));
  (async()=>{try{const record=await dbGet('current');if(record&&record.savedAt>Number(localStorage.getItem(DRAFT_KEY+'-time')||0)&&JSON.stringify(normalizeProject(state))===initial){state=normalizeProject(JSON.parse(record.snapshot));active=state.steps[0]?.id;el.labelName.value=state.labelName;el.wrapLabel.checked=state.wrapLabel;history=[];historyIndex=-1;toast('已恢复数据库草稿');}}catch(_){toast('数据库不可用，请手动保存工程文件');}finally{loading=false;render();refresh();updateOutput();}})();
  render();refresh();
})();
