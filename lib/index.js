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

  const started = Date.now()
  const response = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, prompt, size, response_format: 'url', watermark: false }),
    signal: AbortSignal.timeout(180000),
  })
  const raw = await response.text()
  let payload
  try {
    payload = JSON.parse(raw)
  } catch (err) {
    payload = undefined
  }
  if (!response.ok) {
    const detail = errorMessage(payload) || raw.slice(0, 300)
    throw Object.assign(new Error(`方舟接口 ${response.status}：${detail}`), { code: 'ark-http' })
  }
  const first = payload && Array.isArray(payload.data) ? payload.data[0] : undefined
  const url = first && typeof first.url === 'string' ? first.url : ''
  if (url === '') throw Object.assign(new Error('方舟没有返回图片地址'), { code: 'no-image' })

  const result = { ok: true, url, model, size, ms: Date.now() - started }
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
