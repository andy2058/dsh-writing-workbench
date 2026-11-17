# 老欧写作工作台 · DSH 插件

把「老欧拾光记」公众号写作的六阶段提示词流水线装进 DeepSeek Harness 网页端，做成**左侧栏里的可视化操作页**：

**🎯 一键全流程 → ① 选题角度（黑天鹅版）→ ② 写作结构（SUCCESs 版）→ ③ 文章润色 → ④ 传播优化改造 → ⑤ 文章自检（L1–L4）→ ⑥ 标题与封面摘要**（先自检、最后出标题）

左侧栏点「老欧写作工作台」图标，中央区域就是一个整页工作台：左边阶段轨道、中间填字段、右边实时拼装提示词，底部一键发送到指定会话。同一套提示词还注册成 7 个 agent skill，模型可以在会话里自动调用。

插件本身**不做任何模型请求**：发送 = 先把附件上传成 receipt，再调用目标会话的 `session.prompt([{type:'text', text}, {type:'file', receiptId}], 'queue' | 'steer')`，剩下的交给模型。

仓库：<https://github.com/andy2058/dsh-writing-workbench> ｜ 当前版本 **0.11.2** ｜ License: MIT

---

## 三个入口

| 入口 | 位置 | 作用 |
|---|---|---|
| 左侧栏图标 | 侧栏面板列（插件 / 定时任务 / 上下文 旁边） | 打开中央整页工作台 |
| 「✎ 写作」按钮 | 输入框右侧 | 跳到同一个页面（不弹浮层） |
| 7 个 skill | 会话里自动调用 | 直接说"帮我写一篇老欧风格的文章"即可 |

## 页面长什么样

整体是一张**稿纸桌面**：没有漂浮的光斑、没有花哨的卡片描边，用宋体标题、竖排时间线和横线稿纸交代"这是写作的地方"。

- **顶部工具栏**（半透明、随滚动常驻）：左侧「稿」字印 + 工作台名 + 版本号；右侧目标会话下拉（第一项是「＋ 新流程（DSH-Writing desk）」，默认就选它）、「＋ 新流程」按钮、发送方式（排队 / 打断）。
- **阶段标题区**：当前阶段名（宋体大字）+ 一句话说明 + **六格刻度条**（已填写是绿色、当前是品牌色，可直接点着跳阶段），右侧跟 `n/6 阶段已填写`。
- **⚡ 一键跑完后续**：任一阶段底栏都有这个按钮（全流程页没有），点了就从**当前阶段**开始，把后面每个阶段各排一条消息进同一个会话，模型按顺序连续跑完，中途不用你再点。
- **左侧时间线**：🎯 全流程 + ① 选题 → ⑥ 标题，一条竖线串起六个编号圆点；当前阶段圆点填品牌色，已填写的阶段圆点变绿，每个节点下面一句说明。
- **右侧两块面板**：
  - **填写内容**：当前阶段的字段（必填带 `*`），短字段两栏、长字段整行；下面是**附件区**（虚线框，可拖入文件或点「选择文件」，可多选）。
  - **稿纸预览**：拼装好的提示词放在带横线底纹的稿纸里，宋体、28px 行距，可直接手改；`重新拼装` 回到自动拼装，`编辑模板` 改模板本身，`恢复默认模板` 回退。标题右侧显示字符数。
- **底栏**（吸底、半透明）：左边状态点 + 一行文字（发送中带脉冲动画），右边 `去会话看结果`、`⚡ 一键跑完后续`、`复制提示词`、`发送并打断`、`发送到会话`。

宽度小于 820px 时自动变单栏，时间线挪到最上面；系统开了"减少动态效果"时所有过渡和动画关闭。

字段、模板、目标会话、当前阶段都存在浏览器 localStorage（`dsh.writing-workbench.*`），切页面、关应用都不丢；只有本机生效。

## 新流程：自动在 DSH-Writing desk 里开会话

目标会话是 **「＋ 新流程」** 时（默认就是），点发送不会用到当前窗口的会话，而是：

1. `workspaces.create({ path: '~/DSH-Writing desk' })` —— 幂等地拿到（或登记出）这个工作区；目录不存在就先 `createDirectory` 再登记；
2. `uiWorkspace.connectWorkspace(workspaceId)` —— 在这个工作区下建好一个会话（工作区里已有空会话时直接复用），拿回 `sessionId`；
3. `uiWorkspace.createDirectory(workspace.path, folderName)` —— **在工作区之下给这个会话建一个专属文件夹**：`/Users/<你>/DSH-Writing desk/稿件-2026-11-16-2315-a1b2c3`（`稿件-日期-时分-会话短 id`；宿主侧的 `createDirectory` 是单层 `mkdir`，父目录不存在或已存在都会报错，所以同名时按「已存在」处理）；
4. **附件上传、提示词发送都发给这个新会话**（上传必须挂在目标会话下，否则宿主不认 receipt）；
5. 提示词末尾追加落盘要求：把成稿保存到 `稿件-…/` 目录里，文件名 `<日期>-<标题>.md`，并回复相对路径；
6. 发完自动 `openSession(sessionId)`，界面直接切到那个新会话——写作过程、工具调用、生成的文件都留在这个工作区和它自己的文件夹里。

后续阶段（润色 / 传播优化 / 自检）在同一个会话里继续时，会记得这个会话的文件夹（存在 localStorage `dsh.writing-workbench.folder:<sessionId>`），每次发送都提醒模型「成果保存到那个目录」，不会另开文件夹。

**目录是「按会话」建的，不只「新流程」**：只要目标会话属于 `DSH-Writing desk` 工作区（比如你在下拉里选了一个已有会话，或者上一轮用过的那一个），第一次在这个会话里发送时就会补建 `稿件-日期-时分-会话短 id/`（`uiWorkspace.createDirectory(workspace.path, name)`），并在提示词里写上那个绝对路径；同一个会话之后再发就用缓存的目录。目标会话属于别的工作区时不建目录，只提醒模型存到当前工作区的 `稿件/` 下。这样无论从哪条路进来，一篇稿子的所有产物都落在它自己那一个文件夹里。

发过一次之后，目标会自动记成那个会话（下拉里显示为 `DSH-Writing desk`），后续阶段（润色、传播优化、自检）继续在**同一个会话**里迭代，不用手动切换。想再开一篇新的，点顶部「＋ 新流程」或在下拉里重选第一项即可。

工作区路径固定在宿主家目录下：`$DSH_HOME` 同级的 `/Users/<你>/DSH-Writing desk`（代码里是 `remote.$host.home + '/DSH-Writing desk'`）。一篇写完大概是：

```
/Users/<你>/DSH-Writing desk/
├── 稿件-2026-11-16-2315-a1b2c3/
│   └── 2026-11-16-中年人转行学编程.md
└── 稿件-2026-11-17-0902-f7e0d9/
    └── 2026-11-17-为什么越努力越焦虑.md
```

目录建不出来也不会阻塞发送：提示词里依旧写着那个**绝对路径**并要求模型先 `mkdir -p`，界面状态改成「稿件目录没建出来（原因）…」，凡是路径都按绝对路径显示，方便直接核对是不是在 `/Users/<你>/DSH-Writing desk` 之下。

## 附件上传

输入区支持真实文件上传，走的是应用本身那条上传链路，不是把文件塞进提示词文本：

1. 拖拽或「选择文件」把文件加进待发列表（多个、任意类型，bytes 不落 localStorage，只有文件名留在界面上）；
2. 点发送时逐个上传，同一份文件按三层依次尝试：
   1. **流式上传**——把 `File` 本身交给宿主 `fileUpload` 服务（`upload()`，图片走 `uploadImage()`），也就是输入框附件用的同一条后台流式链路，大文件走这条；
   2. **base64 RPC**——同一服务的 `upload(sessionId, Uint8Array)` 分支，适合小文件；
   3. **直连接口**——`POST /api/session/uploadFileBinary?sessionId=..&name=..`（图片附 `mediaType`），带 cookie，`content-type: application/octet-stream`；
3. 每个上传结果取 `receiptId`，拼成 `{type:'file', receiptId}` 内容项，和提示词文本一起交给 `session.prompt`；
4. 提示词末尾自动追加一行附件清单（`（本次随信附带 N 个文件：……）`），让模型知道要先去读这些文件；发送成功后待发列表清空。

上传失败会停在原地（不发出半截请求），提示里会带上**三层各自的原因**（`[错误码] 名称: 消息`），页面右上角还显示当前运行的版本号（如 `v0.11.0`），便于确认浏览器是否已加载新构建。
## ⚡ 一键跑完后续（连续执行）

六阶段里，每一阶段右下角都有一个 **⚡ 一键跑完后续 · N** 按钮（N = 从当前阶段算起还剩几个环节；「🎯 全流程」页没有这个按钮，因为它本来就是一条龙）。

点下去之后：

1. 先把当前阶段发出去（带着你已经填好的字段）；
2. 再把后面每个阶段各发一条，全部进**同一个会话**的队列；
3. 每条消息前面都带 `【连续执行 n/N】本环节是「…」`，后面带「直接基于上文继续，不要停下来问我」和「▶ 下一步：…」；
4. 后面阶段如果必填字段没填，就直接发该阶段的完整模板（让模型自己按上文推断），不会因为缺字段卡住；
5. 状态行会显示 `已排队 2/5 个环节…`，最终 `已按顺序发出 5/5 个环节，「DSH-Writing desk」里会连续跑完`。

顺序是 **选题 → 结构 → 润色 → 传播优化 → 自检 → 标题**：自检先跑，标题和封面摘要基于自检后的定稿来写。

## 7 个 agent skill

| Skill | 阶段 | 触发场景 |
|---|---|---|
| `lao-ou-article-pipeline` | 🎯 六阶段一条龙（编排） | "帮我写一篇老欧风格的文章" |
| `lao-ou-topic-angles` | ① 选题角度 | "帮我给这个话题找个角度" |
| `lao-ou-writing-structure` | ② 写作结构 | "按老欧的风格写一篇公众号文章" |
| `lao-ou-article-polish` | ③ 文章润色 | "帮我润色这篇稿子，去去 AI 味" |
| `lao-ou-spread-optimization` | ④ 传播优化改造 | "让这篇文章更容易被转发" |
| `lao-ou-article-self-check` | ⑤ 文章自检 | "按老欧的标准自检这篇文章" |
| `lao-ou-title-and-cover` | ⑥ 标题与封面摘要 | "出 12 组标题和封面摘要" |

这 7 个 skill 由宿主端 `lib/index.js` 通过 `ctx.skills.register()` 注册（内存注册，不往工作区或 `$DSH_HOME` 写文件），随插件卸载自动消失。

---

## 安装

三种装法，任选一种。

### ① 从 GitHub（换台机器最省事）

```
plugin_manager install_bundle target=git+https://github.com/andy2058/dsh-writing-workbench.git
```

### ② 用打好的安装包（离线/内网）

```bash
# 从仓库下载 dist/lao-ou-dsh-writing-workbench-0.11.2.tgz，然后
plugin_manager install_bundle target=/absolute/path/to/lao-ou-dsh-writing-workbench-0.11.2.tgz
```

### ③ 本地开发目录（改代码后只需刷新页面）

```
plugin_manager install_bundle target=/absolute/path/to/lao-ou-writing-workbench
```

装完刷新网页端：左侧栏多一个「**老欧写作工作台**」图标（排序 8，在「自媒体工作台」和「日程」之间），点开就是整页工作台，标题右侧显示版本号（应看到 `v0.11.2`）。

`package.json` 的 `files` 已包含 `lib/`、`templates/`、`ui/`、`tools/`，所以从 GitHub 或 tgz 装下来也还能用 `node tools/build.js` 重新构建。

### 更新

```
plugin_manager install_bundle target=git+https://github.com/andy2058/dsh-writing-workbench.git
```

装完按 ⌘R 刷新页面；标题旁版本号变了就说明换上了。用「本地开发目录」安装时，改 `ui/client.js` 或 `templates/` 后跑 `node tools/build.js`，页面会自动热更新，不必重装。

### 验证

```bash
node tools/build.js        # 从 templates/ 重新生成 lib/client.js + lib/skill-manifest.js
node --check lib/client.js
node tools/smoke.mjs       # 注册点 / 文案 / 主题变量 / 模板注入
node tools/render-smoke.mjs # 三个组件各渲染一遍（含七个阶段）
```

页面里再确认：

- 左侧栏图标点开后是整页工作台（不再是浮层），阶段轨道可切换；
- 输入框右侧「✎ 写作」也指向同一页；
- 新会话说一句"帮我写一篇老欧风格的文章，主题是……"，模型会调用 `lao-ou-article-pipeline`。

---

## 目录结构

```
lao-ou-writing-workbench/
├── package.json          # dsh.bundle.patch + dsh.client.platform=web
├── cordis.patch.yml      # 插入 ui-writing-workbench 条目
├── icon.svg
├── locale/{zh,en}.json   # 插件详情页标题/简介
├── docs/DETAIL.md        # 详情页插图（640×300 SVG）
├── templates/            # 内容单一源：6 阶段提示词 + 一条龙编排
│   ├── 00-pipeline.md
│   └── 01-选题角度.txt … 06-文章自检.txt
├── ui/client.js          # 浏览器端源码（侧栏图标 + 整页工作台 + 输入框入口）
├── tools/
│   ├── build.js          # templates → lib/client.js + lib/skill-manifest.js
│   ├── smoke.mjs         # 注册契约 / 文案 / 主题变量 / 模板注入
│   └── render-smoke.mjs  # 组件渲染冒烟（最小 React 替身）
└── lib/                  # 构建产物
    ├── index.js          # 宿主端：注册 7 个 skill
    ├── client.js         # 浏览器端 bundle
    └── skill-manifest.js # skill 正文清单
```

---

## 改提示词

`templates/` 是唯一内容源，工作台和 skill 都从它生成：

1. 改 `templates/*.txt`（或 `00-pipeline.md`）；
2. 重新构建：`node tools/build.js`；
3. 刷新网页端（开发模式下 client-hmr 会热重载）。skill 随宿主重启生效。

只想临时改某个阶段的提示词？不用改文件：工作台里点 ``编辑模板``。字段内容想换一套？点 ``清空本阶段``。

---

## 架构

| 部分 | 作用 |
|---|---|
| `package.json` → `dsh.bundle.patch` | 指向 `cordis.patch.yml`，是插件的 loader 补丁层 |
| `cordis.patch.yml` → `insert: {id, name}` | 把 `ui-writing-workbench` 条目插进插件名册（bundle 层只插一次，**不要**再往 profile 的 `cordis.patch.yml` 手写 insert，否则 loader 抛 `duplicate loader entry id`） |
| `package.json` → `dsh.client` | 声明浏览器侧：`platform: "web"`、`immediately: true`、依赖 `@deepseek-ai/dsh-client-ui-conversation` 先就绪 |
| `lib/client.js` | `window.__ModuleLoader__.load({id, factory})`；只用内置外置模块 `react` / `react-dom`，不依赖任何 Harness Client UI 包 |
| `sidebar.panellist` | 左侧栏图标；同一 `id` 就是它要打开的 `main` 键 |
| `main`（`key: writing-workbench`） | 中央整页工作台；会话列表来自 `useSessions`，用 `retainedBy.mainView > 0` 找出"你正在看的会话" |
| `conversation.input.right` | 输入框右侧快捷入口，点击 = `layout.selectPanel('writing-workbench')` |
| `lib/index.js` | 宿主端：`ctx.skills.register()` 注册 7 个 skill |
| `ctx.locale` | 界面文案注册到 `dsh-writing-workbench` 命名空间（zh + en，41 条 × 2） |

样式随组件挂载为 `<style>` 元素，卸载即移除；颜色只用已注册的 `--dsw-alias-*` 主题变量（bg-base / bg-layer-1 / bg-layer-2 / border-l1 / border-l2 / brand-primary / label-primary / label-secondary / label-on-color / state-success-primary / state-error-primary / state-warn-primary / state-idle-primary），其余层次用 `color-mix()` 和局部 `--lou-*` 变量推导，自动跟随浅色/深色主题；字体用宋体（Songti SC / STSong / Noto Serif SC）表达写作气质。

## 卸载

```
plugin_manager remove_bundle target=@lao-ou/dsh-writing-workbench
```

## License

MIT
