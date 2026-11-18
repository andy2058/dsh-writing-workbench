/**
 * 老欧写作工作台 · 宿主端（Node 半）
 *
 * 两个职责：
 *   1. 把 templates/ 里的阶段提示词注册成 agent skill（模型在会话里能自动识别调用）
 *   2. 提供一个生图代理路由（走 ctx.connection.fetch，浏览器鉴权由宿主负责），
 *      让工作台页面能调用火山方舟（豆包 seedream）出封面：
 *      浏览器只把提示词交给宿主，Key 走请求头，不写配置、不落日志。
 *
 * 浏览器半（工作台 UI）在 lib/client.js，由 dsh.client 声明加载。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { SKILLS } from './skill-manifest.js'

export const inject = ['skills']

const COVER_PATH = '/api/x-writing-workbench/cover'
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const MAX_IMAGE = 24 * 1024 * 1024

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/* 只允许写进用户目录下的写作工作区，别让页面把文件写到任意路径 */
function safeFolder(input) {
  if (typeof input !== 'string' || input.trim() === '') return ''
  const folder = resolve(input.trim())
  const home = resolve(homedir())
  const inside = folder === home || folder.startsWith(home + '/')
  const allowed = inside && (folder.includes('DSH-Writing desk') || folder.includes('稿件-'))
  return allowed ? folder : ''
}

function errorMessage(body) {
  if (body && body.error && typeof body.error.message === 'string') return body.error.message
  if (body && typeof body.error === 'string') return body.error
  if (body && typeof body.message === 'string') return body.message
  return ''
}

async function saveImage(url, folder) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`下载图片失败 HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_IMAGE) throw new Error('图片超过 24MB，未保存')
  await mkdir(folder, { recursive: true })
  const stamp = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const name =
    'cover-' +
    stamp.getFullYear() +
    pad(stamp.getMonth() + 1) +
    pad(stamp.getDate()) +
    '-' +
    pad(stamp.getHours()) +
    pad(stamp.getMinutes()) +
    pad(stamp.getSeconds()) +
    '.png'
  const target = join(folder, name)
  await writeFile(target, buffer)
  return { path: target, bytes: buffer.length }
}

/* 账号里不一定开通了哪个 Seedream 版本：404（模型不存在/未开通）与 400（参数不合）都不计费，
   所以按候选表往下试，直到有模型真的出图。5.x 用 2K/4K 档位，4.x/3.x 用像素。 */
const COVER_MODEL_CANDIDATES = [
  'doubao-seedream-5-5-261028',
  'doubao-seedream-4-5-251128',
  'doubao-seedream-4-0-250828',
  'doubao-seedream-3-0-t2i-250415',
]

function isTierModel(model) {
  return /^doubao-seedream-5/i.test(model)
}

function sizeAttempts(model, pixels) {
  const tier = '2K'
  return isTierModel(model) ? [tier, pixels] : [pixels, tier]
}

async function postArk(key, model, prompt, size) {
  const response = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt,
      size,
      response_format: 'url',
      output_format: 'png',
      stream: false,
      watermark: false,
    }),
    signal: AbortSignal.timeout(180000),
  })
  const raw = await response.text()
  let body
  try {
    body = JSON.parse(raw)
  } catch (err) {
    body = undefined
  }
  return { status: response.status, body, raw }
}

async function generateCover(request) {
  const key = typeof request.key === 'string' ? request.key.trim() : ''
  if (key === '') throw Object.assign(new Error('缺少火山方舟 API Key'), { code: 'missing-key' })
  const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : ''
  if (prompt === '') throw Object.assign(new Error('封面提示词为空'), { code: 'empty-prompt' })
  const model =
    typeof request.model === 'string' && request.model.trim() !== ''
      ? request.model.trim()
      : 'doubao-seedream-3-0-t2i-250415'
  const size =
    typeof request.size === 'string' && /^\d{3,4}x\d{3,4}$/.test(request.size) ? request.size : '1536x2048'
  const autoModel = request.autoModel !== false

  const started = Date.now()
  const tried = []
  const wanted = autoModel ? [model, ...COVER_MODEL_CANDIDATES.filter((id) => id !== model)] : [model]
  let payload
  let usedModel = model
  let usedSize = size
  let lastMissing = null
  let missing = 0

  for (const candidate of wanted) {
    for (const attemptSize of sizeAttempts(candidate, size)) {
      const res = await postArk(key, candidate, prompt, attemptSize)
      if (res.status === 200 && res.body) {
        payload = res.body
        usedModel = candidate
        usedSize = attemptSize
        tried.push(candidate + ' ✓')
        break
      }
      const detail = errorMessage(res.body) || (res.raw || '').slice(0, 300)
      const code = (res.body && res.body.error && res.body.error.code) || ''
      if (/SetLimitExceeded|SafeExperience|usage limit/i.test(code + ' ' + detail)) {
        throw Object.assign(
          new Error(
            `方舟账号触发了「安全体验模式」用量上限（模型 ${candidate}）：${detail}｜处理：到方舟控制台`
              + '「开通管理」调整或关闭安全体验模式/额度后重试',
          ),
          { code: 'quota-exceeded', tried },
        )
      }
      if (res.status === 404 || /InvalidEndpointOrModel|does not exist|no access/i.test(code + ' ' + detail)) {
        missing += 1
        tried.push(candidate + ' 404')
        lastMissing = Object.assign(
          new Error(
            `方舟不认识模型「${candidate}」（404）：${detail}｜处理：到方舟控制台「开通管理」开通 Seedream（图片生成），`
              + '或在「在线推理」建接入点后把 ep-… 填进模型框',
          ),
          { code: 'model-not-found', tried },
        )
        break
      }
      if (res.status === 400 || /InvalidParameter|param/i.test(code)) {
        tried.push(candidate + ' size✗')
        continue
      }
      throw Object.assign(new Error(`方舟接口 ${res.status}（${candidate}）：${detail}`), {
        code: 'ark-http',
        tried,
      })
    }
    if (payload !== undefined) break
  }
  if (payload === undefined) {
    if (missing >= wanted.length) throw lastMissing
    throw Object.assign(new Error(`方舟没有可用模型：${tried.join(' / ')}`), { code: 'model-not-found', tried })
  }
  const first = payload && Array.isArray(payload.data) ? payload.data[0] : undefined
  const url = first && typeof first.url === 'string' ? first.url : ''
  if (url === '') throw Object.assign(new Error('方舟没有返回图片地址'), { code: 'no-image' })

  const result = { ok: true, url, model: usedModel, size: usedSize, tried, ms: Date.now() - started }
  const folder = safeFolder(request.folder)
  if (folder !== '') {
    try {
      const saved = await saveImage(url, folder)
      result.path = saved.path
      result.bytes = saved.bytes
    } catch (error) {
      result.saveError = error instanceof Error ? error.message : String(error)
    }
  }
  return result
}

async function handleCover(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: { code: 'method-not-allowed', message: '只接受 POST' } }, 405)
  }
  const key = request.headers.get('x-ark-key') || ''
  try {
    const body = await request.json().catch(() => ({}))
    return json(await generateCover({ ...(body && typeof body === 'object' ? body : {}), key }))
  } catch (error) {
    const code = error && error.code ? String(error.code) : 'cover-failed'
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: { code, message } })
  }
}

export function apply(ctx) {
  for (const skill of SKILLS) {
    ctx.effect(
      () => ctx.skills.register(skill),
      `writing-workbench:skill:${skill.name}`,
    )
  }

  const connection = ctx.get('connection')
  const fetchRoutes = connection ? connection.fetch : undefined
  if (fetchRoutes && typeof fetchRoutes.register === 'function') {
    ctx.effect(
      () =>
        fetchRoutes.register({
          path: COVER_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: handleCover,
        }),
      'writing-workbench:route:cover',
    )
  }
}
