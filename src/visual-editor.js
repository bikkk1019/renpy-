"use strict";

// A deterministic storyboard preview. It never evaluates script expressions.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('stageCanvas'), ctx = canvas.getContext('2d');
  const cache = new Map(), pending = new Map(), missing = new Set();
  let selectedId = state.steps[0]?.id, frame = 0, drag = null, dbPromise;
  const visual = () => state.visual || (state.visual = normalizeVisual());
  const tag = name => String(name || '').trim().split(/\s+/)[0];
  const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const index = () => state.steps.findIndex(s => s.id === selectedId);
  const selected = () => state.steps[index()];
  const clone = v => JSON.parse(JSON.stringify(v));

  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('renpy-visual-assets', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function stored(id, blob) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', blob ? 'readwrite' : 'readonly');
      const request = blob ? tx.objectStore('images').put(blob, id) : tx.objectStore('images').get(id);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('素材存储被取消'));
    });
  }
  async function decode(blob) {
    const url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    try { await img.decode(); return {img,url}; }
    catch (e) { URL.revokeObjectURL(url); throw e; }
  }
  async function loadAsset(a) {
    if (cache.has(a.id) || missing.has(a.id)) return;
    if (pending.has(a.id)) return pending.get(a.id);
    const task = (async () => {
      try {
        const blob = await stored(a.id);
        if (!blob) { missing.add(a.id); return; }
        cache.set(a.id, await decode(blob));
      } catch (_) { missing.add(a.id); }
      finally { pending.delete(a.id); }
    })();
    pending.set(a.id, task);
    await task;
  }
  function assetFor(name) {
    return visual().assets.find(a => a.name.trim() === String(name).trim());
  }
  function imageFor(name) { const a = assetFor(name); return a && cache.get(a.id)?.img; }

  async function importFiles(files) {
    const images = [...files].filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f.name));
    if (!images.length) { toast('请选择 PNG、JPEG、WebP 或 GIF 图片'); return; }
    if (visual().assets.length + images.length > 200) { toast('素材库最多 200 张图片，请分工程管理'); return; }
    const targetVisual = visual();
    $('importImages').disabled = $('importImageFolder').disabled = true;
    let count = 0, failures = 0;
    try {
      for (const file of images) {
        let decoded;
        try {
          if (file.size > 30 * 1024 * 1024) throw Error('图片超过 30 MB');
          decoded = await decode(file);
          if (decoded.img.naturalWidth > 12000 || decoded.img.naturalHeight > 12000) throw Error('图片尺寸超过 12000 像素');
          const id = crypto.randomUUID();
          const ext=file.name.split('.').pop().toLowerCase();
          const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[ext];
          await stored(id, new Blob([file],{type:mime}));
          cache.set(id, decoded);
          let name = file.name.replace(/\.[^.]+$/, '').toLowerCase();
          const existing = new Set(targetVisual.assets.map(a => a.name));
          if (existing.has(name)) { const base = name; let i = 2; while(existing.has(name)) name = base + ' ' + i++; }
          targetVisual.assets.push({id,name,fileName:file.webkitRelativePath || file.name});
          count++;
        } catch (_) { if(decoded) URL.revokeObjectURL(decoded.url); failures++; }
      }
      if (state.visual === targetVisual) { updateOutput(); await renderLibrary(); }
      $('assetDetails').open = true;
      toast('已导入 ' + count + ' 张图片' + (failures ? '，' + failures + ' 张失败（格式、大小或存储空间）' : ''), 4000);
    } finally { $('importImages').disabled = $('importImageFolder').disabled = false; }
  }

  let libraryKey = '';
  async function renderLibrary() {
    const assets = visual().assets, key = JSON.stringify(assets);
    if (key === libraryKey) return;
    libraryKey = key;
    await Promise.all(assets.map(loadAsset));
    if (key !== JSON.stringify(visual().assets)) return;
    $('assetList').innerHTML = '';
    for (const a of assets) {
      const row = document.createElement('div'); row.className = 'asset-row';
      const thumb = document.createElement('img'); thumb.alt = a.name;
      if(cache.has(a.id))thumb.src = cache.get(a.id).url;
      const input = document.createElement('input'); input.value = a.name; input.setAttribute('aria-label','素材图片名');
      input.onchange = () => {
        const name = input.value.trim();
        if(!/^[\p{L}\p{N}_-]+(?: +[\p{L}\p{N}_-]+)*$/u.test(name) || visual().assets.some(x => x.id !== a.id && x.name === name)) { toast('图片名无效或重复'); input.value=a.name; return; }
        const live = visual().assets.find(x => x.id === a.id); if(live)live.name=name;
        updateOutput();
      };
      const buttons=document.createElement('div');
      const use=document.createElement('button');use.textContent='用于当前步骤';
      use.onclick=()=>{const s=selected();if(!s||!['scene','show','hide','animation'].includes(s.type)){toast('请先选择场景、显示、隐藏或动画步骤');return;}s.image=visual().assets.find(x=>x.id===a.id).name;if(s.type==='scene')s.mode='image';renderSteps();updateOutput();};
      const remove=document.createElement('button');remove.textContent='移除引用';
      remove.onclick=()=>{visual().assets=visual().assets.filter(x=>x.id!==a.id);updateOutput();};
      buttons.append(use,remove);
      const info=document.createElement('div');info.className='small';info.textContent=(cache.has(a.id)?a.fileName:'本机图片缺失，请重新导入并绑定同名素材');
      row.append(thumb,input,buttons,info);$('assetList').append(row);
    }
    if(!assets.length)$('assetList').textContent='尚未导入图片；舞台会显示带名称的占位图。';
    if(!frame&&!drag){const view=snapshot(index());draw(view);updateStatus(view);}
  }

  const empty = () => ({background:'',sprites:[],text:'',speaker:'',window:'auto',choices:[]});
  function apply(view,s) {
    if(s.type==='scene'){view.background=s.mode==='clear'?'':s.image;view.sprites=[];}
    if(s.type==='show') {
      const old=view.sprites.find(x=>x.tag===tag(s.image));
      const sprite=s.placement==='keep'&&old?{...old,image:s.image}:{tag:tag(s.image),image:s.image,x:number(s.x,50),y:number(s.y,100),anchorX:number(s.anchorX,50),anchorY:number(s.anchorY,100),scale:number(s.scale,1),opacity:number(s.opacity,1),rotate:number(s.rotate),mirror:s.mirror==='yes',dx:0,dy:0};
      if(old)view.sprites[view.sprites.indexOf(old)]=sprite;else view.sprites.push(sprite);
    }
    if(s.type==='hide')view.sprites=view.sprites.filter(x=>x.tag!==tag(s.image));
    if(s.type==='animation') {
      const sprite=view.sprites.find(x=>x.tag===tag(s.image));
      if(sprite) {
        if(String(s.image).trim().includes(' '))sprite.image=s.image;
        if(s.mode==='move'){sprite.x=number(s.x);sprite.y=number(s.y);}
        if(s.mode==='transform'){sprite.scale=number(s.scale,1);sprite.rotate=number(s.rotate);sprite.opacity=number(s.opacity,1);}
        if(s.mode==='opacity')sprite.opacity=number(s.opacity,1);
        if(s.mode==='bounce')sprite.dy=0;if(s.mode==='shake')sprite.dx=0;
      }
    }
    if(s.type==='say'){view.text=String(s.text);view.speaker=String(s.speaker);view.choices=[];}
    if(s.type==='window')view.window=s.mode;
    if(s.type==='menu')view.choices=parseMenuText(s.menuText).map(c=>c.text);
  }
  function snapshot(end) {
    const view=empty();let start=0;
    for(let i=end;i>=0;i--)if(state.steps[i]?.type==='label'){start=i;break;}
    for(let i=start;i<=end;i++)if(state.steps[i])apply(view,state.steps[i]);
    return view;
  }
  function dimensions(sprite) {
    const img=imageFor(sprite.image);
    return {width:img?.naturalWidth || canvas.width*.24,height:img?.naturalHeight || canvas.height*.78};
  }
  function wrapText(text,x,y,width,lineHeight,maxLines) {
    let line='',lineCount=0;
    for(const ch of String(text)) {
      if(ch==='\n'||ctx.measureText(line+ch).width>width){ctx.fillText(line,x,y);y+=lineHeight;lineCount++;line='';if(lineCount>=maxLines)return;}
      if(ch!=='\n')line+=ch;
    }
    ctx.fillText(line,x,y);
  }
  function paint(view,alpha=1) {
    const w=canvas.width,h=canvas.height;
    ctx.save();ctx.globalAlpha=alpha;
    ctx.fillStyle='#111b2c';ctx.fillRect(0,0,w,h);
    const bg=imageFor(view.background);
    if(bg)ctx.drawImage(bg,0,0); // Ren'Py natural image size, no invented auto-fit.
    else if(view.background){ctx.fillStyle='#263854';ctx.fillRect(0,0,w,h);ctx.fillStyle='#b7c9e5';ctx.font=`${h*.035}px sans-serif`;ctx.fillText('背景：'+view.background+'（未绑定图片）',w*.03,h*.07);}
    for(const sp of view.sprites) {
      const {width:sw,height:sh}=dimensions(sp), img=imageFor(sp.image);
      ctx.save();ctx.globalAlpha=alpha*Math.min(1,Math.max(0,sp.opacity));
      ctx.translate(w*sp.x/100+sp.dx,h*sp.y/100+sp.dy);
      ctx.rotate(sp.rotate*Math.PI/180);ctx.scale(sp.scale*(sp.mirror?-1:1),sp.scale);
      const x=-sw*sp.anchorX/100,y=-sh*sp.anchorY/100;
      if(img)ctx.drawImage(img,x,y,sw,sh);
      else {ctx.fillStyle='#5575a8';ctx.fillRect(x,y,sw,sh);ctx.strokeStyle='#96baff';ctx.lineWidth=3;ctx.strokeRect(x,y,sw,sh);ctx.fillStyle='white';ctx.font=`${h*.028}px sans-serif`;ctx.fillText(sp.image,x+12,y+35,sw-24);ctx.font=`${h*.022}px sans-serif`;ctx.fillText('未绑定立绘',x+12,y+65,sw-24);}
      ctx.restore();
    }
    if(view.window!=='hide'&&(view.text||view.window==='show')) {
      ctx.fillStyle='rgba(6,10,20,.86)';ctx.fillRect(w*.04,h*.74,w*.92,h*.22);
      ctx.fillStyle='#aac4ff';ctx.font=`bold ${h*.03}px sans-serif`;ctx.fillText(view.speaker,w*.065,h*.79);
      ctx.fillStyle='#f1f5ff';ctx.font=`${h*.032}px sans-serif`;wrapText(view.text,w*.065,h*.84,w*.87,h*.043,3);
    }
    if(view.choices.length){ctx.font=`${h*.03}px sans-serif`;view.choices.slice(0,6).forEach((text,i)=>{const y=h*.18+i*h*.075;ctx.fillStyle='rgba(15,25,45,.9)';ctx.fillRect(w*.2,y,w*.6,h*.06);ctx.fillStyle='white';ctx.fillText(text,w*.23,y+h*.04,w*.54);});}
    ctx.restore();
  }
  function overlay(view) {
    const w=canvas.width,h=canvas.height;
    if($('stageGrid').checked){ctx.strokeStyle='rgba(180,205,255,.22)';ctx.lineWidth=1;ctx.beginPath();for(const p of [1/3,1/2,2/3]){ctx.moveTo(w*p,0);ctx.lineTo(w*p,h);ctx.moveTo(0,h*p);ctx.lineTo(w,h*p);}ctx.stroke();}
    const s=selected(), sp=s&&view.sprites.find(x=>x.tag===tag(s.image));
    if(sp){const x=w*sp.x/100,y=h*sp.y/100;ctx.strokeStyle='#ffd781';ctx.lineWidth=Math.max(2,w/600);ctx.beginPath();ctx.arc(x,y,Math.max(7,w/100),0,Math.PI*2);ctx.moveTo(x-20,y);ctx.lineTo(x+20,y);ctx.moveTo(x,y-20);ctx.lineTo(x,y+20);ctx.stroke();}
  }
  function draw(view) {ctx.clearRect(0,0,canvas.width,canvas.height);paint(view);overlay(view);}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;$('playFrame').disabled=false;}
  function select(id,redraw=true){stop();selectedId=id;window.storyEditor?.select(id, false);if(redraw)refresh();}
  function updateStatus(view) {
    const s=selected(),needed=[view.background,...view.sprites.map(x=>x.image)].filter(Boolean).filter(name=>!imageFor(name));
    $('stageStatus').textContent=!s?'添加步骤后点击步骤卡片查看画面。':needed.length?'未绑定或缺失：'+[...new Set(needed)].join('、'):'选择显示立绘或移动步骤，可在舞台上拖动当前立绘。';
    if(s?.type==='label')$('stageStatus').textContent='段落独立预览；本段之前的调用环境不在此处模拟。';
  }
  function refresh() {
    stop();
    const v=visual();
    if(!state.steps.some(s=>s.id===selectedId))selectedId=state.steps[0]?.id;
    if(canvas.width!==v.width)canvas.width=v.width;if(canvas.height!==v.height)canvas.height=v.height;
    $('stageWidth').value=v.width;$('stageHeight').value=v.height;
    const i=index(),s=selected();
    document.querySelectorAll('.step').forEach(node=>node.classList.toggle('selected',Number(node.dataset.index)===i));
    $('stageSelection').textContent=s?(i+1)+'. '+TYPE_NAMES[s.type]:'选择一个步骤';
    $('previousFrame').disabled=i<=0;$('nextFrame').disabled=i<0||i>=state.steps.length-1;
    $('playFrame').disabled=!s;
    const view=snapshot(i);updateStatus(view);
    draw(view);renderLibrary();
  }
  function play() {
    stop();const s=selected();if(!s)return;
    const before=snapshot(index()-1),after=snapshot(index());
    let seconds=['animation','wait'].includes(s.type)?number(s.duration):['scene','show','hide','window'].includes(s.type)&&s.transition!=='none'?number(s.duration):0;
    if(s.transition==='fade')seconds*=2;
    if(s.type==='wait'&&s.mode==='click')seconds=0;
    if(!seconds){draw(after);$('stageStatus').textContent='当前步骤静态预览；点击下一步继续。';return;}
    seconds=Math.min(60,Math.max(0,seconds));
    $('playFrame').disabled=true;$('stageStatus').textContent='正在预演当前步骤（最长 60 秒）…';
    const start=performance.now();
    const tick=now=>{
      const t=Math.min(1,(now-start)/(seconds*1000));
      const eased=s.easing==='ease'?t*t*(3-2*t):s.easing==='easein'?t*t:s.easing==='easeout'?1-(1-t)**2:t;
      if(s.type==='animation') {
        const view=clone(after),a=before.sprites.find(x=>x.tag===tag(s.image)),b=view.sprites.find(x=>x.tag===tag(s.image));
        if(a&&b){for(const k of ['x','y','scale','opacity','rotate'])b[k]=a[k]+(b[k]-a[k])*eased;
          if(s.mode==='opacity'&&s.opacityFrom!=='')b.opacity=number(s.opacityFrom)+(number(s.opacity)-number(s.opacityFrom))*eased;
          if(['bounce','shake'].includes(s.mode)){const amp=number(s.amplitude),points=s.mode==='bounce'?[0,-amp,0,-amp/2,0]:[0,-amp,amp,-amp/2,0],part=Math.min(3,Math.floor(t*4)),u=t*4-part;b[s.mode==='bounce'?'dy':'dx']=points[part]+(points[part+1]-points[part])*u;}
        }draw(view);
      } else if(s.type==='wait')draw(after);
      else {ctx.clearRect(0,0,canvas.width,canvas.height);if(s.transition==='fade'){paint(t<.5?before:after);ctx.fillStyle=`rgba(0,0,0,${1-Math.abs(t*2-1)})`;ctx.fillRect(0,0,canvas.width,canvas.height);}else{paint(before);paint(after,t);}overlay(after);}
      if(t<1)frame=requestAnimationFrame(tick);else{frame=0;$('playFrame').disabled=false;draw(after);$('stageStatus').textContent='本步预演完成。';}
    };frame=requestAnimationFrame(tick);
  }

  function point(ev){const r=canvas.getBoundingClientRect();return {x:(ev.clientX-r.left)*canvas.width/r.width,y:(ev.clientY-r.top)*canvas.height/r.height};}
  function hit(sp,p){const size=dimensions(sp),dx=p.x-canvas.width*sp.x/100-sp.dx,dy=p.y-canvas.height*sp.y/100-sp.dy,angle=-sp.rotate*Math.PI/180;
    const x=(dx*Math.cos(angle)-dy*Math.sin(angle))/(sp.scale*(sp.mirror?-1:1))+size.width*sp.anchorX/100,y=(dx*Math.sin(angle)+dy*Math.cos(angle))/sp.scale+size.height*sp.anchorY/100;
    return x>=0&&x<=size.width&&y>=0&&y<=size.height;
  }
  canvas.addEventListener('pointerdown',ev=>{
    const s=selected();if(!s)return;
    if(!((s.type==='show'&&s.placement==='custom')||(s.type==='animation'&&s.mode==='move'))){toast('请选择设置位置的显示步骤，或移动动画步骤，再拖动');return;}
    stop();const view=snapshot(index()),sp=view.sprites.find(x=>x.tag===tag(s.image)),p=point(ev);
    if(!sp||!hit(sp,p))return;
    drag={id:s.id,start:p,x:sp.x,y:sp.y,view,sp};canvas.setPointerCapture(ev.pointerId);ev.preventDefault();
  });
  canvas.addEventListener('pointermove',ev=>{if(!drag)return;const p=point(ev),round=n=>Math.round(n*10)/10,clamp=n=>Math.max(-100,Math.min(200,n));drag.sp.x=round(clamp(drag.x+(p.x-drag.start.x)/canvas.width*100));drag.sp.y=round(clamp(drag.y+(p.y-drag.start.y)/canvas.height*100));draw(drag.view);$('stageStatus').textContent=`位置 X ${drag.sp.x}% · Y ${drag.sp.y}%（松开保存，Esc 取消）`;});
  canvas.addEventListener('pointerup',ev=>{if(!drag)return;const s=state.steps.find(x=>x.id===drag.id);if(s){s.x=drag.sp.x;s.y=drag.sp.y;if(s.type==='show')s.preset='custom';}drag=null;canvas.releasePointerCapture(ev.pointerId);renderSteps();updateOutput();});
  canvas.addEventListener('pointercancel',()=>{drag=null;refresh();});
  canvas.addEventListener('keydown',ev=>{if(ev.key==='Escape'){drag=null;refresh();}});
  $('stepList').addEventListener('click',ev=>{const node=ev.target.closest('.step');if(node&&!ev.target.closest('button')&&!ev.target.classList.contains('step-mark'))select(state.steps[Number(node.dataset.index)]?.id);});
  $('stepList').addEventListener('focusin',ev=>{const node=ev.target.closest('.step');if(node)select(state.steps[Number(node.dataset.index)]?.id);});
  $('previousFrame').onclick=()=>select(state.steps[index()-1]?.id);
  $('nextFrame').onclick=()=>select(state.steps[index()+1]?.id);
  $('playFrame').onclick=play;$('stopFrame').onclick=()=>{stop();draw(snapshot(index()));$('stageStatus').textContent='已停止，显示本步结束状态。';};
  $('stageGrid').onchange=()=>draw(snapshot(index()));
  $('applyStageSize').onclick=()=>{const w=Number($('stageWidth').value),h=Number($('stageHeight').value);if(!Number.isInteger(w)||w<320||w>7680||!Number.isInteger(h)||h<180||h>4320){toast('画布宽 320～7680，高 180～4320，必须为整数');return;}visual().width=w;visual().height=h;updateOutput();};
  $('importImages').onclick=()=>$('imageFiles').click();$('importImageFolder').onclick=()=>$('imageFolder').click();
  for(const id of ['imageFiles','imageFolder'])$(id).onchange=async()=>{await importFiles($(id).files);$(id).value='';};
  window.visualEditor={refresh,select,snapshot,importFiles,readAsset:id=>stored(id),writeAsset:(id,blob)=>stored(id,blob), resetAssets(){missing.clear();libraryKey="";refresh();}};
  refresh();
})();
