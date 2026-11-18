/**
 * 在 github.com 的 443 被墙、但 api.github.com 可用的环境里发布提交。
 *
 * 用法：
 *   TOKEN=<pat> node tools/push-api.mjs <localBase> <remoteParent> [to=HEAD] [ref=refs/heads/main]
 * 例：
 *   TOKEN=ghp_x node tools/push-api.mjs f7af64f 91e4f8fb HEAD
 *
 * 它把 localBase..to 的本地提交逐个重放到远端 remoteParent 之上（blob/tree/commit 全部走
 * Git Data API），最后 fast-forward 目标 ref。远端 SHA 会与本地不同，因为父链是重写的。
 */
import { execFileSync } from 'node:child_process'

const TOKEN = process.env.TOKEN
if (!TOKEN) { console.error('usage: TOKEN=<github patent token> node tools/push-api.mjs <localBase> <remoteParent> [to] [ref]'); process.exit(2) }
const REPO = process.env.REPO || 'andy2058/dsh-writing-workbench'
const DIR = process.env.DIR || process.cwd()
const BASE = 'https://api.github.com'
const H = { authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'dsh-push', 'content-type': 'application/json' }

async function api (method, path, body) {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: DIR, encoding: 'utf8' }).trim()
const bytes = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: DIR, maxBuffer: 64 * 1024 * 1024 })

const localBase = process.argv[2]     // local commit to diff from
const from = process.argv[3]          // remote parent commit sha
const to = process.argv[4] || 'HEAD'
const refName = process.argv[5] || 'refs/heads/main'

const commits = git('log', '--reverse', '--format=%H', `${localBase}..${to}`).split('\n').filter(Boolean)
console.log(`replaying ${commits.length} commit(s): local ${localBase.slice(0, 8)}..${to} on remote parent ${from.slice(0, 8)}`)
let parent = from
const mapping = {}
for (const sha of commits) {
  const parentTree = (await api('GET', `/repos/${REPO}/git/commits/${parent}`)).tree.sha
  const lines = git('diff-tree', '--no-commit-id', '--name-status', '-r', sha).split('\n').filter(Boolean)
  const treeItems = []
  for (const line of lines) {
    const [status, ...rest] = line.split('\t')
    const path = rest[rest.length - 1]
    if (status === 'D') { treeItems.push({ path, mode: '100644', type: 'blob', sha: null }); continue }
    const mode = git('ls-tree', sha, '--', path).split(' ')[0]
    const content = bytes('show', `${sha}:${path}`).toString('base64')
    const blob = await api('POST', `/repos/${REPO}/git/blobs`, { content, encoding: 'base64' })
    treeItems.push({ path, mode, type: 'blob', sha: blob.sha })
  }
  const tree = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: parentTree, tree: treeItems })
  const message = git('log', '-1', '--format=%B', sha)
  const commit = await api('POST', `/repos/${REPO}/git/commits`, { message, tree: tree.sha, parents: [parent] })
  mapping[sha] = commit.sha
  parent = commit.sha
  console.log(`  ${sha.slice(0, 8)} -> ${commit.sha.slice(0, 8)}  ${lines.length} file(s)  ${message.split('\n')[0].slice(0, 50)}`)
}
await api('PATCH', `/repos/${REPO}/git/refs/${refName.replace('refs/', '')}`, { sha: parent, force: false })
console.log('REF_UPDATED', refName, '->', parent)
console.log(JSON.stringify(mapping))
