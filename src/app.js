"use strict";

let state = createState();
const el = {};
const DRAFT_KEY = "renpy-performance-draft-v2";
let history = [], historyIndex = -1, restoring = false;

function normalizeProject(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.steps)) throw new Error("请选择生成器保存的工程 JSON（需要 steps 数组）");
  if (data.steps.length > 30000) throw new Error("工程最多支持 30000 个步骤");
  const usedIds = new Set();
  const steps = data.steps.map((original, index) => {
    const step = migrateStep(original, data.version);
    if (!step || !Object.hasOwn(TYPE_NAMES, step.type)) throw new Error("第 " + (index + 1) + " 步类型不支持");
    const result = defaultStep(step.type);
    Object.keys(result).forEach(key => {
      if (key === "id" || key === "type" || step[key] == null) return;
      if (!["string", "number", "boolean"].includes(typeof step[key])) throw new Error("第 " + (index + 1) + " 步字段格式错误：" + key);
      result[key] = step[key];
    });
    if (typeof step.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(step.id) && !usedIds.has(step.id)) result.id = step.id;
    usedIds.add(result.id);
    result.editorNote = String(step.editorNote || "");
    result.editorStatus = ["draft", "todo", "reviewed"].includes(step.editorStatus) ? step.editorStatus : "draft";
    result.bookmark = step.bookmark === true;
    return result;
  });
  return { version: 4, labelName: String(data.labelName ?? "performance_1"), wrapLabel: data.wrapLabel !== false, steps, visual: normalizeVisual(data.visual), projectTitle: String(data.projectTitle || "未命名故事"), externalLabels: Array.isArray(data.externalLabels) ? data.externalLabels.filter(x => typeof x === "string") : [], gameIndex: normalizeGameIndex(data.gameIndex) };
}

function normalizeGameIndex(v) {
  const result = { source: String(v?.source || "") };
  for (const key of ["labels", "characters", "images", "audio"]) result[key] = Array.isArray(v?.[key]) ? v[key].filter(x => typeof x === "string").slice(0,50000) : [];
  return result;
}

function normalizeVisual(v) {
  const width = Number(v?.width), height = Number(v?.height);
  return { width: Number.isInteger(width) && width >= 320 && width <= 7680 ? width : 1280,
    height: Number.isInteger(height) && height >= 180 && height <= 4320 ? height : 720,
    assets: Array.isArray(v?.assets) ? v.assets.filter(a => a && typeof a.id === "string" && typeof a.name === "string").slice(0,1000).map(a => ({id:a.id,name:a.name,fileName:String(a.fileName||"")})) : [] };
}

function identifier(value) {
  return /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*$/u.test(String(value).trim());
}

function checkedScript() {
  const errors = validateProject().concat(window.storyEditor?.issues().filter(x => x.level === "error").map(x => x.message) || []);
  if (errors.length) { toast("请先修正右侧提示的问题", 3500); return null; }
  return generateScript();
}

function syncStateUI() {
  el.labelName.value = state.labelName;
  el.wrapLabel.checked = state.wrapLabel;
  renderSteps();
  updateOutput();
}

function travelHistory(delta) {
  const next = historyIndex + delta;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  state = JSON.parse(history[historyIndex]);
  restoring = true;
  syncStateUI();
  restoring = false;
}

function remember() {
  const snapshot = JSON.stringify(state);
  if (!restoring && snapshot !== history[historyIndex]) {
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    while (history.length > 3 && (history.length > 100 || history.reduce((sum, item) => sum + item.length * 2, 0) > 24 * 1024 * 1024)) history.shift();
    historyIndex = history.length - 1;
  }
  el.undoBtn.disabled = historyIndex <= 0;
  el.redoBtn.disabled = historyIndex >= history.length - 1;
  if (window.storyEditor) { window.storyEditor.persist(snapshot); return; }
  try {
    localStorage.setItem(DRAFT_KEY, snapshot);
    el.saveStatus.textContent = state.steps.length + " 个步骤 · 草稿已自动保存到当前浏览器";
  } catch (_) {
    el.saveStatus.textContent = "自动保存不可用，请点击「保存工程」下载 JSON";
  }
}

function uid() {
  return "s_" + Math.random().toString(36).slice(2, 9);
}

function createState() {
  return {
    version: 4,
    projectTitle: "未命名故事",
    externalLabels: [],
    gameIndex: normalizeGameIndex(),
    labelName: "performance_1",
    wrapLabel: true,
    steps: []
  };
}

function initEl() {
  [
    "stepList", "wrapLabel", "labelName", "outputArea",
    "generateBtn", "copyBtn", "downloadBtn", "writeProjectBtn",
    "saveProjectBtn", "loadProjectBtn", "clearBtn", "fileProject", "toast",
    "undoBtn", "redoBtn", "validation", "saveStatus"
  ].forEach(id => { el[id] = document.getElementById(id); });
}

function toast(message, ms) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.toast.classList.remove("show"), ms || 2200);
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rpyString(str) {
  return String(str == null ? "" : str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function renderSteps() {
  if (window.storyEditor) { window.storyEditor.render(); return; }
  el.stepList.innerHTML = state.steps.length ? state.steps.map((step, index) => renderStep(step, index)).join("") : '<div class="empty">从左侧添加场景、台词或演出步骤。<br>脚本会实时生成，编辑会自动保存。</div>';
}

function fieldInput(label, index, field, value, type, extra) {
  return '<label>' + label + '<input type="' + (type || "text") + '" data-index="' + index + '" data-field="' + field + '" value="' + escapeHtml(value == null ? "" : value) + '" ' + (extra || "") + '></label>';
}

function fieldSelect(label, index, field, value, options) {
  const opts = options.map(item => {
    const selected = String(item.value) === String(value) ? " selected" : "";
    return '<option value="' + escapeHtml(item.value) + '"' + selected + '>' + escapeHtml(item.label) + '</option>';
  }).join("");
  return '<label>' + label + '<select data-index="' + index + '" data-field="' + field + '">' + opts + '</select></label>';
}

function transitionExpr(type, duration) {
  const d = Math.max(0, Number(duration) || 0);
  if (type === "none") return "";
  if (type === "fade") return "Fade(" + d + ", 0.0, " + d + ")";
  if (type === "dissolve") return "Dissolve(" + d + ")";
  return type;
}

function parseMenuText(text) {
  return String(text || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(part => part.trim());
    const first = parts[0] || "";
    const arrow = first.split("->").map(part => part.trim());
    return {
      text: arrow[0] || "选项",
      target: arrow[1] || "",
      condition: parts[1] || "",
      effect: parts[2] || ""
    };
  });
}

function position(value) {
  const n = Number(value) / 100;
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

let outputTimer;
function scheduleOutput() { clearTimeout(outputTimer); outputTimer = setTimeout(updateOutput, 220); }
function updateOutput() {
  clearTimeout(outputTimer);
  el.outputArea.value = generateScript();
  const names = [state.wrapLabel ? state.labelName : "", ...state.steps.filter(s => s.type === "label").map(s => s.name)].filter(Boolean);
  document.getElementById("labelSuggestions").innerHTML = [...new Set(names)].map(name => '<option value="' + escapeHtml(name) + '"></option>').join("");
  for (const [id, values] of [["imageSuggestions",[...(state.gameIndex?.images || []),...(state.visual?.assets || []).map(a => a.name)]],["speakerSuggestions",state.gameIndex?.characters || []],["audioSuggestions",state.gameIndex?.audio || []]]) {
    document.getElementById(id).innerHTML = [...new Set(values)].slice(0,2000).map(value => '<option value="' + escapeHtml(value) + '"></option>').join("");
  }
  const errors = validateProject();
  el.validation.innerHTML = errors.length ? errors.map(error => '<div>' + escapeHtml(error) + '</div>').join("") : '<div class="valid">基础检查通过 · 素材、跳转目标及原始代码仍需 Ren\'Py 检查</div>';
  remember();
  window.visualEditor?.refresh?.();
  window.storyEditor?.refresh();
}

function addStep(type) {
  if (state.steps.length >= 30000) { toast("当前工程已达 30000 步，请拆分为多个制作工程"); return; }
  const step = defaultStep(type);
  if (type === "label") {
    const names = new Set([state.labelName, ...state.steps.filter(s => s.type === "label").map(s => s.name)]);
    let suffix = 1;
    while (names.has(step.name)) step.name = "branch_" + suffix++;
  }
  if (window.storyEditor) window.storyEditor.insert([step]);
  else state.steps.push(step);
  window.visualEditor?.select?.(step.id, false);
  renderSteps();
  updateOutput();
  el.stepList.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function removeStep(index) {
  state.steps.splice(index, 1);
  renderSteps();
  updateOutput();
}

function moveStep(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.steps.length) return;
  const tmp = state.steps[index];
  state.steps[index] = state.steps[target];
  state.steps[target] = tmp;
  renderSteps();
  updateOutput();
}

function bindStepEvents() {
  el.stepList.addEventListener("input", ev => {
    const input = ev.target;
    const stepEl = input.closest(".step");
    if (!stepEl) return;
    const index = Number(stepEl.dataset.index);
    const field = input.dataset.field;
    if (!field || !state.steps[index]) return;
    state.steps[index][field] = input.type === "checkbox" ? input.checked : input.value;
    if (["x", "y", "anchorX", "anchorY"].includes(field) && state.steps[index].type === "show") state.steps[index].preset = "custom";
    scheduleOutput();
  });

  el.stepList.addEventListener("change", ev => {
    const input = ev.target, index = Number(input.dataset.index), field = input.dataset.field;
    const step = state.steps[index];
    if (!step || !field) return;
    step[field] = input.type === "checkbox" ? input.checked : input.value;
    if (field === "preset" && step.preset !== "custom") {
      step.x = {left:20, center:50, right:80}[step.preset];
      step.y = 100; step.anchorX = 50; step.anchorY = 100;
    }
    if (field === "channel" && step.channel === "voice" && !["play", "stop"].includes(step.action)) step.action = "play";
    if (input.tagName === "SELECT") renderSteps();
    updateOutput();
  });

  el.stepList.addEventListener("click", ev => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const act = btn.dataset.act;
    if (act === "del") removeStep(index);
    if (act === "up") moveStep(index, -1);
    if (act === "down") moveStep(index, 1);
    if (act === "duplicate") {
      if (state.steps[index].type === "label") { toast("段落请通过新增段落创建，避免复制重复 label"); return; }
      state.steps.splice(index + 1, 0, { ...state.steps[index], id: uid() });
      renderSteps();
      updateOutput();
    }
  });
}

function downloadText(filename, text) {
  const blob = text instanceof Blob ? text : new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function copyScript() {
  const text = checkedScript();
  if (text === null) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("已复制到剪贴板")).catch(() => toast("复制失败，请手动选择复制"));
  } else {
    el.outputArea.select();
    document.execCommand("copy");
    toast("已复制到剪贴板");
  }
}

function safeFileName(name) {
  let n = String(name || "performance").replace(/[^A-Za-z0-9_\u4e00-\u9fa5-]+/g, "_").replace(/^_+|_+$/g, "");
  return n || "performance";
}

async function writeToProject() {
  if (!window.showDirectoryPicker) {
    toast("当前浏览器不支持直接写入，请用下载 .rpy 后手动放到 game 目录");
    return;
  }
  const script = checkedScript();
  if (script === null) return;
  try {
    let dir = await window.showDirectoryPicker({ mode: "readwrite" });
    if (dir.name.toLowerCase() !== "game") {
      try { dir = await dir.getDirectoryHandle("game"); }
      catch (_) { toast("请选择 Ren'Py 工程根目录（含 game 文件夹）或 game 目录", 4000); return; }
    }
    let fileName = safeFileName(state.labelName || "performance") + ".rpy";
    if (["script.rpy", "screens.rpy", "options.rpy", "gui.rpy"].includes(fileName.toLowerCase())) fileName = "performance_" + fileName;
    let existing;
    try { existing = await dir.getFileHandle(fileName); }
    catch (err) { if (err.name !== "NotFoundError") throw err; }
    if (existing) {
      if (!confirm(fileName + " 已存在。是否备份原文件后覆盖？")) return;
      const oldFile = await existing.getFile();
      const backup = await dir.getFileHandle(fileName + "." + Date.now() + ".bak", { create: true });
      const backupStream = await backup.createWritable();
      await backupStream.write(oldFile);
      await backupStream.close();
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(script);
    await writable.close();
    toast("已写入 " + fileName + "，在 Ren'Py 里用 call 或 jump 使用这个 label");
  } catch (err) {
    if (err && err.name === "AbortError") {
      toast("已取消");
    } else {
      toast("写入失败：" + (err.message || err));
    }
  }
}

function saveProject() {
  downloadText(safeFileName(state.labelName) + "_project.json", JSON.stringify({ ...state, version: 4 }, null, 2));
  toast("工程已保存");
}

function loadProjectFile(file) {
  if (!file) return;
  if (window.storyEditor) { window.storyEditor.loadFile(file); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      const imported = normalizeProject(data);
      if (state.steps.length && !confirm("读取工程将替换当前步骤（可以撤销），继续吗？")) return;
      state = imported;
      el.labelName.value = state.labelName;
      el.wrapLabel.checked = state.wrapLabel;
      renderSteps();
      updateOutput();
      toast("工程已读取");
    } catch (err) {
      toast("读取失败：" + err.message);
    }
  };
  reader.onerror = () => toast("文件读取失败，请重试");
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm("确定清空所有步骤吗？")) return;
  state = createState();
  el.labelName.value = state.labelName;
  el.wrapLabel.checked = state.wrapLabel;
  renderSteps();
  updateOutput();
}

function init() {
  initEl();
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) { state = normalizeProject(JSON.parse(draft)); toast("已恢复上次编辑的草稿"); }
  } catch (_) { toast("草稿无法恢复，请读取已保存的工程 JSON", 4000); }
  el.labelName.value = state.labelName;
  el.wrapLabel.checked = state.wrapLabel;
  el.undoBtn.addEventListener("click", () => travelHistory(-1));
  el.redoBtn.addEventListener("click", () => travelHistory(1));
  document.addEventListener("keydown", ev => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const key = ev.key.toLowerCase();
    if (key === "s") { ev.preventDefault(); saveProject(); }
    const editing = ev.target.matches("input, textarea, select") || ev.target.isContentEditable;
    if (!editing && (key === "z" || key === "y")) { ev.preventDefault(); travelHistory(key === "y" || ev.shiftKey ? 1 : -1); }
  });
  document.querySelectorAll("button[data-add]").forEach(btn => {
    btn.addEventListener("click", () => addStep(btn.dataset.add));
  });
  el.generateBtn.addEventListener("click", () => { updateOutput(); if (checkedScript() !== null) toast("已生成脚本，基础检查通过"); });
  el.copyBtn.addEventListener("click", copyScript);
  el.downloadBtn.addEventListener("click", () => {
    const script = checkedScript();
    if (script === null) return;
    downloadText(safeFileName(state.labelName || "performance") + ".rpy", script);
    toast("已下载 .rpy");
  });
  el.writeProjectBtn.addEventListener("click", writeToProject);
  el.saveProjectBtn.addEventListener("click", saveProject);
  el.loadProjectBtn.addEventListener("click", () => el.fileProject.click());
  el.clearBtn.addEventListener("click", clearAll);
  el.fileProject.addEventListener("change", () => {
    if (el.fileProject.files[0]) loadProjectFile(el.fileProject.files[0]);
    el.fileProject.value = "";
  });
  el.wrapLabel.addEventListener("change", () => {
    state.wrapLabel = el.wrapLabel.checked;
    updateOutput();
  });
  el.labelName.addEventListener("input", () => {
    state.labelName = el.labelName.value;
    updateOutput();
  });
  bindStepEvents();
  renderSteps();
  updateOutput();
}

init();
