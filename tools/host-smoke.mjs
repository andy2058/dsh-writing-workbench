/* 宿主端冒烟：不需要真实服务器，直接调 lib/index.js 的 apply()，检查
   ① 10 个 skill 都注册了  ② 生图路由按 connection.fetch.register 的契约注册
   ③ 路由的错误分支返回可读的 code（缺 key / 缺提示词 / 非法方法） */
import { apply } from '../lib/index.js'

const skills = []
const effects = []
const routes = []
let route = null

const ctx = {
  effect(fn, id) {
    effects.push(id)
    return fn()
  },
  connection: {
    fetch: {
      register(candidate) {
        routes.push(candidate)
        if (candidate.path === '/api/x-writing-workbench/cover') route = candidate
        return () => Promise.resolve()
      },
    },
  },
  skills: {
    register(skill) {
      skills.push(skill)
      return () => {}
    },
  },
}

apply(ctx)

function fail(message) {
  console.error('HOST_FAIL: ' + message)
  process.exit(1)
}

if (skills.length !== 10) fail('expected 10 skills, got ' + skills.length)
const { inject } = await import('../lib/index.js')
if (!Array.isArray(inject) || !inject.includes('connection')) {
  fail('inject must include connection so the route registers after a DSH restart')
}
if (routes.length !== 2) fail('expected cover + health routes, got ' + routes.length)
const healthRoute = routes.find((r) => r.path === '/api/x-writing-workbench/health')
if (!healthRoute) fail('health route is missing')
const coverSkill = skills.find((skill) => skill.name === 'lao-ou-cover-design')
if (!coverSkill) fail('lao-ou-cover-design skill is missing')
const layoutSkill = skills.find((skill) => skill.name === 'lao-ou-wechat-layout')
if (!layoutSkill) fail('lao-ou-wechat-layout skill is missing')
if (!String(layoutSkill.content).includes('luobo-gzh-design')) fail('layout skill should credit luobo-gzh-design')
const topicSkill = skills.find((skill) => skill.name === 'lao-ou-topic-expert')
if (!topicSkill) fail('lao-ou-topic-expert skill is missing')
if (!String(topicSkill.content).includes('老欧拾光记 · 选题专家')) fail('topic expert skill content is not the merged copy')
if (topicSkill.provider !== 'dsh-writing-workbench') fail('topic expert should ship from the workbench provider')
if (!coverSkill.content.includes('cover prompt')) fail('cover skill content lost the blueprint')
if (!coverSkill.content.includes('minimal-visual-metaphor')) fail('cover skill content lost the style digest')

if (!route) fail('the cover route was never registered')
if (route.path !== '/api/x-writing-workbench/cover') fail('unexpected route path ' + route.path)
if (String(route.methods) !== 'POST') fail('unexpected methods ' + route.methods)
if (route.requestBody !== 'buffered') fail('unexpected requestBody mode ' + route.requestBody)
if (typeof route.fetch !== 'function') fail('route.fetch is not a function')

async function call(request) {
  const response = await route.fetch(request)
  const body = await response.json()
  return { status: response.status, body }
}

const noKey = await call(
  new Request('http://localhost/api/x-writing-workbench/cover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '一张封面' }),
  }),
)
if (noKey.status !== 200 || noKey.body.ok !== false || noKey.body.error.code !== 'missing-key') {
  fail('missing key did not produce missing-key: ' + JSON.stringify(noKey.body))
}

const noPrompt = await call(
  new Request('http://localhost/api/x-writing-workbench/cover', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ark-key': 'test-key' },
    body: JSON.stringify({ prompt: '   ' }),
  }),
)
if (noPrompt.body.ok !== false || noPrompt.body.error.code !== 'empty-prompt') {
  fail('empty prompt did not produce empty-prompt: ' + JSON.stringify(noPrompt.body))
}

/* 404 模型不可用：宿主必须把它翻成可执行的 model-not-found，而不是裸 ark-http */
const realFetch = globalThis.fetch
globalThis.fetch = async () => new Response(
  JSON.stringify({
    error: {
      code: 'InvalidEndpointOrModel.NotFound',
      message: 'The model or endpoint doubao-seedream-3-0-t2i-250415 does not exist or you do not have access to it.',
    },
  }),
  { status: 404, headers: { 'content-type': 'application/json' } },
)
let modelMissing
try {
  modelMissing = await call(
    new Request('http://localhost/api/x-writing-workbench/cover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ark-key': 'test-key' },
      body: JSON.stringify({ prompt: '一张封面', model: 'doubao-seedream-3-0-t2i-250415' }),
    }),
  )
} finally {
  globalThis.fetch = realFetch
}
if (modelMissing.body.ok !== false || modelMissing.body.error.code !== 'model-not-found') {
  fail('404 from Ark did not become model-not-found: ' + JSON.stringify(modelMissing.body))
}
if (!/ep-…/.test(modelMissing.body.error.message)) {
  fail('model-not-found message lost the actionable hint: ' + modelMissing.body.error.message)
}

/* 第一个候选 404、第二个能出图：必须自动往下试，并回报真正生效的模型 */
const okFetch = globalThis.fetch
let arkcalls = 0
globalThis.fetch = async (url, init) => {
  arkcalls += 1
  const sent = JSON.parse(init.body)
  if (sent.model === 'doubao-seedream-4-0-250828') {
    return new Response(
      JSON.stringify({ error: { code: 'InvalidEndpointOrModel.NotFound', message: 'The model or endpoint doubao-seedream-4-0-250828 does not exist or you do not have access to it.' } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(
    JSON.stringify({ data: [{ url: 'https://ark.example.com/cover.png' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}
let fellBack
try {
  fellBack = await call(
    new Request('http://localhost/api/x-writing-workbench/cover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ark-key': 'test-key' },
      body: JSON.stringify({ prompt: '一张封面', model: 'doubao-seedream-4-0-250828' }),
    }),
  )
} finally {
  globalThis.fetch = okFetch
}
if (fellBack.body.ok !== true || fellBack.body.model !== 'doubao-seedream-5-5-261028') {
  fail('auto model fallback did not switch to the next candidate: ' + JSON.stringify(fellBack.body))
}
if (arkcalls !== 2) fail('expected exactly 2 Ark attempts, got ' + arkcalls)
if (!Array.isArray(fellBack.body.tried) || fellBack.body.tried.length !== 2) {
  fail('tried list missing from a successful fallback: ' + JSON.stringify(fellBack.body))
}
if (fellBack.body.size !== '2K') {
  fail('5.x seedream must be asked for a 2K tier size, got ' + JSON.stringify(fellBack.body.size))
}

/* 429「安全体验模式」：必须翻成 quota-exceeded，而不是笼统的 ark-http */
const quotaFetch = globalThis.fetch
globalThis.fetch = async () => new Response(
  JSON.stringify({
    error: {
      code: 'SetLimitExceeded',
      message: 'Your account [2130410782] has reached the set usage limit for the [doubao-seedream-5-5] model, and the model service has been paused. To continue using this model, please visit the Model Activation page to adjust or close the "Safe Experience Mode".',
    },
  }),
  { status: 429, headers: { 'content-type': 'application/json' } },
)
let quota
try {
  quota = await call(
    new Request('http://localhost/api/x-writing-workbench/cover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ark-key': 'test-key' },
      body: JSON.stringify({ prompt: '一张封面', model: 'doubao-seedream-5-5-261028' }),
    }),
  )
} finally {
  globalThis.fetch = quotaFetch
}
if (quota.body.ok !== false || quota.body.error.code !== 'quota-exceeded') {
  fail('429 Safe Experience Mode did not become quota-exceeded: ' + JSON.stringify(quota.body))
}
if (!/开通管理/.test(quota.body.error.message)) {
  fail('quota-exceeded message lost the actionable hint: ' + quota.body.error.message)
}

const wrongMethod = await call(
  new Request('http://localhost/api/x-writing-workbench/cover', { method: 'GET' }),
)
if (wrongMethod.status !== 405 || wrongMethod.body.error.code !== 'method-not-allowed') {
  fail('GET did not produce 405: ' + JSON.stringify(wrongMethod))
}

if (effects.length !== skills.length + 2) {
  fail('expected one effect per skill plus two routes, got ' + effects.length)
}

console.log('skills       :', skills.length, '→', skills.map((skill) => skill.name).join(', '))
console.log('route        :', route.methods.join(','), route.path, '(' + route.requestBody + ')')
console.log('error codes  : missing-key / empty-prompt / model-not-found / method-not-allowed 全部就位')
console.log('HOST_OK')
