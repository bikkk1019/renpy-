const { ROOT, OUT, entryUrl, launchBrowser } = require('./helpers/environment.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await launchBrowser();
 const url=entryUrl;
 try{
  const context=await browser.newContext({viewport:{width:1500,height:950}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('已保存'));
  await page.evaluate(()=>{window.confirm=()=>true;state=createState();state.steps=[{...defaultStep('menu'),menuText:'前进 -> chapter_a\n离开 -> missing'}, {...defaultStep('label'),name:'chapter_a'}, {...defaultStep('say'),text:'这里是第一章'},defaultStep('return')];syncStateUI();});
  assert.equal(await page.evaluate(()=>storyEditor.issues().filter(x=>x.level==='error').length),1);
  await page.getByText('工程工具',{exact:true}).click();await page.locator('#externalLabels').fill('missing');await page.locator('#externalLabels').press('Tab');
  assert.equal(await page.evaluate(()=>storyEditor.issues().filter(x=>x.level==='error').length),0);
  await page.locator('[data-chapter]').filter({hasText:'chapter_a'}).click();
  await page.evaluate(()=>{window.prompt=()=> 'chapter_renamed';});await page.locator('#renameChapter').click();
  assert.match(await page.evaluate(()=>state.steps[0].menuText),/chapter_renamed/);
  assert.equal(await page.evaluate(()=>state.steps[1].name),'chapter_renamed');
  await page.locator('#importDialogue').click();await page.locator('#dialogueInput').fill('e: 第一行\n旁白：第二行\n没有角色的第三行');await page.locator('#confirmDialogue').click();
  assert.equal(await page.evaluate(()=>state.steps.filter(s=>s.type==='say').length),4);
  await page.locator('#allChapters').click();await page.locator('#storySearch').fill('第二行');
  assert.equal(await page.locator('.step').count(),1);
  await page.locator('.step-title').click();await page.locator('[data-field="editorNote"]').fill('检查语气');await page.locator('[data-field="editorStatus"]').selectOption('todo');
  await page.locator('[data-field="bookmark"]').check();await page.locator('#storySearch').fill('');await page.locator('#onlyBookmarks').check();
  assert.equal(await page.locator('.step').count(),1);
  await page.locator('#selectPage').click();await page.locator('#copySelected').click();
  assert.equal(await page.evaluate(()=>state.steps.filter(s=>s.bookmark).length),2);
  await page.locator('#undoBtn').click();assert.equal(await page.evaluate(()=>state.steps.filter(s=>s.bookmark).length),1);
  await page.locator('#onlyBookmarks').uncheck();await page.locator('#storySearch').fill('第二行');await page.locator('#clearSelection').click();await page.locator('#selectPage').click();
  await page.locator('#moveDestination').selectOption('root');await page.locator('#moveSelected').click();
  assert.equal(await page.evaluate(()=>{const i=state.steps.findIndex(s=>s.text==='第二行');return storyEditor.sections().find(c=>i>=c.start&&i<c.end).id;}),'root');
  await page.locator('#allChapters').click();await page.locator('#storySearch').fill('');await page.locator('#replaceDialogue').click();await page.locator('#findText').fill('第一');await page.locator('#replaceText').fill('开场');await page.locator('#confirmReplace').click();
  assert.ok(await page.evaluate(()=>state.steps.some(s=>s.text==='开场行')));
  // Portable package must restore actual bytes into an empty browser database.
  const portable=await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=12;c.height=12;c.getContext('2d').fillRect(0,0,12,12);
   const blob=await new Promise(r=>c.toBlob(r));await visualEditor.importFiles([new File([blob],'background.png',{type:'image/png'})]);
   return await storyEditor.bundle();
  });
  const packagePath=path.join(OUT,'portable-test.rpe');fs.writeFileSync(packagePath,JSON.stringify(portable));
  const isolated=await browser.newContext(),p2=await isolated.newPage();p2.on('pageerror',e=>errors.push(e.message));await p2.goto(url);await p2.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('已保存'));
  await p2.locator('#fileProject').setInputFiles(packagePath);await p2.waitForFunction(()=>state.visual?.assets.length===1);await p2.waitForFunction(()=>document.querySelector('.asset-row img')?.src.startsWith('blob:'));
  assert.equal(await p2.evaluate(async()=>{const b=await visualEditor.readAsset(state.visual.assets[0].id);return b.type;}),'image/png');
  assert.notEqual(await p2.evaluate(()=>state.visual.assets[0].id),portable.project.visual.assets[0].id);
  const before=await p2.evaluate(()=>JSON.stringify(state));
  await p2.evaluate(async(data)=>{window.confirm=()=>true;data.files=[];await storyEditor.loadFile(new File([JSON.stringify(data)],'broken.rpe'));},portable);
  assert.equal(await p2.evaluate(()=>JSON.stringify(state)),before);
  await p2.evaluate(()=>storyEditor.flush());await isolated.close();

  // Static index scanning without modifying any game files.
  await page.evaluate(()=>{
   const text='define hero = Character("Hero")\nlabel external_scene:\n    return\nimage bg sky = "images/sky.png"';
   window.showDirectoryPicker=async()=>({name:'game',async *entries(){yield ['script.rpy',{kind:'file',async getFile(){return new File([text],'script.rpy');}}];}});
  });await page.locator('#linkGame').click();await page.waitForFunction(()=>state.gameIndex.labels.includes('external_scene'));
  assert.ok(await page.evaluate(()=>state.gameIndex.characters.includes('hero')));
  const zipWait=page.waitForEvent('download');await page.locator('#downloadChapters').click();const zip=await zipWait;await zip.saveAs(path.join(OUT,'chapters-test.zip'));
  // 20,000 dialogue steps across 200 chapters: render only one page and one inspector.
  const timing=await page.evaluate(()=>{
   const begin=performance.now();state=createState();state.projectTitle='长篇压力测试';state.steps=[];
   for(let c=0;c<200;c++){state.steps.push({...defaultStep('label'),name:'chapter_'+c});for(let i=0;i<100;i++)state.steps.push({...defaultStep('say'),text:'章节 '+c+' 第 '+i+' 句：这是一段用于验证长篇编辑性能的对白。'});}
   syncStateUI();return {ms:performance.now()-begin,count:state.steps.length,dom:document.querySelectorAll('.step').length};
  });
  assert.equal(timing.count,20200);assert.ok(timing.dom<=60);assert.ok(timing.ms<5000,JSON.stringify(timing));
  await page.locator('#allChapters').click();const start=Date.now();await page.locator('#storySearch').fill('章节 199 第 99 句');assert.equal(await page.locator('.step').count(),1);
  const searchMs=Date.now()-start;await page.locator('.step-title').click();await page.locator('[data-field="text"]').fill('长篇末尾已修改');await page.locator('[data-field="text"]').press('Tab');
  await page.evaluate(()=>{updateOutput();return storyEditor.flush();});
  await page.evaluate(()=>{localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(DRAFT_KEY+'-time');});await page.reload();
  await page.waitForFunction(()=>state.steps.length===20200);assert.equal(await page.evaluate(()=>state.steps.at(-1).text),'长篇末尾已修改');
  assert.ok(await page.locator('.step').count()<=60);
  await page.locator('#storySearch').fill('长篇末尾');await page.locator('.step-title').click();
  await page.screenshot({path:path.join(OUT,'longform-desktop.png'),fullPage:true});
  fs.writeFileSync(path.join(OUT,'performance-report.json'),JSON.stringify({steps:timing.count,renderMs:timing.ms,searchMs,renderedCards:timing.dom,portableAssets:portable.files.length},null,2));
  assert.deepEqual(errors,[]);await page.evaluate(()=>storyEditor.flush());
  console.log('PASS longform: chapter rename/ref updates, batch import, search/status/bookmarks, bulk copy/undo/move, replace, cross-profile bundle restore, corrupt-package rejection, game index, 20,200-step render and database recovery. '+JSON.stringify(timing));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
