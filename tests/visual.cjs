const { ROOT, OUT, entryUrl, launchBrowser } = require('./helpers/environment.cjs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await launchBrowser();
  try {
    const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(entryUrl);
    await page.locator('#compactMode').uncheck();
    await page.locator('#insertPosition').selectOption('end');
    await page.evaluate(async()=>{
      state=createState();state.steps=[defaultStep('scene'),defaultStep('show'),{...defaultStep('say'),text:'这里是可视化舞台。拖动立绘即可调整站位。'}, {...defaultStep('animation'),image:'eileen happy',x:75,duration:.15}, defaultStep('hide')];syncStateUI();
      const files=[];
      for(const [name,w,h,color] of [['bg room.png',1280,720,'#203b50'],['eileen happy.png',300,540,'#b28de0']]) {
        const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);
        x.fillStyle='#ffffff';x.font='30px sans-serif';x.fillText(name,20,80);
        files.push(new File([await new Promise(r=>c.toBlob(r))],name,{type:'image/png'}));
      }
      await visualEditor.importFiles(files);
      visualEditor.select(state.steps[1].id);
    });
    assert.equal(await page.locator('.asset-row').count(),2);
    assert.equal(await page.locator('.step.selected').getAttribute('data-index'),'1');
    const box=await page.locator('#stageCanvas').boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.7);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:8});await page.mouse.up();
    const moved=await page.evaluate(()=>({x:state.steps[1].x,y:state.steps[1].y,code:generateScript()}));
    assert.ok(Math.abs(moved.x-60)<.5);assert.ok(Math.abs(moved.y-90)<.5);assert.match(moved.code,/xpos 0\.6/);
    await page.locator('#undoBtn').click();
    assert.equal(await page.evaluate(()=>state.steps[1].x),50);
    await page.locator('#redoBtn').click();
    assert.ok(Math.abs(await page.evaluate(()=>state.steps[1].x)-60)<.5);
    await page.evaluate(()=>visualEditor.select(state.steps[3].id));
    await page.locator('#playFrame').click();await page.waitForFunction(()=>document.getElementById('stageStatus').textContent==='本步预演完成。');
    assert.equal(await page.evaluate(()=>visualEditor.snapshot(3).sprites[0].x),75);
    assert.equal(await page.evaluate(()=>visualEditor.snapshot(4).sprites.length),0);
    await page.locator('#stageWidth').fill('1920');await page.locator('#stageHeight').fill('1080');await page.locator('#applyStageSize').click();
    assert.equal(await page.locator('#stageCanvas').getAttribute('width'),'1920');
    await page.evaluate(() => storyEditor.flush());
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.asset-row img[src]').length===2);
    assert.equal(await page.locator('#stageCanvas').getAttribute('width'),'1920');
    await page.evaluate(()=>{visualEditor.select(state.steps[1].id);document.getElementById('assetDetails').open=true;});
    await page.locator('.asset-row input').last().fill('eileen new');await page.locator('.asset-row input').last().press('Tab');
    await page.locator('.asset-row').last().getByText('用于当前步骤').click();
    assert.equal(await page.evaluate(()=>state.steps[1].image),'eileen new');
    await page.locator('#stageWidth').fill('1280');await page.locator('#stageHeight').fill('720');await page.locator('#applyStageSize').click();
    await page.evaluate(()=>visualEditor.select(state.steps[2].id));
    await page.screenshot({path:path.join(OUT,'visual-desktop.png'),fullPage:true});
    await page.setViewportSize({width:750,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('PASS visual: image import/binding, canvas drag, script coordinates, undo/redo, animation, hide, resolution, IndexedDB reload, rename, responsive layout.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
