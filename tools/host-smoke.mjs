/* 宿主端冒烟：不需要真实服务器，直接调 lib/index.js 的 apply()，检查
   ① 8 个 skill 都注册了  ② 生图路由按 connection.fetch.register 的契约注册
   ③ 路由的错误分支返回可读的 code（缺 key / 缺提示词 / 非法方法） */
import { apply } from '../lib/index.js'

const skills = []
const effects = []
let route = null

const ctx = {
  effect(fn, id) {
    effects.push(id)
    return fn()
  },
  get(key) {
    if (key !== 'connection') return undefined
    return {
      fetch: {
        register(candidate) {
          route = candidate
          return () => Promise.resolve()
        },
      },
    }
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

if (skills.length !== 8) fail('expected 8 skills, got ' + skills.length)
const coverSkill = skills.find((skill) => skill.name === 'lao-ou-cover-design')
if (!coverSkill) fail('lao-ou-cover-design skill is missing')
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
if (fellBack.body.ok !== true || fellBack.body.model !== 'doubao-seedream-4-5-251128') {
  fail('auto model fallback did not switch to the next candidate: ' + JSON.stringify(fellBack.body))
}
if (arkcalls !== 2) fail('expected exactly 2 Ark attempts, got ' + arkcalls)
if (!Array.isArray(fellBack.body.tried) || fellBack.body.tried.length !== 2) {
  fail('tried list missing from a successful fallback: ' + JSON.stringify(fellBack.body))
}

const wrongMethod = await call(
  new Request('http://localhost/api/x-writing-workbench/cover', { method: 'GET' }),
)
if (wrongMethod.status !== 405 || wrongMethod.body.error.code !== 'method-not-allowed') {
  fail('GET did not produce 405: ' + JSON.stringify(wrongMethod))
}

if (effects.length !== skills.length + 1) {
  fail('expected one effect per skill plus the route, got ' + effects.length)
}

console.log('skills       :', skills.length, '→', skills.map((skill) => skill.name).join(', '))
console.log('route        :', route.methods.join(','), route.path, '(' + route.requestBody + ')')
console.log('error codes  : missing-key / empty-prompt / model-not-found / method-not-allowed 全部就位')
console.log('HOST_OK')
