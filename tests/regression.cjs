const { ROOT, OUT, entryUrl, launchBrowser } = require('./helpers/environment.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = ROOT;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(entryUrl);
    await page.locator('#compactMode').uncheck();
    await page.locator('#insertPosition').selectOption('end');
    await page.locator('[data-add="wait"]').click();
    await page.locator('[data-field="duration"]').fill('0');
    await page.waitForFunction(() => document.getElementById('outputArea').value.includes('pause 0\n'));
    await page.locator('[data-act="duplicate"]').click();
    assert.equal(await page.locator('.step').count(), 2);
    await page.locator('#undoBtn').click();
    assert.equal(await page.locator('.step').count(), 1);
    await page.locator('#redoBtn').click();
    assert.equal(await page.locator('.step').count(), 2);
    await page.evaluate(() => storyEditor.flush());
    await page.reload();
    assert.equal(await page.locator('.step').count(), 2);
    assert.match(await page.locator('#outputArea').inputValue(), /pause 0\n/);

    const checks = await page.evaluate(() => {
      const failures = [];
      function check(ok, name) { if (!ok) failures.push(name); }
      for (const type of ['move', 'fade', 'bounce', 'wait', 'music', 'music_stop']) {
        const migrated = migrateStep({ type, duration: 0, fade: 0, image: 'eileen happy', mode: 'in' }, 2);
        const step = { ...defaultStep(migrated.type), ...migrated };
        const code = stepToLines(step, '').join('\n');
        check(!/linear 0\.5|fadein 1|fadeout 1|pause 1|linear 0\.01/.test(code), type + ' zero');
      }
      check(stepToLines({ ...defaultStep('show'), x: 100, y: 0 }, '').join('\n').includes('xpos 1.0\n    ypos 0.0'), 'percentage positions');
      check(stepToLines({ ...defaultStep('menu'), menuText: '继续' }, '').join('\n').includes('        pass'), 'menu pass');
      state = createState();
      check(generateScript().includes('    pass'), 'empty label');
      state.steps = [{ ...defaultStep('raw'), code: '# comment only' }];
      check(generateScript().includes('    pass'), 'comment-only label');
      state.steps = [defaultStep('menu')];
      state.steps[0].menuText = '';
      check(validateProject().length > 0, 'empty menu blocked');
      state.steps[0].menuText = '坏选项 ->';
      check(validateProject().length > 0, 'missing target blocked');
      state.steps = [{ ...defaultStep('wait'), duration: '-1' }];
      check(validateProject().length > 0, 'negative duration blocked');
      state.steps[0].duration = '';
      check(validateProject().length > 0, 'empty numeric blocked');
      state.steps = [];
      state.labelName = '';
      check(validateProject().length > 0, 'empty label blocked');
      state.wrapLabel = false;
      check(validateProject().length === 0, 'snippet without label');
      try { normalizeProject({}); failures.push('invalid import accepted'); } catch (_) {}
      try { normalizeProject({ steps: [{type:'<script>'}] }); failures.push('unknown type accepted'); } catch (_) {}
      check(normalizeProject({ steps: [{type:'wait'}] }).steps[0].duration === 1, 'old project defaults');
      check(rpyString('"\\\n你好') === '\\"\\\\\\n你好', 'string escaping');
      const old = normalizeProject({version:2,steps:[{type:'fade',mode:'out',image:'eileen happy',duration:0},{type:'show',image:'eileen happy',x:50,y:50,scale:1,opacity:1},{type:'music_stop',fade:2}]});
      check(old.steps[0].type==='animation' && old.steps[0].opacity===0 && old.steps[0].opacityFrom===1 && old.steps[0].wait==='no', 'legacy fade migration');
      check(old.steps[1].transition==='none' && old.steps[1].anchorY===0, 'legacy show placement');
      check(old.steps[2].channel==='music' && old.steps[2].action==='stop', 'legacy audio migration');
      check(stepToLines(defaultStep('hide'),'').join('\n').startsWith('hide eileen with Dissolve'), 'hide actually removes image');
      check(stepToLines({...defaultStep('show'),placement:'keep'},'').join('\n')==='show eileen happy\nwith Dissolve(0.5)', 'expression preserves transform');
      check(stepToLines(defaultStep('animation'),'').some(l=>l.includes('hard=True')), 'animation waits');
      check(!stepToLines({...defaultStep('animation'),wait:'no'},'').some(l=>l.includes('pause')), 'animation concurrent');
      state = createState(); state.steps=[defaultStep('say'),defaultStep('label'),defaultStep('label')];
      check(validateProject().some(x=>x.includes('重复')), 'duplicate labels');
      check(generateScript().includes('    return\n\nlabel branch_a:'), 'no label fallthrough');
      state.steps=[{...defaultStep('audio'),action:'stop',path:'',volume:'bad'}];
      check(validateProject().length===0,'inactive audio fields ignored');
      return failures;
    });
    assert.deepEqual(checks, []);

    // Exercise the actual write handler with File System Access stand-ins.
    const writes = await page.evaluate(async () => {
      state = createState(); state.steps = [defaultStep('wait')]; syncStateUI();
      const files = { 'performance_1.rpy': 'original script' };
      const game = { name: 'game', async getFileHandle(name, opts) {
        if (!(name in files) && !opts?.create) throw new DOMException('missing', 'NotFoundError');
        return { async getFile() { return new Blob([files[name]]); }, async createWritable() {
          return { async write(data) { files[name] = typeof data === 'string' ? data : await data.text(); }, async close() {} };
        }};
      }};
      window.showDirectoryPicker = async () => ({ name:'ceshi', async getDirectoryHandle(name) { if (name !== 'game') throw Error(name); return game; } });
      window.confirm = () => false;
      await writeToProject();
      const cancelled = files['performance_1.rpy'] === 'original script' && Object.keys(files).length === 1;
      window.confirm = () => true;
      await writeToProject();
      const backup = Object.keys(files).find(n => n.endsWith('.bak'));
      return { cancelled, backup: files[backup], content: files['performance_1.rpy'] };
    });
    assert.equal(writes.cancelled, true);
    assert.equal(writes.backup, 'original script');
    assert.match(writes.content, /pause 1/);

    await page.locator('[data-add="show"]').click();
    await page.locator('.step').last().locator('[data-field="preset"]').selectOption('left');
    assert.equal(await page.locator('.step').last().locator('[data-field="x"]').inputValue(), '20');
    await page.locator('.step').last().locator('[data-field="placement"]').selectOption('keep');
    assert.equal(await page.locator('.step').last().locator('[data-field="x"]').count(), 0);
    assert.equal(await page.locator('[data-add="fade"]').count(), 0);
    await page.locator('[data-add="audio"]').click();
    await page.locator('.step').last().locator('[data-field="action"]').selectOption('queue');
    await page.locator('.step').last().locator('[data-field="channel"]').selectOption('voice');
    assert.equal(await page.locator('.step').last().locator('[data-field="action"]').inputValue(), 'play');
    await page.locator('.step').last().locator('[data-field="action"]').selectOption('stop');
    assert.equal(await page.locator('.step').last().locator('[data-field="path"]').count(), 0);

    // Generate a representative fixture for the installed Ren'Py engine.
    const script = await page.evaluate(() => {
      state = createState(); state.labelName = 'start';
      state.steps = [
        {...defaultStep('variable'),name:'score',value:'0'},
        defaultStep('scene'), defaultStep('show'),
        {...defaultStep('show'),placement:'keep'},
        ...['move','transform','bounce','shake','opacity'].map(mode=>({...defaultStep('animation'),mode})),
        defaultStep('hide'),
        ...['music','sound','voice'].flatMap(channel=> (channel==='voice'?['play','stop']:['play','queue','volume','stop']).map(action=>({...defaultStep('audio'),channel,action,path:'audio/test.wav'}))),
        ...['show','hide','auto'].map(mode=>({...defaultStep('window'),mode})),
        defaultStep('wait'), {...defaultStep('wait'),mode:'click'}, {...defaultStep('wait'),hard:'yes'},
        {...defaultStep('say'),text:'引号 "、反斜杠 \\ 和中文\n第二行'},
        {...defaultStep('jump'),mode:'call',target:'helper'},
        {...defaultStep('condition'),expression:'score > 0',target:'branch_a',otherwise:''},
        {...defaultStep('menu'),menuText:'去 A -> branch_a | True | score = 1\n去 B -> branch_b'},
        {...defaultStep('label'),name:'branch_a'}, defaultStep('say'),
        {...defaultStep('label'),name:'branch_b'}, {...defaultStep('scene'),mode:'clear'}, defaultStep('return'),
        {...defaultStep('label'),name:'helper'}, {...defaultStep('variable'),operator:'+=',value:'1'},defaultStep('return')
      ];
      if(validateProject().length) throw Error(validateProject().join(';'));
      syncStateUI();
      return generateScript();
    });
    const game = path.join(OUT, 'renpy-fixture', 'game');
    fs.mkdirSync(game, { recursive: true });
    // Self-contained silent WAV fixture: 1 second of 16-bit mono PCM.
    const wav = Buffer.alloc(44 + 44100);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(44100, 40);
    fs.mkdirSync(path.join(game, 'audio'), {recursive:true});
    fs.writeFileSync(path.join(game, 'audio/test.wav'), wav);
    fs.writeFileSync(path.join(game, 'script.rpy'), 'define e = Character("艾琳")\ndefault score = 0\nimage bg room = Solid("#334455")\nimage eileen happy = Solid("#abcdef")\n' + script);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#saveProjectBtn').click();
    const download = await downloadPromise;
    const saved = path.join(OUT, 'exported-project.json');
    await download.saveAs(saved);
    await page.locator('#clearBtn').click();
    assert.equal(await page.locator('.step').count(), 0);
    await page.locator('#fileProject').setInputFiles(saved);
    await page.waitForFunction(() => state.steps.some(s => s.type === 'label'));
    assert.equal(await page.locator('#outputArea').inputValue(), script);
    await page.screenshot({path:path.join(OUT, 'desktop.png'), fullPage:true});
    await page.setViewportSize({width:750, height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path:path.join(OUT, 'narrow.png'), fullPage:true});
    assert.deepEqual(errors, []);
    console.log('PASS: UI editing, undo/redo, reload recovery, numeric boundaries, validation, import/export, protected writes, responsive layout; no browser errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
