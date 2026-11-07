# 发布到 GitHub

建议把工程源码放在仓库中，把可直接解压使用的 ZIP 放在 Releases。仓库名称可以使用 `GalgameVisualEditor`。

## 网页方式

1. 登录 GitHub，打开 <https://github.com/new>。
2. 填写仓库名称与简介，按需要选择 Public 或 Private。项目已有 README 和 .gitignore，不必重新生成同名文件。
3. 解压正式发布 ZIP，打开里面的 GalgameVisualEditor 文件夹。
4. 在空仓库页面选择 uploading an existing file，或在已有仓库中使用 Add file → Upload files。
5. 将解压后文件夹**里面的文件和子目录**拖入上传区域，保留 src、docs、tests 等层级。README.md 应直接位于仓库根目录。可不上传打包时生成的 BUILD-MANIFEST.json，它只用于校验该 ZIP。
6. 输入提交说明，例如 `Initial release: long-form RenPy editor`，提交文件。

使用正式发布 ZIP 解压得到的干净文件，能避免把原工作目录里的 dist、缓存、测试产物和历史备份误上传。网页上传不会自动遵循本地 .gitignore 来筛选你选中的文件。

官方文件上传说明：<https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository>

## 发布下载包

1. 在仓库右侧进入 Releases，选择 Draft a new release。
2. 新建标签 `v1.0.0`，目标选源码所在分支。
3. 标题填写 `GalgameVisualEditor 1.0.0`。
4. 将 `GalgameVisualEditor-1.0.0.zip` 和对应 `.zip.sha256` 作为附件上传。
5. 填写版本说明，然后发布；尚需自己试玩验证时，可以先保存草稿或标记为预发布。

可用说明：

> 离线 Ren'Py 长剧情与演出编辑器，支持段落管理、批量对白、分支检查、舞台预览和工程图片打包。下载 ZIP 后完整解压，Windows 用户双击“启动编辑器.cmd”，需要 Microsoft Edge。可选的引擎检查工具另需 Python 和 Ren'Py SDK。程序包不包含个人剧情和游戏素材。

官方 Releases 说明：<https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository>

## 后续更新

小改动可以在网页修改或上传；持续开发时建议使用 Git 或 GitHub Desktop 管理提交。修改后先运行测试，更新 package.json 版本号与 CHANGELOG，再运行 `python scripts/build_release.py` 生成新包。

当前工程没有 LICENSE 文件。如希望他人按某种开源许可使用、修改与分发代码，应由项目所有者选择许可证后添加 LICENSE，并同步修改 README 中的许可说明。不要把未获授权的游戏图片、音乐或字体随代码公开上传。
