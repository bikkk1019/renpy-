"use strict";

const TYPE_NAMES = { scene:"切换场景", show:"显示 / 更换立绘", hide:"隐藏立绘", animation:"立绘动画", audio:"声音控制", say:"台词 / 旁白", window:"对话框", wait:"等待", menu:"选项分支", label:"剧情段落", jump:"跳转 / 调用", condition:"条件跳转", variable:"变量赋值", return:"返回 / 结束", raw:"原始代码" };
const DEFAULTS = {
  scene:{image:"bg room", mode:"image", transition:"dissolve", duration:0.5},
  show:{image:"eileen happy", placement:"custom", preset:"custom", x:50,y:100,anchorX:50,anchorY:100,scale:1,opacity:1,rotate:0,mirror:"no",transition:"dissolve",duration:0.5},
  hide:{image:"eileen",transition:"dissolve",duration:0.5},
  animation:{image:"eileen",mode:"move",x:50,y:100,scale:1,opacity:1,opacityFrom:"",rotate:0,amplitude:30,duration:0.5,easing:"ease",wait:"yes"},
  audio:{channel:"music",action:"play",path:"audio/theme.ogg",loop:"default",volume:1,fade:0},
  say:{speaker:"e",text:""}, window:{mode:"hide",transition:"dissolve",duration:0.3},
  wait:{mode:"timed",duration:1,hard:"no"}, menu:{menuText:"选项一 -> branch_a\n选项二 -> branch_b"},
  label:{name:"branch_a"}, jump:{target:"branch_a",mode:"jump"},
  condition:{expression:"score >= 1",target:"branch_a",otherwise:""},
  variable:{name:"score",operator:"=",value:"0"}, return:{}, raw:{code:""}
};

function defaultStep(type) {
  if (!Object.hasOwn(DEFAULTS,type)) throw new Error("不支持的步骤：" + type);
  return {id:uid(),type,...DEFAULTS[type]};
}

function migrateStep(original, version) {
  if (!original || typeof original !== "object") return original;
  const s = {...original};
  if (["fade","move","bounce"].includes(s.type)) {
    const old = s.type;
    s.type = "animation"; s.easing = "linear"; s.wait = "no";
    s.mode = old === "fade" ? "opacity" : old;
    if (old === "fade") { s.opacityFrom = original.mode === "out" ? 1 : 0; s.opacity = original.mode === "out" ? 0 : 1; }
  }
  if (["music","music_stop","sound","voice"].includes(s.type)) {
    const old = s.type; s.type = "audio";
    s.channel = old.startsWith("music") ? "music" : old;
    s.action = old === "music_stop" ? "stop" : "play";
    s.path ??= old === "music_stop" ? "" : DEFAULTS.audio.path;
  }
  if (s.type === "show" && (!version || version < 3)) {
    // Old show steps used top-left anchors and no transition; keep that behavior.
    s.anchorX ??= 0; s.anchorY ??= 0; s.transition ??= "none";
  }
  return s;
}

const OPTIONS = {
  transition:[["none","无 / 立即"],["dissolve","淡入淡出 / 溶解"],["fade","黑场过渡（总时长为两倍）"],["wipeleft","向左擦除"],["wiperight","向右擦除"],["wipeup","向上擦除"],["wipedown","向下擦除"]],
  yesno:[["yes","是"],["no","否"]]
};

// Only active fields are rendered and validated, so hidden options cannot block export.
function fieldsFor(s) {
  const f=[];
  const text=(key,label)=>f.push({key,label,kind:"text"});
  const area=(key,label)=>f.push({key,label,kind:"textarea"});
  const num=(key,label,min=0,max=Infinity)=>f.push({key,label,kind:"number",min,max});
  const select=(key,label,options)=>f.push({key,label,kind:"select",options});
  const image=()=>text("image","图片名 / 已显示的立绘标签");
  const transition=(all=false)=>{select("transition","出现 / 消失方式",all?OPTIONS.transition:OPTIONS.transition.slice(0,2).concat(s.transition === "fade" ? [OPTIONS.transition[2]] : []));if(s.transition!=="none")num("duration","过渡时长（秒）");};
  if(s.type==="scene") {select("mode","场景操作",[["image","更换背景（同时清空立绘）"],["clear","清空画面"]]);if(s.mode!=="clear")image();transition(true);}
  if(s.type==="show") {
    image();select("placement","位置与外观",[["custom","设置位置与外观"],["keep","保留现有位置与外观（换表情）"]]);
    if(s.placement==="custom") {
      select("preset","站位预设",[["custom","自定义"],["left","左侧站立"],["center","居中站立"],["right","右侧站立"]]);
      num("x","水平位置 %（允许移出画面）",-100,200);num("y","垂直位置 %",-100,200);
      num("anchorX","立绘锚点 X %",0,100);num("anchorY","立绘锚点 Y %",0,100);
      num("scale","缩放",0.01,10);num("opacity","不透明度",0,1);num("rotate","旋转角度",-3600,3600);select("mirror","水平镜像",OPTIONS.yesno);
    }
    transition();
  }
  if(s.type==="hide"){image();transition();}
  if(s.type==="animation") {
    image();select("mode","动画类型",[["move","移动"],["transform","缩放 / 旋转 / 透明度"],["bounce","跳动"],["shake","左右抖动"],["opacity","透明度变化（兼容旧淡入淡出）"]]);
    if(s.mode==="move"){num("x","目标水平位置 %",-100,200);num("y","目标垂直位置 %",-100,200);}
    if(s.mode==="transform"){num("scale","目标缩放",0.01,10);num("rotate","目标旋转角度",-3600,3600);}
    if(["transform","opacity"].includes(s.mode))num("opacity","目标不透明度",0,1);
    if(s.mode==="opacity")text("opacityFrom","起始不透明度（留空沿用当前值）");
    if(["bounce","shake"].includes(s.mode))num("amplitude","幅度（像素）",0,2000);
    num("duration","动画总时长（秒）");select("easing","速度曲线",[["linear","匀速"],["ease","缓入缓出"],["easein","缓入"],["easeout","缓出"]]);
    select("wait","等待动画结束再继续",OPTIONS.yesno);
  }
  if(s.type==="audio") {
    select("channel","声音通道",[["music","背景音乐"],["sound","音效"],["voice","语音（下一句台词）"]]);
    select("action","操作",s.channel==="voice"?[["play","播放"],["stop","停止"]]:[["play","播放 / 替换"],["queue","排队播放"],["stop","停止"],["volume","调整通道音量"]]);
    if(["play","queue"].includes(s.action))text("path","音频路径（相对于 game）");
    if(s.channel!=="voice") {
      if(["play","queue"].includes(s.action))select("loop","循环",[["default","通道默认（音乐循环，音效不循环）"],["yes","循环"],["no","不循环"]]);
      if(s.action!=="stop")num("volume",s.action==="volume"?"通道音量（影响后续播放）":"本次音量",0,1);
      if(s.action!=="queue")num("fade",s.action==="stop"?"淡出时长（秒）":s.action==="volume"?"音量渐变时长（秒）":"淡入时长（秒）");
    }
  }
  if(s.type==="say"){text("speaker","角色变量（旁白留空）");area("text","台词（支持 Ren'Py 文本标签）");}
  if(s.type==="window"){select("mode","对话框",[["show","显示"],["hide","隐藏"],["auto","恢复自动显示"]]);if(s.mode!=="auto")transition();}
  if(s.type==="wait"){select("mode","等待方式",[["timed","等待指定时间"],["click","等待玩家点击"]]);if(s.mode==="timed"){num("duration","等待时间（秒）");select("hard","禁止点击提前结束",OPTIONS.yesno);}}
  if(s.type==="menu")area("menuText","每行：选项文字 -> 目标段落 | 条件 | 效果；只填文字则继续执行");
  if(s.type==="label")text("name","新段落 label 名（上一段会自动补 return）");
  if(s.type==="jump"){select("mode","执行方式",[["jump","跳转（不返回）"],["call","调用（return 后回到下一步）"]]);text("target","目标段落 label");}
  if(s.type==="condition"){text("expression","条件表达式，例如 score >= 1");text("target","满足条件时跳转到");text("otherwise","不满足时跳转到（留空继续下一步）");}
  if(s.type==="variable"){text("name","变量名");select("operator","操作",[["=","赋值"],["+=","增加"],["-=","减少"]]);text("value","值 / 表达式，例如 0、True、\"文字\"");}
  if(s.type==="raw")area("code","原始 Ren'Py 代码（按当前段落缩进）");
  return f;
}

function renderStep(s,index) {
  const controls=[['duplicate','复制'],['up','↑'],['down','↓'],['del','×']].map(([act,title])=>'<button class="mini" data-act="'+act+'" data-index="'+index+'" aria-label="'+title+'第 '+(index+1)+' 步">'+title+'</button>').join('');
  const body=fieldsFor(s).map(f=>{
    if(f.kind==='select')return fieldSelect(f.label,index,f.key,s[f.key],f.options.map(([value,label])=>({value,label})));
    if(f.kind==='textarea')return '<label>'+f.label+'<textarea rows="4" data-index="'+index+'" data-field="'+f.key+'">'+escapeHtml(s[f.key])+'</textarea></label>';
    const lists={target:'labelSuggestions',otherwise:'labelSuggestions',image:'imageSuggestions',speaker:'speakerSuggestions',path:'audioSuggestions'};
    return fieldInput(f.label,index,f.key,s[f.key],f.kind,f.kind==='number'?'min="'+f.min+'" '+(Number.isFinite(f.max)?'max="'+f.max+'" ':'')+'step="any"':(lists[f.key]?'list="'+lists[f.key]+'"':''));
  }).join('');
  const notes={show:"换表情时选择「保留现有位置与外观」。淡入已包含在本步骤中。",hide:"淡出完成后移除立绘；无需再添加透明度动画。",animation:"作用于已显示的立绘。等待关闭时，可与后续台词同步进行；同一立绘的连续动画建议开启等待。",label:"从这里开始新的剧情段落；通过选项、跳转或调用进入。",variable:"增加 / 减少前请先赋初值，或在游戏中用 default 定义变量。",return:"被 call 调用时返回调用处；顶层 return 结束当前剧情。",audio:"音乐、音效、语音分属独立通道；语音会跟随下一句台词。"};
  return '<div class="step" data-index="'+index+'"><div class="step-head"><span class="step-title">'+(index+1)+'. '+TYPE_NAMES[s.type]+'</span>'+controls+'</div><div class="step-body">'+body+(notes[s.type]?'<div class="small">'+notes[s.type]+'</div>':'')+'</div></div>';
}

function validateProject() {
  const errors=[], names=new Set();
  const labelId=v=>/^[\p{L}_][\p{L}\p{N}_]*$/u.test(String(v).trim());
  if(state.wrapLabel){if(!labelId(state.labelName))errors.push("主 label 名无效，请使用字母、中文、数字或下划线，不能以数字开头");names.add(String(state.labelName).trim());}
  state.steps.forEach((s,i)=>{
    const fail=m=>errors.push("第 "+(i+1)+" 步："+m);
    fieldsFor(s).forEach(f=>{
      const v=s[f.key];
      if(f.kind==='number'&&(String(v??'').trim()===''||!Number.isFinite(Number(v))||Number(v)<f.min||Number(v)>f.max))fail(f.label+"超出有效范围");
      if(f.kind==='select'&&!f.options.some(o=>o[0]===v))fail(f.label+"选项无效");
      if(f.kind==='text'&&/[\r\n]/.test(String(v)))fail(f.label+"必须为单行");
    });
    if('image' in s&&!(s.type==='scene'&&s.mode==='clear')&&!/^[\p{L}\p{N}_-]+(?: +[\p{L}\p{N}_-]+)*$/u.test(String(s.image).trim()))fail("图片名无效");
    if(s.type==='audio'&&['play','queue'].includes(s.action)&&!String(s.path).trim())fail("请填写音频路径");
    if(s.type==='say'&&s.speaker&&!identifier(s.speaker))fail("角色变量无效");
    if(s.type==='label') {const name=String(s.name).trim();if(!labelId(name))fail("段落名无效");if(names.has(name))fail("段落名重复："+name);names.add(name);if(!state.wrapLabel)fail("使用剧情段落时请勾选包裹 label");}
    if(['jump','condition'].includes(s.type)&&!identifier(s.target))fail("跳转目标无效");
    if(s.type==='condition'&&(!String(s.expression).trim()||(s.otherwise&&!identifier(s.otherwise))))fail("条件或否则跳转目标无效");
    if(s.type==='variable'&&(!labelId(s.name)||!String(s.value).trim()))fail("变量名或赋值表达式无效");
    if(s.type==='animation'&&s.mode==='opacity'&&s.opacityFrom!==''&&(!Number.isFinite(Number(s.opacityFrom))||Number(s.opacityFrom)<0||Number(s.opacityFrom)>1))fail("起始透明度应为空或 0～1");
    if(s.type==='menu') {
      const rows=String(s.menuText||'').split('\n').map(x=>x.trim()).filter(Boolean);
      if(!rows.length)fail("至少需要一个选项");
      rows.forEach((row,n)=>{const parts=row.split('|'), arrow=parts[0].split('->');if(parts.length>3||arrow.length>2||!arrow[0].trim()||(arrow.length===2&&!identifier(arrow[1])))fail("选项 "+(n+1)+" 格式错误或缺少目标");});
    }
  });
  return errors;
}

function stepToLines(s,b) {
  const q=v=>'"'+rpyString(v)+'"', n=v=>Number(v)||0, image=String(s.image||'').trim(), lines=[];
  const trans=()=>transitionExpr(s.transition,s.duration);
  if(s.type==='scene')return s.mode==='clear'?[b+'scene',...(trans()?[b+'with '+trans()]:[])]:[b+'scene '+image+(trans()?' with '+trans():'')];
  if(s.type==='show') {
    lines.push(b+'show '+image+(s.placement==='keep'?'':':'));
    if(s.placement!=='keep')lines.push(...['xpos '+position(s.x),'ypos '+position(s.y),'xanchor '+position(s.anchorX),'yanchor '+position(s.anchorY),'zoom '+n(s.scale),'alpha '+n(s.opacity),'rotate '+n(s.rotate),'xzoom '+(s.mirror==='yes'?-1:1)].map(x=>b+'    '+x));
    if(trans())lines.push(b+'with '+trans());
  } else if(s.type==='hide')lines.push(b+'hide '+image+(trans()?' with '+trans():''));
  else if(s.type==='animation') {
    lines.push(b+'show '+image+':');const atl=x=>lines.push(b+'    '+x), tween=(time,props)=>atl(s.easing+' '+time+' '+props), d=n(s.duration);
    if(s.mode==='move')tween(d,'xpos '+position(s.x)+' ypos '+position(s.y));
    if(s.mode==='transform')tween(d,'zoom '+n(s.scale)+' rotate '+n(s.rotate)+' alpha '+n(s.opacity));
    if(s.mode==='opacity'){if(s.opacityFrom!=='')atl('alpha '+n(s.opacityFrom));tween(d,'alpha '+n(s.opacity));}
    if(['bounce','shake'].includes(s.mode)) {const a=n(s.amplitude);const values=s.mode==='bounce'?[-a,0,-a/2,0]:[-a,a,-a/2,0];values.forEach(v=>tween(d/4,(s.mode==='bounce'?'yoffset ':'xoffset ')+v));}
    if(s.wait==='yes')lines.push(b+'$ renpy.pause('+d+', hard=True)');
  } else if(s.type==='audio') {
    const c=s.channel, a=s.action;
    if(a==='stop')lines.push(b+'stop '+c+(c==='voice'?'':' fadeout '+n(s.fade)));
    else if(c==='voice')lines.push(b+'voice '+q(s.path));
    else if(a==='volume')lines.push(b+'$ renpy.music.set_volume('+n(s.volume)+', delay='+n(s.fade)+', channel='+q(c)+')');
    else lines.push(b+a+' '+c+' '+q(s.path)+(s.loop==='default'?'':s.loop==='yes'?' loop':' noloop')+(a==='play'?' fadein '+n(s.fade):'')+' volume '+n(s.volume));
  } else if(s.type==='say')lines.push(b+(String(s.speaker).trim()?String(s.speaker).trim()+' ':'')+q(s.text));
  else if(s.type==='window')lines.push(b+'window '+s.mode+(s.mode!=='auto'&&trans()?' '+trans():''));
  else if(s.type==='wait')lines.push(b+(s.mode==='click'?'pause':s.hard==='yes'?'$ renpy.pause('+n(s.duration)+', hard=True)':'pause '+n(s.duration)));
  else if(s.type==='menu') {lines.push(b+'menu:');parseMenuText(s.menuText).forEach(c=>{lines.push(b+'    '+q(c.text)+(c.condition?' if '+c.condition:'')+':');if(c.effect)lines.push(b+'        $ '+c.effect);if(c.target)lines.push(b+'        jump '+c.target);if(!c.effect&&!c.target)lines.push(b+'        pass');});}
  else if(s.type==='jump')lines.push(b+s.mode+' '+String(s.target).trim());
  else if(s.type==='condition'){lines.push(b+'if '+s.expression+':',b+'    jump '+String(s.target).trim());if(s.otherwise)lines.push(b+'else:',b+'    jump '+String(s.otherwise).trim());}
  else if(s.type==='variable')lines.push(b+'$ '+s.name+' '+s.operator+' '+s.value);
  else if(s.type==='return')lines.push(b+'return');
  else if(s.type==='raw')lines.push(...String(s.code).split('\n').map(l=>b+l));
  return lines;
}

function generateScript() {
  const lines=[], base=state.wrapLabel?'    ':'';
  if(state.wrapLabel)lines.push('label '+String(state.labelName).trim()+':');
  let bodyStart=lines.length, lastType='';
  function finish(boundary) {
    const content=lines.slice(bodyStart).some(l=>l.trim()&&!l.trim().startsWith('#'));
    if(boundary) {if(lastType!=='return'&&lastType!=='jump')lines.push(base+'return');}
    else if(state.wrapLabel&&!content)lines.push(base+'pass');
  }
  for(const s of state.steps) {
    if(s.type==='label'){finish(true);lines.push('','label '+String(s.name).trim()+':');bodyStart=lines.length;lastType='';}
    else {lines.push(...stepToLines(s,base));lastType=s.type==='jump'&&s.mode==='call'?'call':s.type;}
  }
  finish(state.steps.some(s=>s.type==='label'));
  return lines.join('\n')+'\n';
}
