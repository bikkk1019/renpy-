# GalgameVisualEditor

离线使用的 Ren'Py 长剧情与演出脚本编辑器。支持剧情段落、批量对白、分支检查、图片舞台、演出动画预览、工程备份与脚本导出。

## 直接使用

1. **将整个 ZIP 解压**，不要只复制 HTML 文件，也不要在压缩包里直接打开。
2. Windows 上双击 `启动编辑器.cmd`，用已安装的 Microsoft Edge 打开编辑器。
3. 从 `examples/分支演出示例.json` 读取示例，或新建自己的剧情。
4. 阅读 [长剧情制作指南](docs/长剧情制作指南.md) 和 [使用说明](docs/使用说明.md)。

编辑器本身不需要 Python、Node.js、联网或安装依赖。辅助引擎检查工具需要 Python 3.10+（含 Tkinter）和独立安装的 Ren'Py SDK；双击 `打开工程检查工具.cmd` 后自行选择 SDK 与游戏工程。它们均不包含在本压缩包中。

`renpy_performance_maker.html` 是稳定入口，保留此文件名以兼容已有桌面快捷方式。源码路径可以调整，入口位置建议保持不变。

## 目录

```text
GalgameVisualEditor/
├── renpy_performance_maker.html  网页入口
├── 启动编辑器.cmd               Windows 启动入口
├── 打开工程检查工具.cmd         Ren'Py 检查工具入口
├── src/                        JavaScript 与样式
├── docs/                       用户及开发文档
├── examples/                   可导入示例
├── tools/                      Python 辅助工具
├── scripts/                    启动、测试、打包脚本
├── tests/                      自动化回归测试
├── package.json                开发依赖与命令
└── BUILD-MANIFEST.json          发布包文件校验清单（打包时生成）
```

测试生成的 `tests/artifacts/`、本地 `node_modules/` 和发布目录 `dist/` 不包含在发布包里。历史备份和个人游戏工程也不打入发布包。

## 数据与迁移

自动草稿和导入图片保存在浏览器数据库中，**不在程序目录中**。复制或压缩程序目录不会自动备份你的剧情和图片。

换电脑、换浏览器或改变入口文件位置前，请先在旧编辑器中点击「打包工程与图片」，再在新编辑器中读取 `.rpe`。轻量 JSON 不包含图片；外部游戏音频、字体和未导入素材需要另行备份。

## 已验证范围

- 常规脚本、工程保存/读取与覆盖保护。
- 可视化素材绑定、拖动、撤销、动画及刷新恢复。
- 200 个命名段落、20,200 个步骤的分页编辑、搜索和数据库恢复。
- 工程包在空浏览器环境中的图片恢复。
- 分段 ZIP 校验及代表性脚本的 Ren'Py lint。

预览是简化演出预演，不执行完整 Ren'Py 运行时。最终效果和分支必须在游戏引擎中试玩。

## 开发与发布

见 [开发说明](docs/开发说明.md)。普通使用者无需执行这些命令。

```text
npm install
npm run check
npm test
python scripts/build_release.py
```

版本见 `package.json`。本工程未附开放源代码许可证，提供源码不等于授予任意公开再分发授权。
