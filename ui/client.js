/**
 * 老欧写作工作台 · 浏览器端 bundle
 *
 * 三个注册点：
 *   sidebar.panellist       左侧栏「写作」图标（点开切到中央页面）
 *   main (key=writing-workbench) 中央可视化操作页：六阶段 + 一键全流程
 *   conversation.input.right 输入框右侧的快捷入口（跳到同一个页面）
 *
 * 插件本身不做任何模型请求：发送 = 目标会话 session.prompt([{type:'text', text}], 'queue' | 'steer')
 *
 * 提示词模板由 tools/build.js 从 templates/ 注入（见下方 /*__TEMPLATES__*\/ 占位符）。
 */
window.__ModuleLoader__.load({
  id: '@lao-ou/dsh-writing-workbench',
  factory(require) {
    'use strict'

    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'dsh-writing-workbench'
    const LS = 'dsh.writing-workbench.'
    const PANEL_ID = 'writing-workbench'
    /* 与 package.json 的 version 保持一致，界面上显示，方便确认浏览器跑的是哪一版 */
    const VERSION = 'v0.12.2'
    /* 写作工作区：'新建流程' 的目标值，不是真实的会话 id */
    const WORKFLOW_TARGET = 'new'
    const WORKSPACE_NAME = 'DSH-Writing desk'
    const MANUSCRIPT_DIR = '稿件'
    const SLOT_SIDEBAR = 'sidebar.panellist'
    const SLOT_MAIN = 'main'
    const SLOT_COMPOSER = 'conversation.input.right'

    /* ---------- 提示词模板（tools/build.js 注入，请勿手改） ---------- */
    const TEMPLATES = {
      /*__TEMPLATES__*/
    }

    /* ---------- 封面风格库（tools/build.js 从 templates/cover/ 注入，请勿手改） ---------- */
    const COVER_STYLES = [
      /*__COVER_STYLES__*/
    ]

    /* ---------- 封面：比例、模型、提示词编译 ---------- */
    const COVER_RATIOS = [
      { value: '2.35:1', size: '2048x872', label: '公众号头图 2.35:1' },
      { value: '3:4', size: '1536x2048', label: '小红书 3:4' },
      { value: '5:2', size: '2048x819', label: '横版 5:2' },
    ]
    /* 方舟的图片模型 ID 会随版本变化；留一个可编辑输入框，账号里开通了哪个就填哪个，
       也可以直接填控制台里的接入点 ID（ep-…）。 */
    const COVER_MODELS = [
      { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0 · 250828' },
      { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5 · 251128' },
      { value: 'doubao-seedream-5-5-261028', label: 'Seedream 5.5 · 261028' },
      { value: 'doubao-seedream-3-0-t2i-250415', label: 'Seedream 3.0 · 旧版（多已下线）' },
    ]

    function coverStyleById(id) {
      for (const style of COVER_STYLES) {
        if (style.id === id) return style
      }
      return COVER_STYLES[0] || { id: 'minimal-visual-metaphor', name: '极简视觉隐喻风', anchors: [], adaptation: [], preserve: [], avoid: [] }
    }

    function coverSizeOf(ratio) {
      for (const item of COVER_RATIOS) {
        if (item.value === ratio) return item.size
      }
      return COVER_RATIOS[0].size
    }

    function coverPlatformOf(ratio) {
      if (ratio === '3:4') return '小红书'
      if (ratio === '5:2') return 'X / 横版社媒'
      return '公众号'
    }

    /* 按 cover-master 的「封面提示词蓝图」把风格原子编译进封面形态：
       一条完整、独立、可直接交给图片模型的提示词，不是风格说明书的拼接。 */
    function buildCoverPrompt(values) {
      const style = coverStyleById(values.style)
      const ratio = values.ratio || '2.35:1'
      const size = coverSizeOf(ratio)
      const platform = coverPlatformOf(ratio)
      const title = String(values.title || '').trim()
      const shortTitle = String(values.shortTitle || '').trim() || title
      const subtitle = String(values.subtitle || '').trim()
      const summary = String(values.summary || '').trim()
      const visual = String(values.visual || '').trim()
      const mood = String(values.mood || '').trim()
      const banned = String(values.banned || '').trim()

      const list = (items) => items.map((item, index) => `  ${index + 1}. ${item}`).join('\n')
      const lines = [
        `# ${style.name} cover prompt`,
        '你是一位顶级封面艺术总监、编辑视觉设计师、字体设计师和图片生成提示词导演。',
        `为${platform}生成一张封面图，画幅比例 ${ratio}，输出尺寸 ${size}。`,
        `必须使用选定视觉风格：${style.name} / ${style.id}。`,
        '该风格不是装饰滤镜。封面的每个关键决策都必须通过该风格的视觉语言实现。',
        '',
        '## 输入',
        `- 标题 / 主题：${title || '（见摘要）'}`,
        `- A 层 / 主视觉标题：${shortTitle || '（见标题）'}`,
        subtitle ? `- C 层 / 副标题或小字：${subtitle}` : '- C 层 / 副标题或小字：无，小字只保留极少量编号或标签',
        `- 平台：${platform}`,
        `- 画幅比例：${ratio}`,
        `- 输出尺寸：${size}`,
        '- 输出模式：单张',
        '- 语言：中文',
        `- 短语境摘要：${summary || title || '（未提供）'}`,
        `- 视觉主体：${visual || '由摘要推导一个具体、可画出来的实体隐喻'}`,
        `- 情绪：${mood || '克制、准确、有锋刃'}`,
        banned ? `- 禁用元素：${banned}` : '- 禁用元素：无',
        '',
        '## 内容理解',
        '先理解源材料再构图，但不要在画面里输出分析。',
        '只用上面给出的派生字段，不要粘贴文章正文进画面或小字系统。',
        '封面必须传达：',
        '1. 第一眼看清主题是什么。',
        '2. 第二眼看懂核心张力、洞见或隐喻。',
        '3. 为什么这张封面属于所选风格，而不是通用封面模板。',
        '',
        `## 风格编译（${style.name}）`,
        style.core ? style.core : '',
        style.anchors.length ? '风格锚点：\n' + list(style.anchors) : '',
        style.adaptation.length ? '封面形态适配：\n' + list(style.adaptation) : '',
        style.preserve.length ? '必须保留：\n' + list(style.preserve) : '',
        style.avoid.length ? '避坑：\n' + list(style.avoid) : '',
        '',
        '## 构图',
        `- 画幅 ${ratio} 的版面从零为这个比例设计，不要上下补白、不要居中横图加边。`,
        '- 单一主视觉中心；主体明确、边界干净、层次 2-3 层。',
        '- 留白是结构的一部分：主视觉之外至少保留 28% 的克制空域。',
        '- 画面必须从版式结构内部生长出来，而不是"照片贴在排字上"。',
        '',
        '## 文字系统',
        `- 画面中只出现这些文字，逐字照抄，中文用中文引号：主标题「“${shortTitle || title}”」${subtitle ? `，副标题「“${subtitle}”」` : ''}。`,
        '- 中文用与风格匹配的字重与字形（黑体/宋体/几何窄体按风格要求），字要真排出来，不是乱码、不是伪文字、不是英文占位。',
        '- 字与图的关系按风格定义处理：字可被图像穿过、切分、压在实体上，但每个字都必须可读。',
        '- 不要出现任何额外文字：无水印、无 logo、无二维码、无页码、无英文标语。',
        '',
        '## 质感与光线',
        '- 单一明确的光源方向，阴影短而干净。',
        '- 材质真实：纸张颗粒、油墨、金属、纸层、剪影等按风格落地，不要塑料感。',
        '- 色彩克制：全画面 1 个主色相 + 1 个语义强调色，按风格给定。',
        '',
        '## 明确禁止',
        '- 不要 PPT 封面感、课程封面感、电商海报感。',
        '- 不要通用信息图模板、图标阵列、箭头流程、发光科技底纹。',
        '- 不要拼贴多张风格、不要风格混搭、不要加装饰性花边。',
        '- 不要在画面边缘加白框、黑框、圆角卡片或手机 mockup。',
        banned ? `- 额外禁止：${banned}` : '',
        '',
        '## 输出',
        `- 画幅 ${ratio}，${size}，单张成品，满版构图，无水印无不必要留边。`,
        '- 只输出这张封面图本身，不要输出说明文字或分析。',
      ]
      return lines.filter((line) => line !== '' || true).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    }

    /* ---------- 运行时上下文 ---------- */
    let clientCtx = null
    let translate = (key) => key

    function t(key, params) {
      let text = translate(key)
      if (params) {
        text = String(text).replace(/\{(\w+)\}/g, (m, name) =>
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
        )
      }
      return text
    }

    /* ---------- 文案 ---------- */
    const DICT = {
      zh: {
        'panel.label': '老欧写作工作台',
        'trigger.label': '写作',
        'trigger.title': '打开老欧写作工作台',
        title: '老欧写作工作台',
        subtitle: '六阶段提示词流水线 · 选阶段、填字段、一键发给模型',
        'flow.label': '流水线',
        'rail.title': '六个阶段',
        'label.target': '目标会话',
        'label.mode': '发送方式',
        'mode.queue': '排队',
        'mode.steer': '打断',
        'session.blank': '（新会话）',
        'session.none': '暂无会话',
        'session.newFlow': '＋ 新流程（DSH-Writing desk）',
        'action.newFlow': '新流程',
        'hint.newFlow': '发送时会在 DSH-Writing desk 工作区里新建一个会话并打开，成稿也存进这个工作区。',
        'note.save': '（完成后请把成稿保存到 `{folder}`：这是本次会话的专属目录（绝对路径，在 DSH-Writing desk 工作区之下），不存在就先 `mkdir -p`。文件名用最终标题并去掉标点，形如 `<日期>-<标题>.md`；保存后回复相对工作区的路径。）',
        'note.saveKnown': '（本次若生成了成稿或文件，请保存到 `{folder}`（绝对路径），保存后回复相对路径。）',
        'status.workspace': '正在准备 DSH-Writing desk 工作区…',
        'status.newSession': '正在新建会话…',
        'note.saveGeneric': '（完成后请把成稿保存到当前工作区的 `稿件/` 目录，文件名用 `<日期>-<标题>.md`，并回复相对路径。）',
        'status.folder': '稿件目录 {folder}',
        'status.folderFailed': '稿件目录没建出来（{message}），已让模型自己 mkdir -p {folder}',
        'status.workspaceFailed': '准备写作工作区失败：{message}',
        'label.fields': '填写内容',
        'label.template': '本阶段提示词模板（只改本机，不影响其他电脑）',
        'label.preview': '拼装好的提示词（可以直接手改）',
        'hint.chars': '共 {count} 字符',
        'action.editTemplate': '编辑模板',
        'action.hideTemplate': '收起模板',
        'action.resetTemplate': '恢复默认模板',
        'action.regenerate': '重新拼装',
        'action.clear': '清空本阶段',
        'action.copy': '复制提示词',
        'action.copied': '已复制',
        'action.sendQueue': '发送到会话',
'action.sendSteer': '发送并打断',
        'action.runRemaining': '⚡ 一键跑完后续',
        'action.runRemainingTip': '从「{stage}」开始，把剩下的 {total} 个环节一次排队发出去，模型会连续跑完，不用你再点',
        'note.coverGuide': '（下面是封面图片提示词，用来交给豆包 seedream 出图。请只做两件事：① 评估它是否准确表达了标题与摘要；② 给出改进版提示词。不要用 Python／PIL／Canvas／SVG 自行绘制封面，也不要声称已经生成图片——封面图由工作台的「生成封面」按钮直接调用豆包输出。）',
        'hint.coverPanel': '「生成封面」= 直接调豆包 seedream 出图并落盘；把提示词发给模型，只会得到文字建议，模型不会画图。',
        'note.chain': '【连续执行 {index}/{total}】本环节是「{stage}」。请直接基于上文已有的产物继续，不要停下来问我、不要重复确认。信息不足就用最合理的推断，并在结尾用一行注明「假设：…」。按本环节要求的格式输出，最后另起一行写「▶ 下一步：<下一环节>」。',
        'status.chainSent': '已排队 {done}/{total} 个环节…',
        'status.chainDone': '已按顺序发出 {count}/{total} 个环节，「{title}」里会连续跑完',
        'status.chainStopped': '第 {index} 个环节发送失败（{message}），后面的环节没有发',
        'action.pipeline': '一键全流程',
        'action.viewSession': '去会话看结果',
        'hint.file': '素材在工作区文件里时填路径（模型会去读）；文件也可以直接拖进下面的上传区。',
        'label.files': '附件（可选，发送时一起上传给模型）',
        'hint.drop': '把文件拖到这里，或点「选择文件」；可以选多个，发送时统一上传。',
        'action.pickFile': '选择文件',
        'action.removeFile': '移除附件',
        'files.count': '已选 {count} 个文件',
        'note.attachments': '（本次随信附带 {count} 个文件：{names}。请先读取这些文件；如与上方内容重复，以文件内容为准。）',
        'status.uploading': '正在上传附件：{name}…',
        'status.uploadFailed': '附件上传失败：{message}',
        'status.progress': '{done}/{total} 阶段已填写',
        'status.sending': '发送中…',
        'status.sent': '已发送（排队），模型会接着处理',
        'status.sentSteer': '已发送，正在打断当前回复',
        'status.sentTo': '已发送到「{title}」',
        'status.failed': '发送失败：{message}',
        'status.empty': '提示词为空，先填内容或「重新拼装」',
        'status.missing': '请先填写必填字段：{fields}',
        'status.noSession': '没有可发送的会话，先在左侧打开或新建一个会话',
        'status.noService': '会话服务不可用，请刷新页面后重试',
        'status.copied': '提示词已复制到剪贴板',
        'status.copyFailed': '复制失败，请手动选择文本复制',
        'status.filled': '本阶段已填写',
        'label.coverKey': '火山方舟 API Key（只存在这台电脑的浏览器里）',
        'hint.coverKey': '在火山方舟控制台建一个 API Key 粘到这里；只随本次请求发给本机 DSH 宿主，不写配置、不进日志。模型要先在方舟「开通管理」里开通，否则会报 404 does not exist or you do not have access——换版本或填接入点 ID（ep-…）。',
        'action.generateCover': '生成封面',
        'label.coverResult': '封面结果',
        'status.coverBusy': '正在调用豆包 seedream 出图…',
        'status.coverDone': '封面已生成',
        'status.coverSaved': '封面已生成并保存到 {path}',
        'status.coverFailed': '封面生成失败：{message}',
        'status.coverNoKey': '先填火山方舟 API Key 才能出图',
        'preview.empty': '（提示词会在这里实时拼装）',
      },
      en: {
        'panel.label': 'Lao Ou Writing Workbench',
        'trigger.label': 'Writing',
        'trigger.title': 'Open the Lao Ou writing workbench',
        title: 'Lao Ou Writing Workbench',
        subtitle: 'Six-stage prompt pipeline — pick a stage, fill the fields, send',
        'flow.label': 'Pipeline',
        'rail.title': 'Stages',
        'label.target': 'Target session',
        'label.mode': 'Send as',
        'mode.queue': 'Queue',
        'mode.steer': 'Interrupt',
        'session.blank': '(new session)',
        'session.none': 'No session yet',
        'session.newFlow': '+ New flow (DSH-Writing desk)',
        'action.newFlow': 'New flow',
        'hint.newFlow': 'Sending starts a brand-new session in the DSH-Writing desk workspace, opens it, and keeps the manuscript there.',
        'note.save': '(When done, save the finished draft into `{folder}` — this session’s own folder (absolute path, inside the DSH-Writing desk workspace); `mkdir -p` it first if missing. Name the file after the final title with punctuation stripped, shaped like `<date>-<title>.md`, and reply with the path relative to the workspace.)',
        'note.saveKnown': '(If this run produces a draft or any file, save it into `{folder}` (absolute path) and reply with the relative path.)',
        'status.workspace': 'Preparing the DSH-Writing desk workspace…',
        'status.newSession': 'Starting a new session…',
        'note.saveGeneric': '(When done, save the finished draft into the `稿件/` directory of the current workspace as `<date>-<title>.md`, and reply with the relative path.)',
        'status.folder': 'drafts folder {folder}',
        'status.folderFailed': 'could not create {folder} ({message}); the model will mkdir -p it itself',
        'status.workspaceFailed': 'Could not prepare the writing workspace: {message}',
        'label.fields': 'Inputs',
        'label.template': 'Prompt template for this stage (local edits only)',
        'label.preview': 'Assembled prompt (editable)',
        'hint.chars': '{count} characters',
        'action.editTemplate': 'Edit template',
        'action.hideTemplate': 'Hide template',
        'action.resetTemplate': 'Reset template',
        'action.regenerate': 'Rebuild',
        'action.clear': 'Clear this stage',
        'action.copy': 'Copy prompt',
        'action.copied': 'Copied',
        'action.sendQueue': 'Send to session',
'action.sendSteer': 'Send & interrupt',
        'action.runRemaining': '⚡ Run the rest',
        'action.runRemainingTip': 'Starting at “{stage}”, queue the remaining {total} stage(s) so the model runs them back to back',
        'note.coverGuide': '(Below is an image prompt meant for Doubao seedream. Do exactly two things: ① judge whether it expresses the title and summary accurately; ② give an improved prompt. Do NOT render the cover yourself with Python/PIL/Canvas/SVG, and do not claim an image was generated — the image comes from the workbench’s “Generate cover” button, which calls Doubao directly.)',
        'hint.coverPanel': '“Generate cover” calls Doubao seedream and saves the file; sending the prompt to the model only returns text advice — the model cannot draw images.',
        'note.chain': '[Chained run {index}/{total}] This step is “{stage}”. Continue directly from what is already in the thread; do not stop to ask me and do not re-confirm. If something is missing, infer the most reasonable reading and close with one line “假设：…”. Follow this step’s format, then end with a line “▶ 下一步：<next stage>”.',
        'status.chainSent': 'Queued {done}/{total} stages…',
        'status.chainDone': 'Queued {count}/{total} stages in order — “{title}” will run them back to back',
        'status.chainStopped': 'Stage {index} failed to send ({message}); later stages were not queued',
        'action.pipeline': 'Run the whole pipeline',
        'action.viewSession': 'View result',
        'hint.file': 'Fill the path when the material lives in a workspace file (the model reads it); you can also drop files onto the upload area below.',
        'label.files': 'Attachments (optional, uploaded with the prompt)',
        'hint.drop': 'Drop files here, or click “Choose files”; several are fine, they upload together on send.',
        'action.pickFile': 'Choose files',
        'action.removeFile': 'Remove attachment',
        'files.count': '{count} file(s) selected',
        'note.attachments': '(Attached with this request: {count} file(s): {names}. Read them first; where they overlap the text above, the files win.)',
        'status.uploading': 'Uploading attachment: {name}…',
        'status.uploadFailed': 'Attachment upload failed: {message}',
        'status.progress': '{done}/{total} stages filled',
        'status.sending': 'Sending…',
        'status.sent': 'Sent (queued); the model takes it from here',
        'status.sentSteer': 'Sent; interrupting the running reply',
        'status.sentTo': 'Sent to "{title}"',
        'status.failed': 'Send failed: {message}',
        'status.empty': 'The prompt is empty — fill the fields or hit "Rebuild"',
        'status.missing': 'Fill the required fields first: {fields}',
        'status.noSession': 'No session to send into — open or create one first',
        'status.noService': 'Session service is unavailable; reload the page',
        'status.copied': 'Prompt copied to the clipboard',
        'status.copyFailed': 'Copy failed; select the text manually',
        'status.filled': 'Filled in',
        'label.coverKey': 'Volcano Ark API key (kept in this browser only)',
        'hint.coverKey': 'Create an API key in the Volcano Ark console and paste it here; it travels only with this request to your local DSH host — never into config files or logs. The model must be activated under 开通管理 first, otherwise Ark answers 404 does not exist or you do not have access — switch versions or paste an endpoint id (ep-…).',
        'action.generateCover': 'Generate cover',
        'label.coverResult': 'Cover result',
        'status.coverBusy': 'Generating the cover with Doubao seedream…',
        'status.coverDone': 'Cover generated',
        'status.coverSaved': 'Cover generated and saved to {path}',
        'status.coverFailed': 'Cover generation failed: {message}',
        'status.coverNoKey': 'Fill in the Volcano Ark API key first',
        'preview.empty': '(the assembled prompt appears here)',
      },
    }

    /* ---------- 工具 ---------- */
    function lsGet(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (err) {
        return null
      }
    }
    function lsSet(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (err) {
        /* quota / private mode：忽略 */
      }
    }
    function lsDel(key) {
      try {
        window.localStorage.removeItem(key)
      } catch (err) {
        /* 忽略 */
      }
    }
    function fileNote(file) {
      const f = typeof file === 'string' ? file.trim() : ''
      return f
        ? '\n\n（素材文件：' + f + '。请先读取该文件；如与上方内容重复，以文件内容为准。）'
        : ''
    }

    /* ---------- 六个写作阶段 + 一条龙 ---------- */
    const STAGES = [
      {
        id: 'topic',
        num: '①',
        short: '选题',
        name: '文章选题角度（黑天鹅版）',
        blurb: '诊断平庸角度，给出侧门 / 反直觉 / 沉默证据三个角度，再逐一做黑天鹅拷问。',
        fields: [
          {
            key: 'topic',
            label: '老欧的话题 / 素材',
            kind: 'textarea',
            required: true,
            rows: 6,
            placeholder: '把你手上想写的话题、素材、链接或观察写在这里，越具体越好…',
          },
          {
            key: 'file',
            label: '素材文件路径（可选）',
            placeholder: '素材在工作区文件里时填路径，例如：03.写作skill/素材.docx',
          },
        ],
        compose(v, tpl) {
          return tpl + '\n\n---\n\n**老欧的话题是**：\n' + (v.topic || '') + fileNote(v.file)
        },
      },
      {
        id: 'structure',
        num: '②',
        short: '结构',
        name: '写作结构（SUCCESs 版）',
        blurb: '把主题与素材写成一篇符合老欧风格的公众号长文（3000 字量级）。',
        fields: [
          {
            key: 'topic',
            label: '文章主题与核心主张（一句话说清"山头"）',
            kind: 'textarea',
            required: true,
            rows: 4,
            placeholder: '如果只能让读者记住一件事，是哪一件？先想清楚再动笔。',
          },
          {
            key: 'materials',
            label: '素材与要点（可选）',
            kind: 'textarea',
            rows: 5,
            placeholder: '个人经历、他人故事、具体数据、文化/历史参照…',
          },
          { key: 'file', label: '素材文件路径（可选）', placeholder: '素材在工作区文件里时填路径' },
        ],
        compose(v, tpl) {
          return (
            tpl +
            '\n\n---\n\n**本次写作任务**：请以「老欧」的身份，严格按照以上《写作结构模板》的要求，写一篇完整的公众号长文。\n\n' +
            '**文章主题与核心主张**：\n' + (v.topic || '') +
            '\n\n**素材与要点（可选）**：\n' + (v.materials || '') +
            fileNote(v.file)
          )
        },
      },
      {
        id: 'polish',
        num: '③',
        short: '润色',
        name: '文章润色',
        blurb: '去 AI 味、书面腔和翻译腔，改成老欧的口语节奏。',
        fields: [
          {
            key: 'text',
            label: '待润色的原始文案',
            kind: 'textarea',
            required: true,
            rows: 10,
            placeholder: '把初稿粘贴到这里，会按「老欧」的口语风格润色…',
          },
          { key: 'file', label: '原文文件路径（可选）', placeholder: '原文在工作区文件里时填路径' },
        ],
        compose(v, tpl) {
          return tpl + '\n\n---\n\n**待润色的原始文案：**\n\n' + (v.text || '') + fileNote(v.file)
        },
      },
      {
        id: 'spread',
        num: '④',
        short: '传播',
        name: '传播优化改造',
        blurb: '按《引爆点》三法则 + SUCCESs 六原则做最小结构改造，提升转发。',
        fields: [
          {
            key: 'text',
            label: '待改造的文章全文',
            kind: 'textarea',
            required: true,
            rows: 10,
            placeholder: '把文章全文粘贴到这里，按《引爆点》三法则 + SUCCESs 六原则做最小结构改造…',
          },
          { key: 'file', label: '文章文件路径（可选）', placeholder: '文章在工作区文件里时填路径' },
        ],
        compose(v, tpl) {
          return tpl + '\n\n---\n\n**待改造的文章原文：**\n\n' + (v.text || '') + fileNote(v.file)
        },
      },
      {
        id: 'check',
        num: '⑤',
        short: '自检',
        name: '文章自检（L1–L4）',
        blurb: '硬规则 → 风格 → 深度 → 活人感，四层逐条自查并给修改建议。',
        fields: [
          {
            key: 'text',
            label: '待自检的文章全文',
            kind: 'textarea',
            required: true,
            rows: 10,
            placeholder: '把成稿粘贴到这里，按 L1 硬规则 → L2 风格 → L3 深度 → L4 活人感逐层自检…',
          },
          { key: 'file', label: '文章文件路径（可选）', placeholder: '文章在工作区文件里时填路径' },
        ],
        compose(v, tpl) {
          return tpl + '\n\n---\n\n**待自检的文章全文：**\n\n' + (v.text || '') + fileNote(v.file)
        },
      },
      {
        id: 'title',
        num: '⑥',
        short: '标题',
        name: '标题与封面摘要',
        blurb: '出 12 组标题 + 封面摘要，按公众号传播规律筛出最优几组。',
        fields: [
          { key: 'topic', label: '文章主题', required: true, placeholder: '例如：职场人如何应对中年危机' },
          {
            key: 'core',
            label: '文章核心内容',
            kind: 'textarea',
            rows: 4,
            placeholder: '主要观点、核心案例或干货结论，越具体越好',
          },
          { key: 'readers', label: '目标读者', placeholder: '例如：25 到 40 岁的职场人' },
          { key: 'tone', label: '文章风格基调', placeholder: '例如：犀利有态度 / 温暖治愈 / 故事感强' },
          { key: 'action', label: '希望读者完成的行动', placeholder: '例如：点击阅读全文 / 收藏转发 / 关注公众号' },
        ],
        compose(v, tpl) {
          return (
            tpl +
            '\n\n---\n\n**请根据以下信息生成标题与封面摘要：**\n\n' +
            '文章主题：' + (v.topic || '') + '\n' +
            '文章核心内容：' + (v.core || '') + '\n' +
            '目标读者：' + (v.readers || '') + '\n' +
            '文章风格基调：' + (v.tone || '') + '\n' +
            '希望读者完成的行动：' + (v.action || '')
          )
        },
      },
      {
        id: 'cover',
        num: '⑦',
        short: '封面',
        name: '封面生成（豆包 seedream 以文生图）',
        blurb: '按你选的视觉风格，把内容编译成封面提示词，直接调火山方舟出图并存进本次的稿件目录。',
        fields: [
          {
            key: 'title',
            label: '封面标题（整张图的主题）',
            required: true,
            placeholder: '例如：中年转行，先算清这三笔账',
          },
          { key: 'shortTitle', label: '主视觉标题（A 层，短一点更有力）', placeholder: '留空则用封面标题' },
          { key: 'subtitle', label: '副标题 / 小字（C 层，可留空）', placeholder: '例如：一个 42 岁程序员的复盘' },
          {
            key: 'summary',
            label: '内容摘要（决定画面隐喻）',
            kind: 'textarea',
            rows: 3,
            placeholder: '两三句话说清文章最想传达的那一件事',
          },
          { key: 'visual', label: '画面主体 / 隐喻（可选）', placeholder: '例如：一张被反复涂改的简历' },
          { key: 'mood', label: '情绪（可选）', placeholder: '例如：克制、冷静、带一点锋利' },
          { key: 'banned', label: '不要出现（可选）', placeholder: '例如：不要人脸、不要红色' },
          {
            key: 'style',
            label: '视觉风格（17 选 1）',
            kind: 'select',
            required: true,
            options: COVER_STYLES.map((style) => ({ value: style.id, label: style.name })),
          },
          {
            key: 'ratio',
            label: '画幅比例',
            kind: 'select',
            required: true,
            options: COVER_RATIOS.map((item) => ({ value: item.value, label: item.label })),
          },
        ],
        compose(v) {
          return buildCoverPrompt(v)
        },
      },
    ]

    /* 一条龙：直接调 lao-ou-article-pipeline 的思路，把需求交给模型 */
    const PIPELINE_STAGE = {
      id: 'pipeline',
      num: '🎯',
      short: '全流程',
      name: '六阶段一条龙',
      blurb: '不用一步步来：给出主题和素材，模型按六阶段跑完并一次性交稿。',
      fields: [
        {
          key: 'brief',
          label: '主题 / 素材 / 要求',
          kind: 'textarea',
          required: true,
          rows: 8,
          placeholder: '例如：写一篇关于"中年人开始学编程"的文章，素材是我身边两个转行的朋友，2500 字左右，语气别太鸡汤…',
        },
        { key: 'file', label: '素材文件路径（可选）', placeholder: '素材在工作区文件里时填路径' },
      ],
      compose(v, tpl) {
        return tpl + '\n\n---\n\n**本次写作需求**：\n' + (v.brief || '') + fileNote(v.file)
      },
    }

    const ALL_STAGES = [PIPELINE_STAGE, ...STAGES]
    const STAGE_BY_ID = {}
    for (const stage of ALL_STAGES) STAGE_BY_ID[stage.id] = stage

    function loadValues(stageId) {
      const raw = lsGet(LS + 'values:' + stageId)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') return parsed
        } catch (err) {
          /* 损坏数据：回退空对象 */
        }
      }
      return {}
    }
    function loadTemplateOverride(stageId) {
      const raw = lsGet(LS + 'tpl:' + stageId)
      return raw == null ? null : raw
    }
    function compose(stage, values, template) {
      const body = (template || '').trim()
      try {
        return stage.compose(values, body)
      } catch (err) {
        return body
      }
    }
    function isStageFilled(stage, values) {
      const required = stage.fields.filter((field) => field.required)
      if (required.length === 0) return false
      return required.every((field) => String(values[field.key] || '').trim() !== '')
    }

    /* ---------- 样式（随组件挂载/卸载） ---------- */
    /* ---------- 样式（随组件挂载/卸载） ---------- */
    /* 版式参考左侧栏里的成熟工作台（信息层次、克制的强调色、瓷面质感），
       但保留自己的写作气质：宋体标题、竖排时间线、稿纸横线底纹。 */
    const CSS = `
.lou-wb-icon{display:block;color:inherit;opacity:.85}
.lou-wb-icon.is-active{opacity:1}

.lou-wb-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;
 border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;
 color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;
 transition:background .15s ease,color .15s ease,border-color .15s ease;white-space:nowrap}
.lou-wb-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lou-wb-trigger-icon{font-size:13px;line-height:1;transform:translateY(-.5px)}
.lou-wb-trigger-text{font-size:11.5px;line-height:1;letter-spacing:.2px}
.lou-wb-fileinput{display:none}

.lou-wb-page{
 --lou-serif:"Songti SC","STSong","Noto Serif SC",ui-serif,Georgia,serif;
 --lou-ink:var(--dsw-alias-label-primary);
 --lou-ink2:var(--dsw-alias-label-secondary);
 --lou-ink3:color-mix(in srgb,var(--dsw-alias-label-secondary) 70%,transparent);
 --lou-line:var(--dsw-alias-border-l1);
 --lou-line2:var(--dsw-alias-border-l2);
 --lou-card:var(--dsw-alias-bg-layer-1);
 --lou-soft:var(--dsw-alias-bg-layer-2);
 --lou-brand:var(--dsw-alias-brand-primary);
 --lou-ease:cubic-bezier(.2,.8,.2,1);
 position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;
 background:var(--dsw-alias-bg-base);color:var(--lou-ink);
 font:inherit;font-size:13.5px;line-height:1.7;overflow:hidden}
.lou-wb-page *{box-sizing:border-box}
.lou-wb-page :focus-visible{outline:2px solid var(--lou-brand);outline-offset:2px}

.lou-wb-topbar{position:relative;z-index:5;flex:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
 padding:calc(10px + var(--dsh-frame-top-clearance,0px)) clamp(14px,2vw,22px) 10px;
 border-bottom:1px solid var(--lou-line);
 background:color-mix(in srgb,var(--lou-card) 86%,transparent);backdrop-filter:blur(16px) saturate(150%)}
.lou-wb-brand{display:flex;align-items:center;gap:9px;min-width:0}
.lou-wb-seal{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;flex:none;
 font-family:var(--lou-serif);font-size:15px;line-height:1;color:var(--lou-brand);
 background:color-mix(in srgb,var(--lou-brand) 12%,transparent);
 box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lou-brand) 32%,transparent)}
.lou-wb-brand-text{min-width:0}
.lou-wb-title{margin:0;font-family:var(--lou-serif);font-size:15.5px;font-weight:600;line-height:1.3;
 letter-spacing:.3px;white-space:nowrap}
.lou-wb-sub{margin:1px 0 0;font-size:11px;line-height:1.4;color:var(--lou-ink2);
 max-width:min(46vw,380px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lou-wb-ver{flex:none;font-size:10.5px;line-height:1;padding:3px 6px;border-radius:999px;
 font-variant-numeric:tabular-nums;color:var(--lou-ink2);background:var(--lou-soft)}
.lou-wb-tools{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}

.lou-wb-select{height:30px;max-width:230px;padding:0 8px;border-radius:9px;border:1px solid var(--lou-line2);
 background:var(--lou-card);color:var(--lou-ink);font:inherit;font-size:12px;outline:none;
 transition:border-color .15s var(--lou-ease)}
.lou-wb-select:hover{border-color:color-mix(in srgb,var(--lou-brand) 45%,var(--lou-line2))}
.lou-wb-seg{display:inline-flex;align-items:center;gap:2px;height:30px;padding:2px;border-radius:9px;background:var(--lou-soft)}
.lou-wb-seg button{appearance:none;border:none;background:transparent;color:var(--lou-ink2);font:inherit;
 font-size:12px;height:26px;padding:0 10px;border-radius:7px;cursor:pointer;
 transition:background .15s var(--lou-ease),color .15s var(--lou-ease)}
.lou-wb-seg button:hover{color:var(--lou-ink)}
.lou-wb-seg button.is-on{background:var(--lou-card);color:var(--lou-ink);font-weight:600;
 box-shadow:0 1px 2px color-mix(in srgb,var(--lou-ink) 12%,transparent)}
.lou-wb-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 11px;
 border:1px solid var(--lou-line2);border-radius:9px;background:var(--lou-card);color:var(--lou-ink);
 font:inherit;font-size:12.5px;line-height:1;cursor:pointer;white-space:nowrap;
 transition:background .15s var(--lou-ease),border-color .15s var(--lou-ease),transform .2s var(--lou-ease)}
.lou-wb-btn:hover{background:var(--lou-soft)}
.lou-wb-btn:active{transform:translateY(.5px)}
.lou-wb-btn:disabled{opacity:.45;cursor:not-allowed}
.lou-wb-btn.is-primary{background:var(--lou-brand);border-color:transparent;color:var(--dsw-alias-bg-base);
 font-weight:600;box-shadow:0 2px 8px -4px color-mix(in srgb,var(--lou-brand) 70%,transparent)}
.lou-wb-btn.is-primary:hover{background:color-mix(in srgb,var(--lou-brand) 86%,var(--lou-ink))}
.lou-wb-btn.is-quiet{background:transparent;border-color:transparent;color:var(--lou-ink2);padding:0 8px}
.lou-wb-btn.is-quiet:hover{background:var(--lou-soft);color:var(--lou-ink)}
.lou-wb-btn.is-accent{border-color:color-mix(in srgb,var(--lou-brand) 42%,transparent);color:var(--lou-brand);
 background:color-mix(in srgb,var(--lou-brand) 9%,transparent);font-weight:600}
.lou-wb-btn.is-accent:hover{background:color-mix(in srgb,var(--lou-brand) 16%,transparent)}

.lou-wb-scroll{flex:1;min-height:0;overflow:auto;position:relative;z-index:1;
 scrollbar-gutter:stable;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.lou-wb-content{max-width:1060px;margin:0 auto;padding:20px clamp(14px,2.4vw,30px) 26px}

.lou-wb-hero{margin-bottom:14px}
.lou-wb-hero-kicker{display:flex;align-items:center;gap:8px;font-size:10.5px;letter-spacing:.14em;
 text-transform:uppercase;color:var(--lou-ink3)}
.lou-wb-hero-title{margin:4px 0 3px;font-family:var(--lou-serif);font-size:21px;font-weight:600;
 line-height:1.35;letter-spacing:.4px}
.lou-wb-hero-sub{margin:0;font-size:12.5px;color:var(--lou-ink2);max-width:64ch}
.lou-wb-hero-note{margin:8px 0 0;font-size:10.5px;color:var(--lou-ink3);font-variant-numeric:tabular-nums}
.lou-wb-ticks{display:flex;align-items:center;gap:5px;margin-top:12px}
.lou-wb-tick{height:4px;flex:1;border-radius:999px;cursor:pointer;border:none;padding:0;
 background:color-mix(in srgb,var(--lou-line2) 78%,transparent);
 transition:background .25s var(--lou-ease),opacity .15s var(--lou-ease)}
.lou-wb-tick:hover{background:color-mix(in srgb,var(--lou-brand) 38%,var(--lou-line2))}
.lou-wb-tick.is-filled{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 70%,transparent)}
.lou-wb-tick.is-current{background:var(--lou-brand)}
.lou-wb-meter-text{margin-left:6px;font-size:10.5px;color:var(--lou-ink2);
 font-variant-numeric:tabular-nums;white-space:nowrap}

.lou-wb-cols{display:grid;grid-template-columns:minmax(190px,222px) minmax(0,1fr);gap:14px;
 align-items:start;margin-top:14px}
.lou-wb-rail{padding:12px 10px}
.lou-wb-rail-title{font-size:10px;letter-spacing:.16em;text-transform:uppercase;
 color:var(--lou-ink3);padding:0 8px 8px}
.lou-wb-steps{display:flex;flex-direction:column;gap:2px;position:relative}
.lou-wb-steps::before{content:"";position:absolute;left:17px;top:12px;bottom:12px;width:1px;
 background:var(--lou-line2);pointer-events:none}
.lou-wb-step{position:relative;display:flex;gap:9px;align-items:flex-start;width:100%;text-align:left;
 border:1px solid transparent;background:transparent;border-radius:11px;padding:6px 8px;cursor:pointer;
 font:inherit;color:var(--lou-ink2);transition:background .15s var(--lou-ease),color .15s var(--lou-ease)}
.lou-wb-step:hover{background:var(--lou-soft);color:var(--lou-ink)}
.lou-wb-step.is-on{background:color-mix(in srgb,var(--lou-brand) 9%,transparent);color:var(--lou-ink)}
.lou-wb-step-num{position:relative;z-index:1;display:grid;place-items:center;width:20px;height:20px;
 flex:none;border-radius:50%;background:var(--lou-card);border:1px solid var(--lou-line2);
 font-size:10px;line-height:1;font-variant-numeric:tabular-nums;color:var(--lou-ink2)}
.lou-wb-step.is-on .lou-wb-step-num{background:var(--lou-brand);border-color:transparent;
 color:var(--dsw-alias-bg-base);font-weight:600}
.lou-wb-step.is-filled .lou-wb-step-num{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,var(--lou-card));
 border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,transparent);
 color:var(--dsw-alias-state-success-primary)}
/* 当前阶段压过“已填写”，避免两种状态色在同一颗圆点上打架 */
.lou-wb-step.is-on.is-filled .lou-wb-step-num{background:var(--lou-brand);border-color:transparent;
 color:var(--dsw-alias-bg-base)}
.lou-wb-step-check{margin-left:auto;flex:none;font-size:10px;line-height:1;padding-top:3px;
 color:var(--dsw-alias-state-success-primary)}
.lou-wb-step-text{min-width:0;flex:1}
.lou-wb-step-name{display:block;font-size:12.5px;font-weight:600;line-height:1.4}
.lou-wb-step-blurb{display:block;font-size:10px;line-height:1.5;color:var(--lou-ink3);margin-top:1px}
.lou-wb-rail-sep{height:1px;background:var(--lou-line);margin:7px 6px}

.lou-wb-main{min-width:0;display:flex;flex-direction:column;gap:12px}
.lou-wb-panel{background:var(--lou-card);border:1px solid var(--lou-line);border-radius:15px;
 padding:14px 16px 15px;min-width:0}
.lou-wb-panel-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.lou-wb-panel-title{margin:0;font-family:var(--lou-serif);font-size:14.5px;font-weight:600;line-height:1.4}
.lou-wb-panel-sub{margin:2px 0 0;font-size:10.5px;color:var(--lou-ink3)}
.lou-wb-panel-actions{margin-left:auto;display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end}

.lou-wb-form{display:flex;flex-direction:column;gap:10px}
.lou-wb-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lou-wb-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.lou-wb-label{display:flex;align-items:center;gap:3px;font-size:11.5px;color:var(--lou-ink2)}
.lou-wb-req{color:var(--dsw-alias-state-error-primary)}
.lou-wb-input,.lou-wb-textarea{width:100%;padding:8px 10px;border-radius:10px;
 border:1px solid var(--lou-line2);background:var(--lou-card);color:var(--lou-ink);
 font:inherit;font-size:12.5px;line-height:1.65;outline:none;
 transition:border-color .15s var(--lou-ease),box-shadow .15s var(--lou-ease)}
.lou-wb-input::placeholder,.lou-wb-textarea::placeholder{color:var(--lou-ink3)}
.lou-wb-input:focus,.lou-wb-textarea:focus{border-color:var(--lou-brand);
 box-shadow:0 0 0 3px color-mix(in srgb,var(--lou-brand) 16%,transparent)}
.lou-wb-textarea{resize:vertical;min-height:86px}
.lou-wb-hint{font-size:10.5px;line-height:1.6;color:var(--lou-ink3)}
.lou-wb-empty{padding:24px 14px;text-align:center;font-family:var(--lou-serif);
 font-size:12.5px;color:var(--lou-ink3)}

.lou-wb-paper{border-radius:10px;padding:10px 12px;
 background:repeating-linear-gradient(to bottom,transparent 0,transparent 27px,
  color-mix(in srgb,var(--lou-line) 75%,transparent) 27px,
  color-mix(in srgb,var(--lou-line) 75%,transparent) 28px)}
.lou-wb-preview{font-family:var(--lou-serif);font-size:13px;line-height:28px;min-height:224px;
 background:transparent;border:none;padding:0;resize:vertical}
.lou-wb-preview:focus{border:none;box-shadow:none;outline:none}
.lou-wb-paper:focus-within{outline:2px solid var(--lou-brand);outline-offset:2px}

.lou-wb-drop{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border-radius:11px;
 border:1px dashed var(--lou-line2);background:color-mix(in srgb,var(--lou-soft) 55%,transparent);
 transition:border-color .15s var(--lou-ease),background .15s var(--lou-ease)}
.lou-wb-drop:hover{border-color:color-mix(in srgb,var(--lou-brand) 45%,var(--lou-line2))}
.lou-wb-drop.is-over{border-color:var(--lou-brand);background:color-mix(in srgb,var(--lou-brand) 9%,transparent)}
.lou-wb-drop-icon{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:7px;
 background:var(--lou-soft);color:var(--lou-ink2);font-size:13px;line-height:1}
.lou-wb-drop-text{flex:1;min-width:0;font-size:10.5px;line-height:1.5;color:var(--lou-ink2)}
.lou-wb-files{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;padding:0}
.lou-wb-file{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 9px;border-radius:999px;
 background:var(--lou-soft);font-size:11px;line-height:1.5;max-width:100%}
.lou-wb-file-name{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lou-wb-file-size{color:var(--lou-ink3);font-variant-numeric:tabular-nums}
.lou-wb-file-remove{appearance:none;border:none;background:transparent;color:var(--lou-ink3);
 cursor:pointer;font:inherit;font-size:13px;line-height:1;padding:1px 3px;border-radius:50%}
.lou-wb-file-remove:hover{color:var(--dsw-alias-state-error-primary);
 background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}

.lou-wb-select-field{width:100%;height:32px;padding:0 8px;font-size:12.5px}
.lou-wb-cover{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding:12px 13px;
 border-radius:12px;border:1px dashed color-mix(in srgb,var(--lou-brand) 38%,var(--lou-line2));
 background:color-mix(in srgb,var(--lou-brand) 4%,transparent)}
.lou-wb-cover-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.lou-wb-cover-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lou-wb-key{flex:1;min-width:180px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.lou-wb-model{flex:0 0 190px;min-width:150px;font-size:11.5px}
.lou-wb-cover-note{font-size:11.5px;line-height:1.6;color:var(--lou-ink2);padding:8px 10px;
 border-radius:9px;background:color-mix(in srgb,var(--lou-brand) 8%,transparent)}
.lou-wb-cover-result{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.lou-wb-cover-img{width:100%;max-height:340px;object-fit:contain;border-radius:9px;
 border:1px solid var(--lou-line);background:var(--lou-soft)}
.lou-wb-cover-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--lou-ink3)}
.lou-wb-cover-path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;
 color:var(--lou-ink2);word-break:break-all}
.lou-wb-foot{flex:none;z-index:4;display:flex;align-items:center;gap:10px;
 padding:9px clamp(14px,2vw,22px);border-top:1px solid var(--lou-line);
 background:color-mix(in srgb,var(--lou-card) 88%,transparent);backdrop-filter:blur(16px) saturate(150%)}
.lou-wb-status{display:flex;align-items:center;gap:7px;min-width:0;font-size:12px;
 color:var(--lou-ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lou-wb-status::before{content:"";width:6px;height:6px;flex:none;border-radius:50%;
 background:var(--dsw-alias-state-idle-primary)}
.lou-wb-status.is-ok{color:var(--dsw-alias-state-success-primary)}
.lou-wb-status.is-ok::before{background:var(--dsw-alias-state-success-primary)}
.lou-wb-status.is-error{color:var(--dsw-alias-state-error-primary)}
.lou-wb-status.is-error::before{background:var(--dsw-alias-state-error-primary)}
.lou-wb-status.is-pending::before{background:var(--dsw-alias-state-warn-primary);
 animation:lou-wb-pulse 1.1s ease-in-out infinite}
@keyframes lou-wb-pulse{50%{opacity:.3}}
.lou-wb-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex:none}
.lou-wb-hintnote{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
 font-size:10.5px;color:var(--lou-ink3);font-variant-numeric:tabular-nums}

@media (max-width:820px){
 .lou-wb-cols{grid-template-columns:minmax(0,1fr)}
 .lou-wb-rail{order:-1}
 .lou-wb-form-grid{grid-template-columns:1fr}
 .lou-wb-sub{display:none}
}
@media (prefers-reduced-motion:reduce){.lou-wb-page *{animation:none!important;transition:none!important}}
`


    /* ---------- 本地化订阅 ---------- */
    function useLocaleTick() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        const locale = clientCtx ? clientCtx.get('locale') : undefined
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => force((n) => n + 1))
      }, [])
    }

    /* ---------- 发送 ---------- */
    function describeFailure(result) {
      const error = result && result.error
      if (!error) return 'unknown'
      if (typeof error === 'string') return error
      return error.message || error.code || JSON.stringify(error)
    }

    async function promptSession(sessions, sessionId, content, mode) {
      const binding = sessions.binding(sessionId)
      if (binding) return await binding.session.prompt(content, mode)
      if (typeof sessions.using === 'function') {
        return await sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
          const ready = await reference.ready
          return await ready.session.prompt(content, mode)
        })
      }
      const reference = sessions.retain(sessionId, { source: 'controllerOperation' })
      try {
        const ready = await reference.ready
        return await ready.session.prompt(content, mode)
      } finally {
        reference.release()
      }
    }

    /* ---------- 附件上传 ---------- */
    const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/
    const UPLOAD_PATH = '/api/session/uploadFileBinary'
    const COVER_PATH = '/api/x-writing-workbench/cover'

    function uploadEndpoint(sessionId, name, mediaType) {
      const query = new URLSearchParams({ sessionId })
      if (IMAGE_TYPE.test(mediaType)) query.set('mediaType', mediaType)
      if (name) query.set('name', name)
      return UPLOAD_PATH + '?' + query.toString()
    }

    /* 优先走宿主注入的 fileUpload 服务；拿不到时退回上传接口本身（与输入框上传同一条链路）。 */
    function describeError(error) {
      if (!error) return 'unknown error'
      const code = error.code ? '[' + String(error.code) + '] ' : ''
      const name = error.name && error.name !== 'Error' ? String(error.name) + ': ' : ''
      return (code + name + (error.message || String(error))).slice(0, 240)
    }

    async function uploadViaHttp(sessionId, item, mediaType) {
      const response = await fetch(uploadEndpoint(sessionId, item.name, mediaType), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/octet-stream' },
        body: item.file,
      })
      const raw = await response.text()
      if (response.status !== 200) {
        throw new Error('HTTP ' + response.status + (raw ? ' · ' + raw.slice(0, 160) : ''))
      }
      let payload
      try {
        payload = JSON.parse(raw)
      } catch (err) {
        throw new Error('unexpected upload response')
      }
      if (!payload || typeof payload.ok !== 'boolean') throw new Error('unexpected upload response')
      if (!payload.ok) {
        const error = payload.error
        throw new Error((error && (error.code ? error.code + ': ' : '') + (error.message || '')) || 'upload rejected')
      }
      return payload
    }

    /* 三层上传：① 与输入框附件同一条流式链路（File 交给 fileUpload 服务）
       ② 同一服务的 base64 RPC（小文件）③ 直连上传接口。三层都失败时把原因全部带回。 */
    async function uploadAttachment(sessionId, item) {
      const mediaType = typeof item.file.type === 'string' ? item.file.type : ''
      const failures = []
      /* 服务把失败放在 {ok:false,error} 里而不是抛错，所以每层都要验证 receipt 是否真的拿到 */
      const accept = (label, result) => {
        if (receiptOf(result) !== '') return result
        failures.push(label + ' ' + describeError(result && result.error ? result.error : result))
        return null
      }
      const service = clientCtx && clientCtx.get ? clientCtx.get('fileUpload') : undefined
      const hasService = service != null && typeof service.upload === 'function'
      if (hasService) {
        try {
          const result = IMAGE_TYPE.test(mediaType) && typeof service.uploadImage === 'function'
            ? await service.uploadImage(sessionId, item.file, mediaType, item.name || undefined)
            : await service.upload(sessionId, item.file, item.name || undefined)
          const accepted = accept('stream', result)
          if (accepted !== null) return accepted
        } catch (error) {
          failures.push('stream ' + describeError(error))
        }
        try {
          const bytes = new Uint8Array(await item.file.arrayBuffer())
          const result = IMAGE_TYPE.test(mediaType) && typeof service.uploadImage === 'function'
            ? await service.uploadImage(sessionId, bytes, mediaType, item.name || undefined)
            : await service.upload(sessionId, bytes, item.name || undefined)
          const accepted = accept('rpc', result)
          if (accepted !== null) return accepted
        } catch (error) {
          failures.push('rpc ' + describeError(error))
        }
      } else {
        failures.push('stream fileUpload service unavailable in this page')
      }
      try {
        return await uploadViaHttp(sessionId, item, mediaType)
      } catch (error) {
        failures.push('http ' + describeError(error))
        throw new Error(failures.join(' · '))
      }
    }

    function receiptOf(result) {
      if (!result || result.ok !== true) return ''
      const value = result.value
      return value && typeof value.receiptId === 'string' ? value.receiptId : ''
    }

    function errorMessage(error) {
      if (error == null) return 'unknown error'
      if (typeof error === 'string') return error
      if (typeof error.message === 'string' && error.message !== '') return error.message
      if (typeof error.code === 'string' && error.code !== '') return error.code
      return String(error)
    }

    function formatBytes(size) {
      if (!size || size < 1024) return String(size || 0) + ' B'
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
      return (size / 1024 / 1024).toFixed(1) + ' MB'
    }

    /* ---------- 写作工作区与会话 ---------- */
    function clientService(key) {
      return clientCtx && typeof clientCtx.get === 'function' ? clientCtx.get(key) : undefined
    }

    function hostHome() {
      const remote = clientService('remote')
      const host = remote && remote.$host
      const home = host && typeof host.home === 'string' ? host.home : ''
      return home.replace(/[\\/]+$/, '')
    }

    /* 工作区登记是幂等的：同一个路径再 create 一次，拿回的就是已有工作区 */
    async function resolveWritingWorkspace() {
      const workspaces = clientService('workspaces')
      if (!workspaces || typeof workspaces.create !== 'function') {
        throw new Error('workspace service unavailable')
      }
      const home = hostHome()
      if (home === '') throw new Error('host home unknown')
      const path = home + '/' + WORKSPACE_NAME
      try {
        return await workspaces.create({ path })
      } catch (error) {
        const ui = clientService('uiWorkspace')
        if (!ui || typeof ui.createDirectory !== 'function') throw error
        try {
          await ui.createDirectory(home, WORKSPACE_NAME)
        } catch (ignored) {
          /* 目录已存在 */
        }
        return await workspaces.create({ path })
      }
    }

    /* 新流程的会话：优先让导航层连接工作区（会复用空会话），失败则直接 create */
    async function createWorkflowSession(workspace) {
      const ui = clientService('uiWorkspace')
      if (ui && typeof ui.connectWorkspace === 'function') {
        const sessionId = await ui.connectWorkspace(workspace.workspaceId)
        if (typeof sessionId === 'string' && sessionId !== '') return sessionId
      }
      const sessions = clientService('sessions')
      if (sessions && typeof sessions.create === 'function') {
        return await sessions.create({ workspaceId: workspace.workspaceId, cwd: workspace.path })
      }
      throw new Error('session service unavailable')
    }

    function workspaceRows(snapshot) {
      if (!snapshot) return []
      if (Array.isArray(snapshot)) return snapshot
      const byId = snapshot.byId || {}
      return Object.keys(byId).map((key) => byId[key]).filter(Boolean)
    }

    function workspaceForSession(rows, sessionId) {
      for (const row of rows) {
        if (row && Array.isArray(row.sessionIds) && row.sessionIds.indexOf(sessionId) !== -1) return row
      }
      return undefined
    }

    /* 会话属于哪个工作区：先用响应式快照，拿不到就幂等地登记写作工作区再比对成员 */
    async function sessionWorkspace(rows, sessionId) {
      const known = workspaceForSession(rows, sessionId)
      if (known) return known
      const workspaces = clientService('workspaces')
      if (!workspaces || typeof workspaces.create !== 'function') return undefined
      try {
        const row = await workspaces.create({ path: workspaceAbsolutePath() })
        if (row && Array.isArray(row.sessionIds) && row.sessionIds.indexOf(sessionId) !== -1) return row
      } catch (ignored) {
        /* 工作区登记失败：当成未知工作区处理 */
      }
      return undefined
    }

    function isWritingWorkspace(row) {
      if (!row) return false
      const title = typeof row.title === 'string' ? row.title : ''
      const path = typeof row.path === 'string' ? row.path.replace(/\/+$/, '') : ''
      if (title === WORKSPACE_NAME) return true
      if (path === '' ) return false
      return path === workspaceAbsolutePath() || path.slice(-(WORKSPACE_NAME.length + 1)) === '/' + WORKSPACE_NAME
    }

    function workspaceAbsolutePath() {
      const home = hostHome()
      return home === '' ? WORKSPACE_NAME : home + '/' + WORKSPACE_NAME
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    /* 每个新会话一个专属文件夹：稿件-2026-11-16-2315-a1b2c3 */
    function sessionFolderName(sessionId) {
      const now = new Date()
      const stamp = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate())
        + '-' + pad2(now.getHours()) + pad2(now.getMinutes())
      const short = String(sessionId || '').replace(/^session-/, '').slice(0, 6)
      return MANUSCRIPT_DIR + '-' + stamp + (short !== '' ? '-' + short : '')
    }

    /* 在 DSH-Writing desk 之下建这个会话的文件夹，返回绝对路径（失败也不阻塞发送） */
    async function ensureSessionFolder(workspace, sessionId) {
      const base = workspace && typeof workspace.path === 'string'
        ? workspace.path.replace(/\/+$/, '')
        : ''
      if (base === '') return { path: '', created: false, error: 'workspace path unknown' }
      const name = sessionFolderName(sessionId)
      const intended = base + '/' + name
      const ui = clientService('uiWorkspace')
      if (!ui || typeof ui.createDirectory !== 'function') {
        return { path: intended, created: false, error: 'directory service unavailable' }
      }
      try {
        const created = await ui.createDirectory(base, name)
        return {
          path: typeof created === 'string' && created !== '' ? created : intended,
          created: true,
          error: '',
        }
      } catch (error) {
        const text = errorMessage(error)
        /* 宿主的 createDirectory 遇到已存在会报错，这时目录本来就在，照用 */
        if (/exists/i.test(text)) return { path: intended, created: true, error: '' }
        return { path: intended, created: false, error: text }
      }
    }

    function selectSession(sessionId) {
      const ui = clientService('uiWorkspace')
      if (ui && typeof ui.openSession === 'function') {
        try {
          ui.openSession(sessionId)
        } catch (ignored) {
          /* 导航被更新的一次覆盖，不影响已排队的发送 */
        }
      }
    }

    /* ---------- 导航 ---------- */
    function openWorkbenchPanel() {
      const layout = clientCtx ? clientCtx.get('layout') : undefined
      if (layout && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel(PANEL_ID)
          return true
        } catch (err) {
          return false
        }
      }
      return false
    }

    function focusSession(sessionId) {
      const workspace = clientCtx ? clientCtx.get('uiWorkspace') : undefined
      if (workspace && typeof workspace.openSession === 'function' && sessionId) {
        try {
          workspace.openSession(sessionId)
          return true
        } catch (err) {
          return false
        }
      }
      return false
    }

    /* ---------- 左侧栏图标 ---------- */
    function WorkbenchIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 18
      const active = props.active === true
      return h(
        'svg',
        {
          className: 'lou-wb-icon' + (active ? ' is-active' : ''),
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', { d: 'M4.2 19.8l1.1-4.2 9.6-9.6a2.4 2.4 0 0 1 3.4 3.4l-9.6 9.6-4.5 1.2z' }),
        h('path', { d: 'M13.6 7.4l3 3' }),
        h('path', { d: 'M5.3 15.6l3 3' }),
      )
    }

    /* ---------- 输入框右侧快捷入口 ---------- */
    function ComposerEntry() {
      useLocaleTick()
      return h(
        'button',
        {
          type: 'button',
          className: 'lou-wb-trigger',
          title: t('trigger.title'),
          'aria-label': t('trigger.title'),
          onClick: () => openWorkbenchPanel(),
        },
        h('span', { className: 'lou-wb-trigger-icon', 'aria-hidden': 'true' }, '✎'),
        h('span', { className: 'lou-wb-trigger-text' }, t('trigger.label')),
      )
    }

    /* ---------- 中央页面 ---------- */
    function WorkbenchPage(props) {
      useLocaleTick()

      const savedStage = lsGet(LS + 'stage')
      const [stageId, setStageId] = React.useState(
        savedStage && STAGE_BY_ID[savedStage] ? savedStage : 'pipeline',
      )
      const stage = STAGE_BY_ID[stageId] || PIPELINE_STAGE

      const [values, setValues] = React.useState(() => loadValues(stageId))
      const [templateOverride, setTemplateOverride] = React.useState(() => loadTemplateOverride(stageId))
      const [showTemplate, setShowTemplate] = React.useState(false)
      const [preview, setPreview] = React.useState('')
      const [status, setStatus] = React.useState({ kind: 'idle', text: '' })
      const [busy, setBusy] = React.useState(false)
      const [targetId, setTargetId] = React.useState(() => lsGet(LS + 'target') || WORKFLOW_TARGET)
      const [mode, setMode] = React.useState(() => (lsGet(LS + 'mode') === 'steer' ? 'steer' : 'queue'))
      const [sent, setSent] = React.useState(null)
      const [attachments, setAttachments] = React.useState([])
      const [dragOver, setDragOver] = React.useState(false)
      const fileInputRef = React.useRef(null)
      const [arkKey, setArkKey] = React.useState(() => lsGet(LS + 'ark') || '')
      const [arkModel, setArkModel] = React.useState(() => {
        const savedModel = lsGet(LS + 'arkModel')
        /* 旧默认值在多数账号上已下线（404 does not exist or you do not have access），当作没设置 */
        if (!savedModel || savedModel === 'doubao-seedream-3-0-t2i-250415') return COVER_MODELS[0].value
        return savedModel
      })
      const [coverBusy, setCoverBusy] = React.useState(false)
      const [coverResult, setCoverResult] = React.useState(null)

      const dirty = React.useRef(false)
      const template = templateOverride != null ? templateOverride : TEMPLATES[stageId] || ''

      /* 会话列表：mainView 的那个就是用户眼下正在看的会话 */
      const useSessions = props.useSessions
      const sessionList = useSessions ? useSessions((state) => state) : undefined
      const useWorkspaces = props.useWorkspaces
      const workspaceList = useWorkspaces ? useWorkspaces((state) => state) : undefined
      const sessions = React.useMemo(() => {
        const byId = sessionList && sessionList.byId ? sessionList.byId : {}
        const rows = []
        for (const id of Object.keys(byId)) {
          const row = byId[id]
          if (!row || row.origin === 'subagent') continue
          rows.push(row)
        }
        rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        return rows
      }, [sessionList])
      const mainSession = sessions.find((row) => ((row.retainedBy || {}).mainView || 0) > 0)
      const target = (() => {
        if (targetId && sessions.some((row) => row.id === targetId)) return targetId
        if (mainSession) return mainSession.id
        const fresh = sessions.find((row) => !row.blank)
        if (fresh) return fresh.id
        return sessions.length > 0 ? sessions[0].id : ''
      })()
      const workflowMode = targetId === WORKFLOW_TARGET || targetId === ''

      /* 切换阶段：载入该阶段的字段与模板覆盖 */
      React.useEffect(() => {
        setValues(loadValues(stageId))
        setTemplateOverride(loadTemplateOverride(stageId))
        dirty.current = false
        setStatus({ kind: 'idle', text: '' })
        lsSet(LS + 'stage', stageId)
      }, [stageId])

      /* 字段存档 */
      React.useEffect(() => {
        lsSet(LS + 'values:' + stageId, JSON.stringify(values))
      }, [stageId, values])

      /* 自动拼装预览（用户手改后停止覆盖） */
      React.useEffect(() => {
        if (dirty.current) return
        setPreview(compose(stage, values, template))
      }, [stage, values, template])

      React.useEffect(() => {
        lsSet(LS + 'ark', arkKey)
      }, [arkKey])
      React.useEffect(() => {
        lsSet(LS + 'arkModel', arkModel)
      }, [arkModel])
      React.useEffect(() => {
        lsSet(LS + 'target', workflowMode ? WORKFLOW_TARGET : target)
      }, [target, workflowMode])
      React.useEffect(() => {
        lsSet(LS + 'mode', mode)
      }, [mode])

      const progress = STAGES.reduce((count, item) => {
        const filled = item.id === stageId ? isStageFilled(item, values) : isStageFilled(item, loadValues(item.id))
        return count + (filled ? 1 : 0)
      }, 0)

      function setField(key, value) {
        setValues((previous) => ({ ...previous, [key]: value }))
      }

      function editTemplate(next) {
        setTemplateOverride(next)
        lsSet(LS + 'tpl:' + stageId, next)
        dirty.current = false
      }

      function resetTemplate() {
        setTemplateOverride(null)
        lsDel(LS + 'tpl:' + stageId)
        dirty.current = false
      }

      function resetFields() {
        setValues({})
        lsDel(LS + 'values:' + stageId)
        dirty.current = false
        setStatus({ kind: 'idle', text: '' })
      }

      function regenerate() {
        dirty.current = false
        setPreview(compose(stage, values, template))
        setStatus({ kind: 'idle', text: '' })
      }

      async function copy() {
        const text = preview
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text)
          } else {
            const area = document.createElement('textarea')
            area.value = text
            area.style.position = 'fixed'
            area.style.opacity = '0'
            document.body.appendChild(area)
            area.select()
            document.execCommand('copy')
            document.body.removeChild(area)
          }
          setStatus({ kind: 'ok', text: t('status.copied') })
        } catch (err) {
          setStatus({ kind: 'error', text: t('status.copyFailed') })
        }
      }

      function addFiles(list) {
        if (!list || typeof list.length !== 'number' || list.length === 0) return
        const next = []
        for (let index = 0; index < list.length; index += 1) {
          const file = list[index]
          if (!file) continue
          next.push({
            id: 'f' + Date.now().toString(36) + '-' + index + '-' + Math.random().toString(36).slice(2, 6),
            name: typeof file.name === 'string' && file.name !== '' ? file.name : 'file',
            size: typeof file.size === 'number' ? file.size : 0,
            file,
          })
        }
        if (next.length > 0) setAttachments((prev) => prev.concat(next))
      }

      function removeAttachment(id) {
        setAttachments((prev) => prev.filter((item) => item.id !== id))
      }

      function openFilePicker() {
        const input = fileInputRef.current
        if (input && typeof input.click === 'function') input.click()
      }

      /* 从当前环节开始、往后的所有环节（含当前）；「全流程」自己就是全部 */
      const chainAfter = (() => {
        if (stageId === 'pipeline') return []
        const index = STAGES.findIndex((item) => item.id === stageId)
        return index < 0 ? [] : STAGES.slice(index)
      })()

      /* 解析目标会话 + 会话目录 + 上传附件，send 与「一键跑完后续」共用 */
      async function prepareTarget() {
        if (!workflowMode && !target) {
          setStatus({ kind: 'error', text: t('status.noSession') })
          return undefined
        }
        let sendTarget = target
        let workflowTitle = ''
        let workflowWorkspace = undefined
        if (workflowMode) {
          setStatus({ kind: 'pending', text: t('status.workspace') })
          let workspace
          try {
            workspace = await resolveWritingWorkspace()
          } catch (error) {
            setStatus({
              kind: 'error',
              text: t('status.workspaceFailed', { message: errorMessage(error) }),
            })
            return undefined
          }
          workflowTitle = typeof workspace.title === 'string' && workspace.title !== ''
            ? workspace.title
            : WORKSPACE_NAME
          setStatus({ kind: 'pending', text: t('status.newSession') })
          try {
            sendTarget = await createWorkflowSession(workspace)
          } catch (error) {
            setStatus({
              kind: 'error',
              text: t('status.workspaceFailed', { message: errorMessage(error) }),
            })
            return undefined
          }
          if (!sendTarget) {
            setStatus({ kind: 'error', text: t('status.noSession') })
            return undefined
          }
          workflowWorkspace = workspace
          setTargetId(sendTarget)
          lsSet(LS + 'target', sendTarget)
        }
        const sessionsService = clientCtx ? clientCtx.get('sessions') : undefined
        if (!sessionsService) {
          setStatus({ kind: 'error', text: t('status.noService') })
          return undefined
        }
        const label = (() => {
          if (workflowTitle !== '') return workflowTitle
          const row = sessions.find((item) => item.id === sendTarget)
          if (row && typeof row.title === 'string' && row.title.trim() !== '') return row.title.trim()
          if (row && row.blank) return t('session.blank')
          return String(sendTarget).slice(0, 8)
        })()
        setStatus({ kind: 'pending', text: t('status.sending') })
        /* 会话目录：写在工作区 DSH-Writing desk 里的会话，第一次发送时建好专属文件夹 */
        let sessionFolder = ''
        let sessionFolderFailed = ''
        let sessionFolderCached = false
        const ownerWorkspace = workflowWorkspace !== undefined
          ? workflowWorkspace
          : await sessionWorkspace(workspaceRows(workspaceList), sendTarget)
        if (isWritingWorkspace(ownerWorkspace)) {
          const cached = lsGet(LS + 'folder:' + sendTarget)
          if (cached) {
            sessionFolder = cached
            sessionFolderCached = true
          } else {
            const folder = await ensureSessionFolder(ownerWorkspace, sendTarget)
            sessionFolder = folder.path
            sessionFolderFailed = folder.error
            if (folder.created && sessionFolder !== '') {
              lsSet(LS + 'folder:' + sendTarget, sessionFolder)
            }
          }
        }
        const parts = []
        if (attachments.length > 0) {
          try {
            for (const item of attachments) {
              setStatus({ kind: 'pending', text: t('status.uploading', { name: item.name }) })
              const receiptId = receiptOf(await uploadAttachment(sendTarget, item))
              if (receiptId === '') throw new Error('no receiptId returned')
              parts.push({ type: 'file', receiptId })
            }
          } catch (err) {
            setStatus({
              kind: 'error',
              text: t('status.uploadFailed', { message: errorMessage(err) }),
            })
            return undefined
          }
          setStatus({ kind: 'pending', text: t('status.sending') })
        }
        return {
          sessionId: sendTarget,
          sessionsService,
          label,
          folder: sessionFolder,
          folderFailed: sessionFolderFailed,
          folderCached: sessionFolderCached,
          workflow: workflowMode,
          parts,
        }
      }

      /* 提示词末尾：落盘要求 + 附件清单 */
      function withNotes(baseText, prepared) {
        let text = baseText
        if (prepared.folder !== '') {
          text = text + '\n\n' + (prepared.folderCached
            ? t('note.saveKnown', { folder: prepared.folder })
            : t('note.save', { folder: prepared.folder }))
        } else if (prepared.workflow) {
          const folder = hostHome() + '/' + WORKSPACE_NAME + '/' + sessionFolderName(prepared.sessionId)
          text = text + '\n\n' + t('note.save', { folder })
        } else {
          text = text + '\n\n' + t('note.saveGeneric')
        }
        if (prepared.parts.length > 0) {
          text = text + '\n\n' + t('note.attachments', {
            count: String(prepared.parts.length),
            names: attachments.map((item) => item.name).join('、'),
          })
        }
        return text
      }

      function finishSend(prepared) {
        setSent({ id: prepared.sessionId, title: prepared.label })
        if (attachments.length > 0) setAttachments([])
        if (prepared.folder !== '') {
          const suffix = prepared.folderFailed === ''
            ? t('status.folder', { folder: prepared.folder })
            : t('status.folderFailed', { folder: prepared.folder, message: prepared.folderFailed })
          setStatus((prev) => ({ kind: prev.kind, text: prev.text + ' · ' + suffix }))
        }
        if (prepared.workflow) selectSession(prepared.sessionId)
      }

      async function makeCover() {
        const prompt = String(preview || '').trim()
        if (prompt === '') {
          setStatus({ kind: 'error', text: t('status.empty') })
          return
        }
        if (String(arkKey).trim() === '') {
          setStatus({ kind: 'error', text: t('status.coverNoKey') })
          return
        }
        setCoverBusy(true)
        setStatus({ kind: 'pending', text: t('status.coverBusy') })
        try {
          const folder = lsGet(LS + 'folder:' + (target || '')) || ''
          const response = await fetch(COVER_PATH, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json', 'x-ark-key': String(arkKey).trim() },
            body: JSON.stringify({
              prompt,
              model: arkModel,
              size: coverSizeOf(values.ratio || COVER_RATIOS[0].value),
              folder,
            }),
          })
          const payload = await response.json().catch(() => undefined)
          if (!payload || payload.ok !== true) {
            const error = payload && payload.error ? payload.error : {}
            throw new Error(error.message || 'HTTP ' + response.status)
          }
          setCoverResult({
            url: payload.url,
            path: payload.path || '',
            size: payload.size || '',
            ms: payload.ms || 0,
          })
          setStatus({
            kind: 'ok',
            text: payload.path
              ? t('status.coverSaved', { path: payload.path })
              : t('status.coverDone'),
          })
        } catch (error) {
          setStatus({ kind: 'error', text: t('status.coverFailed', { message: errorMessage(error) }) })
        } finally {
          setCoverBusy(false)
        }
      }

      async function send(sendMode) {
        const base = preview.trim()
        const text = stageId === 'cover' ? t('note.coverGuide') + '\n\n' + base : base
        if (text === '') {
          setStatus({ kind: 'error', text: t('status.empty') })
          return
        }
        if (!dirty.current) {
          const missing = stage.fields.filter(
            (field) => field.required && String(values[field.key] || '').trim() === '',
          )
          if (missing.length > 0) {
            setStatus({
              kind: 'error',
              text: t('status.missing', { fields: missing.map((field) => field.label).join('、') }),
            })
            return
          }
        }
        setBusy(true)
        try {
          const prepared = await prepareTarget()
          if (!prepared) return
          const content = [{ type: 'text', text: withNotes(text, prepared) }].concat(prepared.parts)
          const result = await promptSession(prepared.sessionsService, prepared.sessionId, content, sendMode)
          if (result && result.ok) {
            setStatus({
              kind: 'ok',
              text: sendMode === 'steer'
                ? t('status.sentSteer')
                : t('status.sentTo', { title: prepared.label }),
            })
            finishSend(prepared)
          } else {
            setStatus({ kind: 'error', text: t('status.failed', { message: describeFailure(result) }) })
          }
        } catch (err) {
          setStatus({ kind: 'error', text: t('status.failed', { message: errorMessage(err) }) })
        } finally {
          setBusy(false)
        }
      }

      /* 一键跑完后续：从这一环节起，把后面每一步按顺序排队发到同一个会话 */
      async function runRemaining() {
        if (chainAfter.length === 0) return
        if (stageId !== 'pipeline') {
          if (preview.trim() === '') {
            setStatus({ kind: 'error', text: t('status.empty') })
            return
          }
          if (!dirty.current) {
            const missing = stage.fields.filter(
              (field) => field.required && String(values[field.key] || '').trim() === '',
            )
            if (missing.length > 0) {
              setStatus({
                kind: 'error',
                text: t('status.missing', { fields: missing.map((field) => field.label).join('、') }),
              })
              return
            }
          }
        }
        setBusy(true)
        try {
          const prepared = await prepareTarget()
          if (!prepared) return
          const total = chainAfter.length
          let done = 0
          for (let index = 0; index < total; index += 1) {
            const item = chainAfter[index]
            const first = index === 0
            let body
            if (first) {
              body = preview.trim()
            } else {
              const stageValues = loadValues(item.id)
              const ready = item.fields.every(
                (field) => !field.required || String(stageValues[field.key] || '').trim() !== '',
              )
              const tpl = loadTemplateOverride(item.id) || TEMPLATES[item.id] || ''
              body = ready ? item.compose(stageValues, tpl) : tpl
            }
            const guided = item.id === 'cover' ? t('note.coverGuide') + '\n\n' + body : body
            const text = withNotes(
              guided + '\n\n' + t('note.chain', {
                index: String(index + 1),
                total: String(total),
                stage: item.name,
              }),
              first ? prepared : Object.assign({}, prepared, { parts: [] }),
            )
            const result = await promptSession(
              prepared.sessionsService,
              prepared.sessionId,
              [{ type: 'text', text }],
              'queue',
            )
            if (!result || !result.ok) {
              setStatus({
                kind: 'error',
                text: t('status.chainStopped', {
                  index: String(index + 1),
                  message: describeFailure(result),
                }),
              })
              return
            }
            done += 1
            setStatus({
              kind: 'pending',
              text: t('status.chainSent', { done: String(done), total: String(total) }),
            })
          }
          setStatus({
            kind: 'ok',
            text: t('status.chainDone', {
              count: String(done),
              total: String(total),
              title: prepared.label,
            }),
          })
          finishSend(prepared)
        } catch (err) {
          setStatus({ kind: 'error', text: t('status.failed', { message: errorMessage(err) }) })
        } finally {
          setBusy(false)
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          void send(mode)
        }
      }

      /* --- 顶部工具栏 --- */
      const topbar = h(
        'header',
        { className: 'lou-wb-topbar' },
        h(
          'div',
          { className: 'lou-wb-brand' },
          h('span', { className: 'lou-wb-seal', 'aria-hidden': 'true' }, '稿'),
          h(
            'div',
            { className: 'lou-wb-brand-text' },
            h('h1', { className: 'lou-wb-title' }, t('title')),
            h('p', { className: 'lou-wb-sub' }, t('subtitle')),
          ),
          h('span', { className: 'lou-wb-ver' }, VERSION),
        ),
        h(
          'div',
          { className: 'lou-wb-tools' },
          workflowMode
            ? h('span', { className: 'lou-wb-hintnote', title: workspaceAbsolutePath() }, WORKSPACE_NAME)
            : null,
          h(
            'select',
            {
              className: 'lou-wb-select',
              value: workflowMode ? WORKFLOW_TARGET : target,
              onChange: (event) => setTargetId(event.target.value),
              title: t('label.target'),
              'aria-label': t('label.target'),
            },
            h('option', { value: WORKFLOW_TARGET }, t('session.newFlow')),
            sessions.length === 0
              ? h('option', { value: '' }, t('session.none'))
              : sessions.slice(0, 30).map((row) => {
                  const rowTitle = typeof row.title === 'string' ? row.title.trim() : ''
                  const text = rowTitle !== ''
                    ? rowTitle
                    : row.blank
                      ? t('session.blank')
                      : String(row.id).slice(0, 8)
                  return h('option', { key: row.id, value: row.id }, text)
                }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lou-wb-btn is-quiet',
              title: t('hint.newFlow'),
              onClick: () => {
                setTargetId(WORKFLOW_TARGET)
                setSent(null)
                setStatus({ kind: 'idle', text: '' })
              },
            },
            '＋ ' + t('action.newFlow'),
          ),
          h(
            'div',
            { className: 'lou-wb-seg', role: 'group', 'aria-label': t('label.mode'), title: t('label.mode') },
            h(
              'button',
              {
                type: 'button',
                className: mode === 'queue' ? 'is-on' : '',
                'aria-pressed': mode === 'queue',
                onClick: () => setMode('queue'),
              },
              t('mode.queue'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: mode === 'steer' ? 'is-on' : '',
                'aria-pressed': mode === 'steer',
                onClick: () => setMode('steer'),
              },
              t('mode.steer'),
            ),
          ),
        ),
      )

      /* --- 阶段刻度：六格进度条，比一排胶囊克制 --- */
      const ticks = STAGES.map((item) => {
        const filled = isStageFilled(item, item.id === stageId ? values : loadValues(item.id))
        return h('button', {
          key: 'tick-' + item.id,
          type: 'button',
          className:
            'lou-wb-tick' +
            (item.id === stageId ? ' is-current' : filled ? ' is-filled' : ''),
          title: item.num + ' ' + item.name,
          'aria-label': item.num + ' ' + item.name,
          onClick: () => setStageId(item.id),
        })
      })

      const hero = h(
        'div',
        { className: 'lou-wb-hero' },
        h(
          'div',
          { className: 'lou-wb-hero-kicker' },
          h('span', null, t('flow.label')),
          h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', null, stage.id === 'pipeline' ? t('action.pipeline') : stage.num),
        ),
        h('h2', { className: 'lou-wb-hero-title' }, stage.name),
        h('p', { className: 'lou-wb-hero-sub' }, stage.blurb),
        workflowMode
          ? h('p', { className: 'lou-wb-hero-note' }, t('hint.newFlow') + '　' + workspaceAbsolutePath())
          : null,
        h(
          'div',
          { className: 'lou-wb-ticks', role: 'group', 'aria-label': t('flow.label') },
          ticks,
          h('span', { className: 'lou-wb-meter-text' }, t('status.progress', { done: progress, total: STAGES.length })),
        ),
      )

      /* --- 左侧时间线 --- */
      const stepButton = (item) => {
        const filled = item.id === 'pipeline'
          ? false
          : item.id === stageId
            ? isStageFilled(item, values)
            : isStageFilled(item, loadValues(item.id))
        return h(
          'button',
          {
            key: item.id,
            type: 'button',
            className:
              'lou-wb-step' +
              (item.id === stageId ? ' is-on' : '') +
              (filled ? ' is-filled' : ''),
            onClick: () => setStageId(item.id),
            title: item.name,
            'aria-current': item.id === stageId ? 'true' : undefined,
          },
          h('span', { className: 'lou-wb-step-num', 'aria-hidden': 'true' }, item.num),
          h(
            'span',
            { className: 'lou-wb-step-text' },
            h('span', { className: 'lou-wb-step-name' }, item.short),
            h('span', { className: 'lou-wb-step-blurb' }, item.blurb),
          ),
          filled ? h('span', { className: 'lou-wb-step-check', title: t('status.filled'), 'aria-hidden': 'true' }, '✓') : null,
        )
      }

      const rail = h(
        'aside',
        { className: 'lou-wb-panel lou-wb-rail' },
        h('div', { className: 'lou-wb-rail-title' }, t('rail.title')),
        h(
          'div',
          { className: 'lou-wb-steps' },
          stepButton(PIPELINE_STAGE),
          h('div', { className: 'lou-wb-rail-sep', key: 'rail-sep', 'aria-hidden': 'true' }),
          STAGES.map(stepButton),
        ),
      )

      /* --- 字段区：短字段两栏，长字段独占一行 --- */
      const renderField = (field) => {
        if (field.kind === 'select') {
          const options = field.options || []
          const current = values[field.key] || (options[0] ? options[0].value : '')
          return h(
            'label',
            { className: 'lou-wb-field', key: field.key },
            h(
              'span',
              { className: 'lou-wb-label' },
              field.label,
              field.required ? h('span', { className: 'lou-wb-req' }, '*') : null,
            ),
            h(
              'select',
              {
                className: 'lou-wb-input lou-wb-select-field',
                value: current,
                onChange: (event) => setField(field.key, event.target.value),
              },
              options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
            ),
          )
        }
        const value = values[field.key] || ''
        const common = {
          className: field.kind === 'textarea' ? 'lou-wb-textarea' : 'lou-wb-input',
          value,
          placeholder: field.placeholder || '',
          onChange: (event) => setField(field.key, event.target.value),
        }
        return h(
          'label',
          { className: 'lou-wb-field', key: field.key },
          h(
            'span',
            { className: 'lou-wb-label' },
            field.label,
            field.required ? h('span', { className: 'lou-wb-req' }, '*') : null,
          ),
          field.kind === 'textarea'
            ? h('textarea', { ...common, rows: field.rows || 4, spellCheck: false })
            : h('input', { ...common, type: 'text' }),
        )
      }

      const fieldNodes = []
      let pair = []
      const flushPair = () => {
        if (pair.length === 0) return
        fieldNodes.push(h('div', { className: 'lou-wb-form-grid', key: 'pair-' + fieldNodes.length }, pair))
        pair = []
      }
      stage.fields.forEach((field) => {
        const node = renderField(field)
        if (field.kind === 'textarea') {
          flushPair()
          fieldNodes.push(node)
        } else {
          pair.push(node)
          if (pair.length === 2) flushPair()
        }
      })
      flushPair()

      /* --- 附件区 --- */
      const attachDrop = h(
        'div',
        {
          className: 'lou-wb-drop' + (dragOver ? ' is-over' : ''),
          onDragOver: (event) => {
            if (event && typeof event.preventDefault === 'function') event.preventDefault()
            setDragOver(true)
          },
          onDragLeave: () => setDragOver(false),
          onDrop: (event) => {
            if (event && typeof event.preventDefault === 'function') event.preventDefault()
            setDragOver(false)
            const transfer = event ? event.dataTransfer : undefined
            if (transfer && transfer.files) addFiles(transfer.files)
          },
        },
        h('span', { className: 'lou-wb-drop-icon', 'aria-hidden': 'true' }, '＋'),
        h('span', { className: 'lou-wb-drop-text' }, t('hint.drop')),
        h(
          'button',
          { type: 'button', className: 'lou-wb-btn is-quiet', onClick: openFilePicker },
          t('action.pickFile'),
        ),
        h('input', {
          ref: fileInputRef,
          className: 'lou-wb-fileinput',
          type: 'file',
          multiple: true,
          tabIndex: -1,
          'aria-hidden': 'true',
          onChange: (event) => {
            const target = event ? event.target : undefined
            if (target && target.files) addFiles(target.files)
            if (target) target.value = ''
          },
        }),
      )

      const attachList = attachments.length > 0
        ? h(
          'ul',
          { className: 'lou-wb-files' },
          attachments.map((item) => h(
            'li',
            { className: 'lou-wb-file', key: item.id },
            h('span', { className: 'lou-wb-file-name', title: item.name }, item.name),
            h('span', { className: 'lou-wb-file-size' }, formatBytes(item.size)),
            h(
              'button',
              {
                type: 'button',
                className: 'lou-wb-file-remove',
                title: t('action.removeFile'),
                'aria-label': t('action.removeFile'),
                onClick: () => removeAttachment(item.id),
              },
              '×',
            ),
          )),
        )
        : null

      const coverPanel = stage.id !== 'cover'
        ? null
        : h(
          'div',
          { className: 'lou-wb-cover', key: 'cover-panel' },
          h(
            'div',
            { className: 'lou-wb-cover-head' },
            h('span', { className: 'lou-wb-label' }, t('label.coverKey')),
            h('span', { className: 'lou-wb-hint' }, t('hint.coverKey')),
          ),
          h(
            'div',
            { className: 'lou-wb-cover-row' },
            h('input', {
              className: 'lou-wb-input lou-wb-key',
              type: 'password',
              value: arkKey,
              placeholder: 'ARK_API_KEY',
              spellCheck: false,
              autoComplete: 'off',
              onChange: (event) => setArkKey(event.target.value),
            }),
            h('input', {
              className: 'lou-wb-input lou-wb-model',
              type: 'text',
              value: arkModel,
              list: 'writing-workbench-cover-models',
              placeholder: 'doubao-seedream-4-0-250828 或 ep-…',
              spellCheck: false,
              autoComplete: 'off',
              onChange: (event) => setArkModel(event.target.value),
            }),
            h(
              'datalist',
              { id: 'writing-workbench-cover-models' },
              COVER_MODELS.map((item) => h('option', { key: item.value, value: item.value }, item.label)),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lou-wb-btn is-primary',
                onClick: makeCover,
                disabled: coverBusy,
              },
              coverBusy ? t('status.coverBusy') : t('action.generateCover'),
            ),
          ),
          h('div', { className: 'lou-wb-cover-note' }, t('hint.coverPanel')),
          coverResult
            ? h(
              'div',
              { className: 'lou-wb-cover-result' },
              h('img', {
                className: 'lou-wb-cover-img',
                src: coverResult.url,
                alt: t('label.coverResult'),
              }),
              h(
                'div',
                { className: 'lou-wb-cover-meta' },
                h(
                  'span',
                  null,
                  (coverResult.size || '') +
                    ' · ' +
                    Math.max(1, Math.round((coverResult.ms || 0) / 1000)) +
                    's',
                ),
                coverResult.path ? h('code', { className: 'lou-wb-cover-path' }, coverResult.path) : null,
              ),
            )
            : null,
        )

      const fieldsPanel = h(
        'section',
        { className: 'lou-wb-panel' },
        h(
          'div',
          { className: 'lou-wb-panel-head' },
          h(
            'div',
            null,
            h('h3', { className: 'lou-wb-panel-title' }, stage.num + ' ' + stage.name),
            h('p', { className: 'lou-wb-panel-sub' }, t('label.fields')),
          ),
          h(
            'div',
            { className: 'lou-wb-panel-actions' },
            h(
              'button',
              { type: 'button', className: 'lou-wb-btn is-quiet', onClick: resetFields },
              t('action.clear'),
            ),
          ),
        ),
        h('div', { className: 'lou-wb-form' }, fieldNodes),
        coverPanel,
        h('div', { className: 'lou-wb-label', key: 'files-label' }, t('label.files')),
        attachDrop,
        attachList,
        h('div', { className: 'lou-wb-hint' }, t('hint.file')),
      )

      /* --- 稿纸预览 --- */
      const previewPanel = h(
        'section',
        { className: 'lou-wb-panel' },
        h(
          'div',
          { className: 'lou-wb-panel-head' },
          h(
            'div',
            null,
            h('h3', { className: 'lou-wb-panel-title' }, t('label.preview')),
            h('p', { className: 'lou-wb-panel-sub' }, t('hint.chars', { count: String(preview.length) })),
          ),
          h(
            'div',
            { className: 'lou-wb-panel-actions' },
            h('button', { type: 'button', className: 'lou-wb-btn is-quiet', onClick: regenerate }, t('action.regenerate')),
            h(
              'button',
              {
                type: 'button',
                className: 'lou-wb-btn is-quiet',
                onClick: () => setShowTemplate(!showTemplate),
              },
              showTemplate ? t('action.hideTemplate') : t('action.editTemplate'),
            ),
            showTemplate && templateOverride != null
              ? h('button', { type: 'button', className: 'lou-wb-btn is-quiet', onClick: resetTemplate }, t('action.resetTemplate'))
              : null,
          ),
        ),
        showTemplate
          ? h(
              'div',
              { className: 'lou-wb-field' },
              h('span', { className: 'lou-wb-label' }, t('label.template')),
              h('textarea', {
                className: 'lou-wb-textarea',
                rows: 9,
                value: template,
                spellCheck: false,
                onChange: (event) => editTemplate(event.target.value),
              }),
            )
          : null,
        h(
          'div',
          { className: 'lou-wb-paper' },
          h('textarea', {
            className: 'lou-wb-textarea lou-wb-preview',
            rows: 14,
            value: preview,
            placeholder: t('preview.empty'),
            spellCheck: false,
            onChange: (event) => {
              dirty.current = true
              setPreview(event.target.value)
            },
          }),
        ),
      )

      /* --- 底栏 --- */
      const foot = h(
        'footer',
        { className: 'lou-wb-foot' },
        h(
          'div',
          {
            className:
              'lou-wb-status' +
              (status.kind === 'ok' ? ' is-ok' : status.kind === 'error' ? ' is-error' : status.kind === 'pending' ? ' is-pending' : ''),
            title: status.text,
          },
          status.text,
        ),
        h(
          'div',
          { className: 'lou-wb-actions' },
          sent
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'lou-wb-btn is-quiet',
                  onClick: () => focusSession(sent.id),
                },
                t('action.viewSession'),
              )
            : null,
          chainAfter.length > 0
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'lou-wb-btn is-accent',
                  title: t('action.runRemainingTip', {
                    stage: stage.short,
                    total: String(chainAfter.length),
                  }),
                  onClick: () => void runRemaining(),
                  disabled: busy,
                },
                t('action.runRemaining') + ' · ' + chainAfter.length,
              )
            : null,
          h('button', { type: 'button', className: 'lou-wb-btn', onClick: copy, disabled: busy }, t('action.copy')),
          h(
            'button',
            { type: 'button', className: 'lou-wb-btn', onClick: () => void send('steer'), disabled: busy },
            t('action.sendSteer'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'lou-wb-btn is-primary',
              onClick: () => void send(mode),
              disabled: busy,
            },
            mode === 'steer' ? t('action.sendSteer') : t('action.sendQueue'),
          ),
        ),
      )

      return h(
        'div',
        { className: 'lou-wb-page', onKeyDown },
        h('style', null, CSS),
        topbar,
        h(
          'div',
          { className: 'lou-wb-scroll' },
          h(
            'div',
            { className: 'lou-wb-content' },
            hero,
            h(
              'div',
              { className: 'lou-wb-cols' },
              rail,
              h('main', { className: 'lou-wb-main' }, fieldsPanel, previewPanel),
            ),
          ),
        ),
        foot,
      )
    }

    /* ---------- 插件入口 ---------- */
    function registerSlot(ctx, owner, options, Component, effectId) {
      ctx.effect(() => {
        const dispose = ctx.slots.inject(owner, () => ctx.slots.register(options, Component))
        return () => {
          if (typeof dispose === 'function') dispose()
          else if (dispose && typeof dispose.dispose === 'function') dispose.dispose()
        }
      }, effectId)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        clientCtx = ctx
        translate = ctx.locale.bind(NS)

        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh), 'writing-workbench:locale-zh')
        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en), 'writing-workbench:locale-en')

        /* 左侧栏图标 → 中央页面 */
        registerSlot(
          ctx,
          SLOT_SIDEBAR,
          { name: SLOT_SIDEBAR, id: PANEL_ID, order: 13, label: () => t('panel.label') },
          WorkbenchIcon,
          'writing-workbench:sidebar-entry',
        )
        registerSlot(
          ctx,
          SLOT_MAIN,
          { name: SLOT_MAIN, key: PANEL_ID },
          WorkbenchPage,
          'writing-workbench:main-page',
        )
        /* 输入框右侧快捷入口（跳到同一个页面） */
        registerSlot(
          ctx,
          SLOT_COMPOSER,
          { name: SLOT_COMPOSER, id: 'lou-writing-workbench', order: 20, label: () => t('trigger.label') },
          ComposerEntry,
          'writing-workbench:composer-entry',
        )
      },
    }
  },
})
