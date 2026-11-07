'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(process.env.GVE_ROOT || path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.GVE_TEST_OUTPUT || path.join(__dirname, '../artifacts'));
fs.mkdirSync(OUT, { recursive: true });
const candidates = [
  process.env.EDGE_PATH,
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);
const executablePath = candidates.find(file => fs.existsSync(file));
if (!executablePath) throw new Error('找不到 Edge。请安装 Edge 或设置 EDGE_PATH 为浏览器可执行文件路径。');

module.exports = {
  ROOT, OUT,
  entryUrl: pathToFileURL(path.join(ROOT, 'renpy_performance_maker.html')).href,
  launchBrowser: () => chromium.launch({ executablePath, headless: true }),
};
