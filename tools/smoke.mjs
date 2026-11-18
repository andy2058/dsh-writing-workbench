/**
 * 静态冒烟测试：不启动浏览器，验证 lib/client.js 的注册契约与文案完整性。
 *
 *   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" tools/smoke.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = new URL('../lib/client.js', import.meta.url);
const source = readFileSync(file, 'utf8');

function fail(message) {
  console.error('SMOKE_FAIL: ' + message);
  process.exit(1);
}

let captured = null;
const window = { __ModuleLoader__: { load: (def) => { captured = def; } } };

function anyFn() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      return anyFn();
    },
    apply() { return anyFn(); },
  });
}

const react = new Proxy({}, { get: (_t, prop) => (prop === 'createElement' ? () => null : anyFn()) });
const reactDom = new Proxy({}, { get: () => anyFn() });

const requireStub = (spec) => {
  if (spec === 'react') return react;
  if (spec === 'react-dom') return reactDom;
  throw new Error('unexpected require: ' + spec);
};

const context = vm.createContext({ window, console, globalThis: {}, setTimeout, clearTimeout });
vm.runInContext(source, context, { filename: file.pathname });

if (!captured) fail('client.js did not call window.__ModuleLoader__.load');
if (captured.id !== '@lao-ou/dsh-writing-workbench') fail('unexpected module id: ' + captured.id);

const mod = captured.factory(requireStub);
if (typeof mod.apply !== 'function') fail('factory did not return apply()');
if (!Array.isArray(mod.inject)) fail('factory did not return inject[]');

const registrations = [];
const localeDicts = [];
const dicts = {};
let effects = 0;
const ctx = {
  effect(fn) { effects += 1; return fn(); },
  slots: {
    inject(owner, cb) { registrations.push({ owner, result: cb() }); },
    register(opts) { return { registered: opts }; },
  },
  locale: {
    register(ns, locale, dict) {
      dicts[locale] = dict;
      localeDicts.push({ ns, locale, keys: Object.keys(dict).length });
      return () => {};
    },
    bind(ns) { return (key) => (dicts.zh && dicts.zh[key] !== undefined ? dicts.zh[key] : key); },
  },
  get() { return undefined; },
};

mod.apply(ctx);

/* 1. 三个注册点：左侧栏图标 + 中央页面 + 输入框入口 */
const byOwner = new Map(registrations.map((r) => [r.owner, r.result.registered]));
const expected = [
  ['sidebar.panellist', 'writing-workbench', 15],
  ['main', 'writing-workbench', undefined],
  ['conversation.input.right', 'lou-writing-workbench', 20],
];
for (const [owner, id, order] of expected) {
  const reg = byOwner.get(owner);
  if (!reg) fail('missing slot registration for ' + owner);
  const cell = reg.id !== undefined ? reg.id : reg.key;
  if (cell !== id) fail(owner + ' registered cell ' + cell + ', expected ' + id);
  if (order !== undefined && reg.order !== order) fail(owner + ' order ' + reg.order + ', expected ' + order);
  if (typeof reg.label === 'function' && typeof reg.label() !== 'string') {
    fail(owner + ' label thunk did not return a string');
  }
}
if (effects < registrations.length + 2) fail('expected an effect per registration plus both locale dicts');

/* 2. 文案：zh / en 同键同量，且源码里每个 t('...') 都有词条 */
const zhKeys = Object.keys(dicts.zh || {});
const enKeys = Object.keys(dicts.en || {});
if (zhKeys.length === 0) fail('no zh dictionary registered');
if (zhKeys.length !== enKeys.length) fail('zh/en dictionary size mismatch: ' + zhKeys.length + ' vs ' + enKeys.length);
const missingEn = zhKeys.filter((key) => !(key in (dicts.en || {})));
if (missingEn.length > 0) fail('en dictionary missing keys: ' + missingEn.join(', '));

const used = new Set();
for (const match of source.matchAll(/\bt\('([a-zA-Z][\w.]*)'/g)) used.add(match[1]);
const missing = [...used].filter((key) => !(key in (dicts.zh || {})));
if (missing.length > 0) fail('t() keys without a dictionary entry: ' + missing.join(', '));

/* 3. 模板：七个阶段全部注入，且非空 */
const stageKeys = ['pipeline', 'topic', 'structure', 'polish', 'spread', 'title', 'check'];
const tplBlock = source.slice(source.indexOf('const TEMPLATES = {'), source.indexOf('/* ---------- 运行时上下文'));
for (const key of stageKeys) {
  if (!new RegExp('\\n\\s+"' + key + '":').test(tplBlock)) fail('template not injected: ' + key);
}

/* 4. 只使用已注册的主题变量 */
const tokensUsed = new Set([...source.matchAll(/--dsw-[a-z0-9-]+/g)].map((m) => m[0]));
const tokensLive = new Set([
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-on-color',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
]);
const unknown = [...tokensUsed].filter((token) => !tokensLive.has(token));
if (unknown.length > 0) fail('theme tokens not registered in this build: ' + unknown.join(', '));

/* 4b. 每个在渲染里用到的 .lou-wb-* 类都必须在 CSS 里有一条规则（防止"加了面板忘了加样式"） */
const cssStart = source.indexOf('const CSS = `');
const cssEnd = source.indexOf('`', cssStart + 13);
const cssText = cssStart >= 0 && cssEnd > cssStart ? source.slice(cssStart, cssEnd) : '';
const cssClasses = new Set([...cssText.matchAll(/\.(lou-wb-[a-z0-9-]+)/g)].map((m) => m[1]));
const usedClasses = new Set();
for (const match of source.matchAll(/'((?:lou-wb-[a-z0-9-]+(?:\s+[a-z0-9-]+)*))'/g)) {
  for (const part of match[1].split(/\s+/)) if (part.startsWith('lou-wb-')) usedClasses.add(part);
}
const unstyled = [...usedClasses].filter((name) => !cssClasses.has(name));
if (unstyled.length > 0) {
  fail('classes used in markup but never styled: ' + unstyled.join(', '));
}

/* 5. 附件上传：先走与输入框附件相同的流式链路（把 File 交给 fileUpload 服务），
      失败再退 base64 RPC，最后直连上传接口；三层都失败时把原因全部带回 */
for (const needle of [
  "'/api/session/uploadFileBinary'",
  "clientCtx.get('fileUpload')",
  'uploadViaHttp(',
  'describeError(',
  'service.uploadImage(sessionId, item.file',
  'service.upload(sessionId, item.file',
  'service.upload(sessionId, bytes',
  'receiptOf(',
  "type: 'file', receiptId",
  'uploadImage(',
  '.lou-wb-drop',
  '.lou-wb-fileinput',
]) {
  if (!source.includes(needle)) fail('upload support missing: ' + needle);
}
const streamAt = source.indexOf('service.upload(sessionId, item.file');
const rpcAt = source.indexOf('service.upload(sessionId, bytes');
const httpAt = source.indexOf('await uploadViaHttp(');
if (!(streamAt > 0 && rpcAt > streamAt && httpAt > rpcAt)) fail('upload fallback order is not stream → rpc → http');

/* 6. 新流程：在 DSH-Writing desk 工作区里建会话，并把成稿留在这个工作区 */
for (const needle of [
  "const WORKFLOW_TARGET = 'new'",
  "const WORKSPACE_NAME = 'DSH-Writing desk'",
  "workspaces.create({ path",
  "connectWorkspace(",
  "openSession(",
  "t('note.save', { folder })",
  'note.saveGeneric',
  'workspaceForSession(',
  'sessionWorkspace(',
  'isWritingWorkspace(',
  'ensureSessionFolder(',
  'note.saveKnown',
  'status.folder',
  'status.folderFailed',
  "const MANUSCRIPT_DIR = '稿件'",
  'sessionFolderName(',
  'runRemaining(',
  "t('note.chain'",
  'action.runRemaining',
  'await prepareTarget()',
  'chainAfter',
  'function withNotes(',
]) {
  if (!source.includes(needle)) fail('new-flow support missing: ' + needle);
}
if (!source.includes("lcSet") && !source.includes("lsSet(LS + 'target', sendTarget)")) {
  fail('new-flow mode must remember the session it created');
}

/* 6b. 环节顺序：选题 → 结构 → 润色 → 传播优化 → 自检 → 标题 */
const stageOrder = ['topic', 'structure', 'polish', 'spread', 'check', 'title'].map((id) =>
  source.indexOf("id: '" + id + "'"),
)
if (stageOrder.some((at) => at < 0)) fail('stage ids missing from the client source');
for (let index = 1; index < stageOrder.length; index += 1) {
  if (stageOrder[index] < stageOrder[index - 1]) {
    fail('stage order is wrong: expected topic → structure → polish → spread → check → title');
  }
}

/* 7. 页面显示的版本号与 package.json 一致 */
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!source.includes("const VERSION = 'v" + pkg.version + "'")) {
  fail('client VERSION does not match package.json version ' + pkg.version);
}
if (!pkg.exports || pkg.exports['./client'] === undefined) fail('package.json lost the ./client export');

console.log('id           :', captured.id);
console.log('inject       :', JSON.stringify(mod.inject));
console.log('locale dicts :', JSON.stringify(localeDicts));
console.log('slot inject  :', JSON.stringify(registrations.map((r) => ({
  owner: r.owner,
  name: r.result.registered.name,
  cell: r.result.registered.id !== undefined ? r.result.registered.id : r.result.registered.key,
  order: r.result.registered.order,
}))));
console.log('t() keys     :', used.size, 'used /', zhKeys.length, 'registered');
console.log('effects      :', effects);
console.log('SMOKE_OK');
