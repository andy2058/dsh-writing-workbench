# 老欧写作工作台 · DSH 插件

把「老欧拾光记」公众号写作的六阶段提示词流水线装进 DeepSeek Harness 网页端，做成**左侧栏里的可视化操作页**：

**⓪ 选题专家 → 🎯 一键全流程 → ① 选题角度（黑天鹅版）→ ② 写作结构（SUCCESs 版）→ ③ 文章润色 → ④ 传播优化改造 → ⑤ 文章自检（L1–L4）→ ⑥ 标题与封面摘要**（先自检、最后出标题）

左侧栏点「老欧写作工作台」图标，中央区域就是一个整页工作台：左边阶段轨道、中间填字段、右边实时拼装提示词，底部一键发送到指定会话。同一套提示词还注册成 9 个 agent skill，模型可以在会话里自动调用（其中 `lao-ou-topic-expert` 是把原「老欧自媒体选题专家」插件融合进来的一环，独立插件已可卸载）。

插件本身**不做任何模型请求**：发送 = 先把附件上传成 receipt，再调用目标会话的 `session.prompt([{type:'text', text}, {type:'file', receiptId}], 'queue' | 'steer')`，剩下的交给模型。

仓库：<https://github.com/andy2058/dsh-writing-workbench> ｜ 当前版本 **0.12.0** ｜ License: MIT

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
5. 状态行会显示 `已排队 2/6 个环节…`，最终 `已按顺序发出 6/6 个环节，「DSH-Writing desk」里会连续跑完`。

顺序是 **选题 → 结构 → 润色 → 传播优化 → 自检 → 标题 → 封面**：自检先跑，标题和封面摘要基于自检后的定稿来写，最后一步出封面。

## ⓪ 选题专家（先定写什么）

原「老欧自媒体选题专家」插件已融合进工作台，成为最前面的一格：

- **入口类型**：链接 / 文件或附件 / 一屏素材 / 关键词 / 什么都没给（热点雷达）——对应 skill 里的模式 ④④③②①
- **材料位置**：链接或工作区里的文件路径；**素材正文**可以整屏粘贴（评论、私信、群聊、摘录）
- 发出去之后，模型会先加载 `lao-ou-topic-expert` skill，读完材料再给 **3-5 个选题**：主题 / 切入角度 / 目标读者 / 弹药方向 / 标题方向 / 百分制评分 / 原文依据，末尾附备选池、假设清单与「进入 ① 选题角度该主打哪个角度」的衔接建议。
- 它只解决「写什么」，不代写成稿；选定后回到 ① 继续。

## ⑦ 封面生成（豆包 seedream 以文生图）

这一环节把「内容 → 封面」做成两步内完成，不需要额外一轮对话：

1. 填标题、主视觉标题（A 层）、副标题（C 层）、内容摘要；摘要决定画面隐喻；
2. 选 **17 种视觉风格之一**（来自 cover-master 风格库：黑白极简概念、语义转译极简、复古手撕拼贴、巨型透视中文标题、立体纸雕概念海报、黑红剪影、法式极简墨线海报……）；
3. 选画幅：公众号头图 `2.35:1`（2048×872）/ 公众号封面图 `16:9`（2048×1152）/ 小红书 `3:4`（1536×2048）/ 横版 `5:2`（2048×819）；
4. 预览区就是编译好的**最终图片提示词**（按 cover-master 蓝图：风格编译 → 构图 → 文字系统 → 质感光线 → 禁止项），可以手改；
5. 第一次用先粘一次**火山方舟 API Key**（只存在这台电脑的浏览器 localStorage，随请求发给你本机宿主，不写配置文件、不进日志）；
6. 点「生成封面」→ 宿主代理调用方舟 `images/generations` → 出图后自动存进本次会话的稿件目录，状态行显示落盘路径。

### 模型 ID 怎么填（0.12.2+）

模型框是**可编辑输入框**，带下拉候选，也可以直接粘接入点 ID：

| 候选 | 说明 |
|---|---|
| `doubao-seedream-4-0-250828` | 默认，多数账号可用 |
| `doubao-seedream-4-5-251128` | 4.5 |
| `doubao-seedream-5-5-261028` | 5.5（文档示例用的就是它） |
| `ep-xxxxxxxx` | 控制台「在线推理」里的接入点 ID |

方舟的模型必须先在你账号里**开通**，否则返回 404
`The model or endpoint … does not exist or you do not have access to it`。这时：

1. 去 [方舟控制台 → 开通管理](https://console.volcengine.com/ark) 开通对应 Seedream 版本（图片生成）；
2. 或回工作台换一个候选 / 粘贴你自己的 `ep-…` 接入点 ID。

宿主会把这类 404 翻成 `model-not-found`，状态行会直接写「方舟不认识模型「xxx」（404）… 到方舟控制台开通…或填接入点 ID」。
注意：旧默认值 `doubao-seedream-3-0-t2i-250415` 在多数账号已下线，0.12.2 起会把你浏览器里存的旧默认值自动迁移掉。

### 自动换模型与尺寸档位（0.12.4+，默认开）

账号里到底开通了哪个版本并不总是清楚，而 **404 / 400 不计费**，所以勾上「自动换模型」后，宿主会按
`5.5-261028 → 4.5-251128 → 4.0-250828 → 3.0-t2i-250415` 依次重试，第一个能出图的就是你的账号可用的版本；
出图成功后会把该模型 ID 写回模型框，下次直接用。全部 404 时状态行会列出「试过：…」，
这时只能去控制台开通，或填接入点 ID `ep-…`。

**尺寸写法按模型代际区分**：Seedream **5.x** 只认档位字符串（`1K` / `2K` / `4K`，默认发 `2K`），
4.x / 3.x 认显式像素（如 `2048x872`）。宿主会先按模型代际选对写法，遇到 400 参数错误时再用另一种写法重试一次，
所以三种画幅在任意一代模型上都能出图。

**429「安全体验模式」**：如果账号触发用量上限，方舟会暂停该模型的调用并回 429 `SetLimitExceeded`。
宿主把它翻成 `quota-exceeded`，状态行会直接写「方舟账号的 Seedream 用量已暂停（安全体验模式/额度上限）…」，
处理办法是去方舟控制台「开通管理」里调整或关闭安全体验模式 / 提额度。这不是代码问题，也不会扣费。

### 封面存到哪

- 正常情况下：`<会话稿件目录>/cover-YYYYMMDD-HHmmss.png`，例如
  `/Users/jim2056/DSH-Writing desk/稿件-2026-11-17-2250-3431b0/cover-20261117-2312'40.png`；
  状态行和封面面板里都会显示完整路径。
- 会话目录还没建过也没关系（0.12.5+）：工作台会按会话算出目录并自动建好；
  如果你还没选定会话（新流程），图会落到 `/Users/jim2056/DSH-Writing desk/封面/`。
- 只允许写进 `~/DSH-Writing desk` 或 `稿件-*` 目录，宿主会拒绝其它路径。
- 面板里显示的图是方舟返回的临时 URL（24 小时有效）；本地这份 PNG 才是长期可用的。
- 注意：模型在聊天里自己用 Python 画出来的 `cover-assets/` 不是这里的产物，可删。

技术要点：浏览器不直接访问方舟（避免 CORS），Key 走 `x-ark-key` 请求头；宿主路由 `/api/x-writing-workbench/cover` 注册在 `ctx.connection.fetch` 上，沿用 DSH 的登录态鉴权；落盘只允许写进 `~/DSH-Writing desk` 或 `稿件-*` 目录。

## 9 个 agent skill

| Skill | 阶段 | 触发场景 |
|---|---|---|
| `lao-ou-article-pipeline` | 🎯 六阶段一条龙（编排） | "帮我写一篇老欧风格的文章" |
| `lao-ou-topic-expert` | ⓪ 选题专家 | "这个链接能写什么" / "选题：AI 编程" / "今天写什么" |
| `lao-ou-topic-angles` | ① 选题角度 | "帮我给这个话题找个角度" |
| `lao-ou-writing-structure` | ② 写作结构 | "按老欧的风格写一篇公众号文章" |
| `lao-ou-article-polish` | ③ 文章润色 | "帮我润色这篇稿子，去去 AI 味" |
| `lao-ou-spread-optimization` | ④ 传播优化改造 | "让这篇文章更容易被转发" |
| `lao-ou-article-self-check` | ⑤ 文章自检 | "按老欧的标准自检这篇文章" |
| `lao-ou-title-and-cover` | ⑥ 标题与封面摘要 | "出 12 组标题和封面摘要" |
| `lao-ou-cover-design` | ⑦ 封面生成 | "按黑红剪影风格给这篇文章做张封面" |

这 9 个 skill 由宿主端 `lib/index.js` 通过 `ctx.skills.register()` 注册（内存注册，不往工作区或 `$DSH_HOME` 写文件），随插件卸载自动消失。

---

## 发布（维护者）

本机 `github.com:443` 被网络阻断、但 `api.github.com` 可用，所以推送走 GitHub Git Data API：

```bash
TOKEN=<pat> node tools/push-api.mjs <本地基点> <远端父提交> HEAD
```

它把本地新提交逐个重放到远端之上（远端 SHA 与本地不同，因为父链被重写），最后 fast-forward `main`。
发版流程：改版本号 → `npm run verify` → `git commit` → 用上面的脚本推送 → 更新 `index.json` 的
`version` / `publishTimestamp` / `source.commit`（指向远端提交）再推一次 → 打 tag。

## 安装

四种装法，任选一种。

### ① 插件市场安装（其他 DSH 用户推荐）

本仓库自带一份市场索引 `index.json`（[格式 1](https://github.com/andy2058/dsh-writing-workbench/blob/main/index.json)），任何人把它加进自己的 DSH 就能一键安装、一键升级：

1. 打开 **设置 → 插件 → 「发现」**；
2. 点「**添加索引源**」，索引 URL 填：

```
https://raw.githubusercontent.com/andy2058/dsh-writing-workbench/main/index.json
```

3. 在「发现」里找到「**老欧写作工作台**」，点「安装」。

之后索引进新版本时，「发现」页会显示可升级，点一下即可更新。索引里的版本是**按 commit 固定**的（`source.type: git` + 40 位 SHA），所以同一个版本号任何时候装到的都是同一份代码。

### ② 从 GitHub 直接装（不想加索引）

```
plugin_manager install_bundle target=git+https://github.com/andy2058/dsh-writing-workbench.git
```

### ③ 用打好的安装包（离线/内网）

```bash
# 从仓库下载 dist/lao-ou-dsh-writing-workbench-0.12.0.tgz，然后
plugin_manager install_bundle target=/absolute/path/to/lao-ou-dsh-writing-workbench-0.12.0.tgz
```

### ④ 本地开发目录（改代码后只需刷新页面）

```
plugin_manager install_bundle target=/absolute/path/to/lao-ou-writing-workbench
```

装完刷新网页端：左侧栏多一个「**老欧写作工作台**」图标（排序 9，在「日程」之前），点开就是整页工作台，标题右侧显示版本号（应看到 `v0.12.0`）。

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
│   ├── 00-选题专家.txt      # ⓪ 环节的工作台提示词
│   ├── topic-expert.md      # 融合进来的选题专家 skill 正文
│   ├── cover/               # 17 种封面风格 + 蓝图
│   └── 01-选题角度.txt … 06-文章自检.txt
├── ui/client.js          # 浏览器端源码（侧栏图标 + 整页工作台 + 输入框入口）
├── tools/
│   ├── build.js          # templates → lib/client.js + lib/skill-manifest.js
│   ├── smoke.mjs         # 注册契约 / 文案 / 主题变量 / 模板注入
│   └── render-smoke.mjs  # 组件渲染冒烟（最小 React 替身）
└── lib/                  # 构建产物
    ├── index.js          # 宿主端：注册 9 个 skill
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

## 版本历史

| 版本 | 主要变化 |
|---|---|
| 0.13.0 | 融合「老欧自媒体选题专家」：新增 ⓪ 选题专家环节与 `lao-ou-topic-expert` skill，独立插件可卸载 |
| 0.12.7 | 画幅新增「公众号封面图 16:9」（2048×1152），平台说明与提示词同步 |
| 0.12.6 | 封面标题改为非必填；空标题时提示词改为纯画面表达 |
| 0.12.5 | 封面落盘目录兜底：会话目录没建过也能自动建；没有会话时落到 `DSH-Writing desk/封面/`，状态行显示完整路径 |
| 0.12.4 | 模型默认改为账号已开通的 Seedream 5.5，5.x 自动用 2K 档位 / 4.x 用像素；429 安全体验模式翻成 `quota-exceeded` 并给出处理办法 |
| 0.12.0 | 新增第 7 环节「封面生成」：17 种 cover-master 风格 + 蓝图编译提示词 + 火山方舟 seedream 出图并落盘；新增 `lao-ou-cover-design` skill 与宿主生图代理路由 |
| 0.11.2 | 发布到 GitHub，提供 tgz 安装包；六格刻度与阶段图标配色统一 |
| 0.11.1 | 刻度和时间线只保留「当前阶段」一个强调色，完成状态改用统一 ✓ 标记 |
| 0.11.0 | 界面重构：吸顶工具栏、宋体标题、「稿」字印、竖排时间线、稿纸预览 |
| 0.10.0 | 每个阶段新增「⚡ 一键跑完后续」；自检与标题环节互换（先自检后标题） |
| 0.9.0 | 桌面目录改为**按会话**创建（不再只在「新流程」时创建） |
| 0.8.0 | 稿件目录使用绝对路径，落在 `/DSH-Writing desk` 之下 |
| 0.7.0 | 每个会话一个 `稿件-<日期>-<时间>-<会话短 id>` 文件夹 |
| 0.6.0 | 新流程自动在 `DSH-Writing desk` 工作区里建会话并跳转过去 |
| 0.5.0 | 附件上传改为与输入框同一条流式链路（三层兜底） |
| 0.4.0 | 增加附件上传（拖拽/选择文件） |
| 0.3.0 | 工作台从浮层改成左侧栏独立整页 |
| 0.2.0 | 六阶段提示词流水线 + 7 个 agent skill |

## License

MIT
