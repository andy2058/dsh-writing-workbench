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
const body = [...STAGES, { id: 'pipeline', file: PIPELINE.file }].map((stage) => {
  const text = readTemplate(stage.file)
  return `      ${JSON.stringify(stage.id)}: ${JSON.stringify(text)},`
}).join('\n')
const bundle = source.replace(MARK, () => `\n${body}`)
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
