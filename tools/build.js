#!/usr/bin/env node
/**
 * 构建脚本：把 templates/*.txt 注入 ui/client.js，生成两个产物：
 *
 *   lib/client.js        浏览器端 bundle（`window.__ModuleLoader__.load(...)` 形态）
 *   lib/skill-manifest.js 宿主端 skill 清单（7 个 agent skill 的正文）
 *
 * 用法：node tools/build.js
 *
 * 单一内容源就是 templates/ —— 工作台（手动）与 skill（模型自动调用）永远一致。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROVIDER = 'dsh-writing-workbench'

/** 六个阶段：模板文件 → 工作台 stage id + agent skill 元信息。 */
const STAGES = [
  {
    id: 'topic',
    file: '01-选题角度.txt',
    skill: 'lao-ou-topic-angles',
    description: '老欧拾光记·选题角度（Gladwell × Taleb 黑天鹅版）：诊断平庸角度，给出侧门 / 反直觉 / 沉默证据三个角度，再逐一做黑天鹅拷问。',
    whenToUse: '用户有话题但不知道从哪个角度切入，或想要"能传播"的角度时使用。',
  },
  {
    id: 'structure',
    file: '02-写作结构.txt',
    skill: 'lao-ou-writing-structure',
    description: '老欧拾光记·写作结构（SUCCESs 六原则）：把主题与素材写成一篇符合老欧风格的公众号长文。',
    whenToUse: '要按老欧的风格写一篇完整公众号文章，或需要文章结构骨架时使用。',
  },
  {
    id: 'polish',
    file: '03-文章润色.txt',
    skill: 'lao-ou-article-polish',
    description: '老欧拾光记·文章润色：按老欧的口语风格润色初稿，去掉 AI 味、书面腔和翻译腔。',
    whenToUse: '已有初稿或 AI 生成的草稿，需要润色成"活人写的"中文时使用。',
  },
  {
    id: 'spread',
    file: '04-传播优化改造.txt',
    skill: 'lao-ou-spread-optimization',
    description: '老欧拾光记·传播优化改造：按《引爆点》三法则 + SUCCESs 六原则，对成稿做最小结构改造以提升转发。',
    whenToUse: '文章写完了但传播力不够，想提升转发和"被记住"的程度时使用。',
  },
  {
    id: 'title',
    file: '05-标题与封面摘要.txt',
    skill: 'lao-ou-title-and-cover',
    description: '老欧拾光记·标题与封面摘要：按公众号传播规律生成 12 组标题与封面摘要。',
    whenToUse: '文章定稿后要出标题、封面摘要或摘要文案时使用。',
  },
  {
    id: 'check',
    file: '06-文章自检.txt',
    skill: 'lao-ou-article-self-check',
    description: '老欧拾光记·文章自检（L1–L4）：按硬规则 → 风格 → 深度 → 活人感四层自检并给出修改建议。',
    whenToUse: '成稿发布前想按老欧的标准做最后自检时使用。',
  },
]

const COVER = {
  skill: 'lao-ou-cover-design',
  description: '老欧拾光记·封面生成：按 cover-master 的封面提示词蓝图，把用户选定的 17 种风格原子编译成一条完整图片生成提示词，并调用豆包（火山方舟 seedream）出图。',
  whenToUse: '文章定稿后要做公众号/小红书封面，需要按风格生成封面提示词或直接出图时使用。',
}

const PIPELINE = {
  file: '00-pipeline.md',
  skill: 'lao-ou-article-pipeline',
  description: '老欧拾光记·六阶段一条龙编排：自动按 选题 → 结构 → 润色 → 传播优化 → 自检 → 标题封面 跑完全流程，一次交付成稿。',
  whenToUse: '用户说"帮我写一篇老欧风格的文章"或直接给出话题/素材，希望一次拿到完整成稿时使用。',
}

function readTemplate(file) {
  return readFileSync(join(ROOT, 'templates', file), 'utf8').replace(/\r\n/g, '\n')
}

/* ---------- 1) lib/client.js ---------- */
const source = readFileSync(join(ROOT, 'ui', 'client.js'), 'utf8')
const MARK = '/*__TEMPLATES__*/'
const occurrences = source.split(MARK).length - 1
if (occurrences !== 1) throw new Error(`ui/client.js 应恰好包含 1 个模板占位符 ${MARK}，实际 ${occurrences} 个`)
const body = [...STAGES, { id: 'pipeline', file: PIPELINE.file }, { id: 'cover', file: '07-封面生成.txt' }].map((stage) => {
  const text = readTemplate(stage.file)
  return `      ${JSON.stringify(stage.id)}: ${JSON.stringify(text)},`
}).join('\n')
const bundleWithTemplates = source.replace(MARK, () => `\n${body}`)

/* ---------- 1b) 封面风格库（cover-master 素材，注入 ui/client.js） ---------- */
const COVER_DIR = join(ROOT, 'templates', 'cover')
const STYLE_MARK = '/*__COVER_STYLES__*/'

function readStyle(id) {
  const raw = readFileSync(join(COVER_DIR, 'styles', `${id}.md`), 'utf8').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
  if (!match) throw new Error(`风格文件缺 YAML frontmatter：${id}.md`)
  const front = match[1]
  const bodyText = match[2]
  const readKey = (key) => {
    const single = new RegExp(`^${key}:[ \\t]*(\\S.*)$`, 'm').exec(front)
    if (single) return single[1].trim().replace(/^["']|["']$/g, '')
    const block = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*- .*\\n?)+)`, 'm').exec(front)
    if (block) {
      return block[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())
    }
    return ''
  }
  const sections = {}
  let current = null
  for (const line of bodyText.split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      current = heading[1].trim()
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }
  const sectionText = (name) => (sections[name] || []).join('\n').trim()
  const sectionBullets = (name) =>
    (sections[name] || [])
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
  return {
    id: readKey('id') || id,
    name: readKey('name') || id,
    ratio: readKey('default_ratio') || '3:4',
    anchors: readKey('style_anchors') || [],
    adaptation: readKey('cover_shape_adaptation') || [],
    preserve: readKey('must_preserve') || [],
    avoid: readKey('avoid_when_applying_to_cover') || [],
    core: sectionText('视觉风格原子'),
    genes: sectionBullets('风格基因'),
    layout: sectionBullets('图文关系'),
    bans: sectionBullets('风格特有禁用项'),
  }
}

const catalog = readFileSync(join(COVER_DIR, 'catalog.md'), 'utf8')
const styleIds = [...catalog.matchAll(/^\|\s*[^|]+\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1])
if (styleIds.length === 0) throw new Error('templates/cover/catalog.md 里没有解析到任何风格 id')
const coverStyles = styleIds.map(readStyle)
const styleCount = bundleWithTemplates.split(STYLE_MARK).length - 1
if (styleCount !== 1) throw new Error(`ui/client.js 应恰好包含 1 个封面占位符 ${STYLE_MARK}，实际 ${styleCount} 个`)
const styleBody = coverStyles.map((style) => `      ${JSON.stringify(style)},`).join('\n')
const bundle = bundleWithTemplates.replace(STYLE_MARK, () => `\n${styleBody}`)

const coverSkillContent = [
  readFileSync(join(COVER_DIR, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n').trim(),
  '\n\n---\n\n## 内联风格库（17 个，离线可用）\n',
  coverStyles
    .map((style) =>
      [
        `### ${style.name}（\`${style.id}\`，默认比例 ${style.ratio}）`,
        style.core ? style.core : '',
        style.anchors.length ? `- 风格锚点：${style.anchors.join('；')}` : '',
        style.adaptation.length ? `- 封面形态适配：${style.adaptation.join('；')}` : '',
        style.preserve.length ? `- 必须保留：${style.preserve.join('；')}` : '',
        style.avoid.length ? `- 避免：${style.avoid.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n'),
  '\n\n---\n\n## 提示词蓝图\n',
  readFileSync(join(COVER_DIR, 'blueprint.md'), 'utf8').replace(/\r\n/g, '\n').trim(),
].join('\n')
mkdirSync(join(ROOT, 'lib'), { recursive: true })
writeFileSync(join(ROOT, 'lib', 'client.js'), bundle)

/* ---------- 2) lib/skill-manifest.js ---------- */
const skills = []
for (const stage of STAGES) {
  skills.push({
    name: stage.skill,
    description: stage.description,
    whenToUse: stage.whenToUse,
    source: 'bundled',
    provider: PROVIDER,
    content: readTemplate(stage.file).trim(),
  })
}
skills.push({
  name: COVER.skill,
  description: COVER.description,
  whenToUse: COVER.whenToUse,
  source: 'bundled',
  provider: PROVIDER,
  content: coverSkillContent,
})
skills.push({
  name: PIPELINE.skill,
  description: PIPELINE.description,
  whenToUse: PIPELINE.whenToUse,
  source: 'bundled',
  provider: PROVIDER,
  content: readTemplate(PIPELINE.file).trim(),
})
const header = '// 由 tools/build.js 生成，请勿手改；改 templates/ 后重新构建。\n'
writeFileSync(
  join(ROOT, 'lib', 'skill-manifest.js'),
  `${header}export const SKILLS = ${JSON.stringify(skills, null, 2)}\n`,
)

console.log(`lib/client.js         ${bundle.length} 字符`)
console.log(`lib/skill-manifest.js ${skills.length} 个 skill：${skills.map((s) => s.name).join(', ')}`)
console.log(`cover styles          ${coverStyles.length} 个：${coverStyles.map((s) => s.id).join(', ')}`)
