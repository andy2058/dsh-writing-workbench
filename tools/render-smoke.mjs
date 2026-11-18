/**
 * 渲染冒烟测试：用最小 React 替身把三个组件各渲染一遍，验证没有运行时异常、
 * 关键文案与结构在位（不需要浏览器）。
 *
 *   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" tools/render-smoke.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = new URL('../lib/client.js', import.meta.url);
const source = readFileSync(file, 'utf8');

let captured = null;
const window = { __ModuleLoader__: { load: (def) => { captured = def; } }, localStorage: memoryStorage() };

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/* ---------- 最小 React 替身 ---------- */
let renderCount = 0;
let hooks = { slots: [], cursor: 0 };
/* 真 React 里 setState 会触发重渲染；替身用一个标志位模拟，让 effect 里的 setState 生效。 */
let pendingRerender = false;

function createElement(tag, props, ...children) {
  return { tag, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
}

function hookSlot() {
  const index = hooks.cursor++;
  if (!(index in hooks.slots)) hooks.slots[index] = {};
  return hooks.slots[index];
}

const React = {
  createElement,
  Fragment: Symbol('Fragment'),
  useState(initial) {
    const slot = hookSlot();
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? initial() : initial;
    const set = (next) => {
      slot.value = typeof next === 'function' ? next(slot.value) : next;
      pendingRerender = true;
    };
    return [slot.value, set];
  },
  useRef(initial) {
    const slot = hookSlot();
    if (!('ref' in slot)) slot.ref = { current: initial };
    return slot.ref;
  },
  useMemo(factory, deps) {
    const slot = hookSlot();
    const changed = !('deps' in slot) || !deps || deps.some((d, i) => d !== slot.deps[i]);
    if (changed) {
      slot.value = factory();
      slot.deps = deps;
    }
    return slot.value;
  },
  useCallback(fn, deps) {
    return React.useMemo(() => fn, deps);
  },
  useEffect(fn, deps) {
    const slot = hookSlot();
    const changed = !('deps' in slot) || !deps || deps.some((d, i) => d !== slot.deps[i]);
    if (!changed) return;
    slot.deps = deps;
    if (slot.cleanup) slot.cleanup();
    slot.cleanup = fn();
  },
};

const ReactDOM = { createPortal: (node) => node };

const context = vm.createContext({
  window,
  console,
  globalThis: {},
  navigator: { clipboard: { writeText: async () => {} } },
  document: { createElement: () => ({ style: {}, select() {}, appendChild() {}, removeChild() {} }), body: { appendChild() {}, removeChild() {} }, execCommand() {} },
  setTimeout,
  clearTimeout,
  URLSearchParams,
  fetch: fetchStub,
});
vm.runInContext(source, context, { filename: file.pathname });

const dicts = {};
let fileUploadAvailable = true;
let uploadRejects = false;
let uploadCalls = 0;
let lastUploadRequest = null;
let lastCoverRequest = null;
async function fetchStub(url, init) {
  const href = String(url);
  if (href.indexOf('/api/x-writing-workbench/cover') !== -1) {
    lastCoverRequest = { url: href, init };
    const payload = {
      ok: true,
      url: 'https://ark.example.com/cover.png',
      path: '/Users/jim2056/DSH-Writing desk/稿件-2026-11-17-2230-abcdef/cover-20261117-223000.png',
      model: 'doubao-seedream-3-0-t2i-250415',
      size: '1536x2048',
      ms: 1200,
    };
    return { status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
  }
  lastUploadRequest = { url: href, init };
  return {
    status: 200,
    text: async () => JSON.stringify({ ok: true, value: { receiptId: 'rcpt-http', file: { attachmentId: 'att-http', name: '素材.md', bytes: 8 } } }),
  };
}
const capturedComponents = new Map();
let sent = null;
const prompts = [];
const opened = [];
const createdDirs = [];
const requireStub = (spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return ReactDOM;
  throw new Error('unexpected require: ' + spec);
};

const mod = captured.factory(requireStub);
mod.apply({
  effect(fn) { return fn(); },
  slots: {
    inject(owner, cb) { cb(); },
    register(options, Component) { capturedComponents.set(options.name + '#' + (options.id ?? options.key), Component); return { dispose() {} }; },
  },
  locale: {
    register(ns, locale, dict) { dicts[locale] = dict; return () => {}; },
    bind() { return (key) => dicts.zh[key] !== undefined ? dicts.zh[key] : key; },
  },
  get(key) {
    if (key === 'locale') return { subscribe: () => () => {} };
    if (key === 'sessions') {
      return {
        binding: (sessionId) => ({
          session: {
            prompt: async (content, mode) => {
              sent = { sessionId, content, mode };
              prompts.push({ sessionId, content, mode });
              return { ok: true, value: { accepted: true } };
            },
          },
        }),
      };
    }
    if (key === 'layout') return { selectPanel() {} };
    if (key === 'remote') return { $host: { home: '/Users/jim2056' } };
    if (key === 'workspaces') {
      return {
        create: async ({ path }) => ({
          workspaceId: 'ws-writing',
          path,
          title: 'DSH-Writing desk',
          sessionIds: [],
        }),
      };
    }
    if (key === 'uiWorkspace') {
      return {
        connectWorkspace: async () => 'session-new',
        openSession: (sessionId) => { opened.push(sessionId); },
        createDirectory: async (path, name) => {
          createdDirs.push({ path, name });
          return path + '/' + name;
        },
      };
    }
    if (key === 'fileUpload') {
      if (!fileUploadAvailable) return undefined;
      const failure = { ok: false, error: { code: 'file-upload/too-large', message: 'payload too large' } };
      return {
        upload: async (sessionId, data, name) => {
          uploadCalls += 1;
          if (uploadRejects) return failure;
          return { ok: true, value: { receiptId: 'rcpt-' + name, file: { attachmentId: 'att-' + name, name, bytes: data.length } } };
        },
        uploadImage: async (sessionId, data, mediaType, name) => {
          uploadCalls += 1;
          if (uploadRejects) return failure;
          return {
            ok: true,
            value: {
              receiptId: 'rcpt-' + (name || mediaType),
              image: { attachmentId: 'att-' + (name || mediaType), mediaType, bytes: data.length, width: 1, height: 1 },
            },
          };
        },
      };
    }
    return undefined;
  },
});

const PAGE = capturedComponents.get('main#writing-workbench');
const ICON = capturedComponents.get('sidebar.panellist#writing-workbench');
const ENTRY = capturedComponents.get('conversation.input.right#lou-writing-workbench');
if (!PAGE || !ICON || !ENTRY) {
  console.error('RENDER_FAIL: missing captured components, got', [...capturedComponents.keys()]);
  process.exit(1);
}

const summary = (id, title, extra) => ({ id, title, origin: 'user', blank: false, running: false, updatedAt: 1, retainedBy: { mainView: 0 }, ...extra });
const sessionState = {
  ids: ['s1', 's2', 's3'],
  byId: {
    s1: summary('s1', '老欧写作工作台', { updatedAt: 3, retainedBy: { mainView: 1 } }),
    s2: summary('s2', '新会话', { updatedAt: 2, blank: true }),
    s3: summary('s3', 'subagent', { origin: 'subagent', updatedAt: 1 }),
  },
  phase: 'ready',
};

function render(Component, props) {
  hooks = { slots: [], cursor: 0 };
  return rerender(Component, props);
}

/* 事件之后的重渲染：保留 hooks 槽位，模拟真 React 的 setState → 重渲染 */
function rerender(Component, props) {
  let tree;
  let passes = 0;
  do {
    pendingRerender = false;
    hooks.cursor = 0;
    tree = Component(props);
    renderCount += 1;
    passes += 1;
    if (passes > 20) throw new Error('render did not settle after 20 passes (effect loop)');
  } while (pendingRerender);
  const cleanups = hooks.slots.map((slot) => slot && slot.cleanup).filter((fn) => typeof fn === 'function');
  const text = flatten(tree).join(' ');
  return { tree, text, cleanups, hooksUsed: hooks.cursor };
}

function flatten(node) {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(flatten);
  return flatten(node.children || []);
}

const useSessions = (selector) => selector(sessionState);
const workspaceState = {
  byId: {
    'ws-writing': {
      workspaceId: 'ws-writing',
      path: '/Users/jim2056/DSH-Writing desk',
      title: 'DSH-Writing desk',
      sessionIds: ['s1', 'session-new'],
      createdAt: '2026-11-16T14:56:11.058Z',
      updatedAt: '2026-11-16T14:56:11.107Z',
    },
  },
};

const pageProps = {
  useSessions,
  useWorkspaces: (selector) => selector(workspaceState),
  usePanelInfo: (sel) => sel({ activePanelId: 'writing-workbench' }),
};
/* 默认目标是「新流程」；旧用例先明确选中 s1，新流程单独在最后验证 */
window.localStorage.setItem('dsh.writing-workbench.target', 's1');
const page = render(PAGE, pageProps);
if (!page.text.includes(dicts.zh.title)) {
  console.error('RENDER_FAIL: page title missing, rendered text:', page.text.slice(0, 300));
  process.exit(1);
}
for (const expected of [dicts.zh['flow.label'], dicts.zh['action.newFlow'], dicts.zh['action.copy']]) {
  if (!page.text.includes(expected)) {
    console.error('RENDER_FAIL: missing text "' + expected + '"');
    process.exit(1);
  }
}
if (!page.text.includes('老欧写作工作台')) {
  console.error('RENDER_FAIL: target session title not rendered');
  process.exit(1);
}

const icon = render(ICON, { size: 18, active: true });
if (icon.tree.tag !== 'svg') {
  console.error('RENDER_FAIL: sidebar icon is not an svg');
  process.exit(1);
}

const entry = render(ENTRY, { sessionId: 's1' });
if (!entry.text.includes(dicts.zh['trigger.label'])) {
  console.error('RENDER_FAIL: composer entry label missing');
  process.exit(1);
}

/* 每个阶段都能渲染（切到 pipeline 之外的阶段） */
for (const stageId of ['topic', 'structure', 'polish', 'spread', 'title', 'check', 'pipeline']) {
  window.localStorage.setItem('dsh.writing-workbench.stage', stageId);
  const view = render(PAGE, pageProps);
  if (!view.text.includes(dicts.zh['label.preview'])) {
    console.error('RENDER_FAIL: stage ' + stageId + ' did not render the preview card');
    process.exit(1);
  }
  const cleanupCount = view.cleanups.length;
  if (cleanupCount === 0) {
    console.error('RENDER_FAIL: stage ' + stageId + ' rendered no effect cleanup (leak risk)');
    process.exit(1);
  }
}

/* 点一次「发送到会话」：验证拼装结果与 session.prompt 的调用参数 */
window.localStorage.setItem('dsh.writing-workbench.stage', 'pipeline');
window.localStorage.setItem(
  'dsh.writing-workbench.values:pipeline',
  JSON.stringify({ brief: '写一篇关于中年人转行学编程的文章，2000 字左右' }),
);
const sendView = render(PAGE, pageProps);
const sendButton = findNode(
  sendView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
if (!sendButton) {
  console.error('RENDER_FAIL: 发送到会话 button not found');
  process.exit(1);
}
sendButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 30));
if (!sent) {
  console.error('RENDER_FAIL: clicking send did not call session.prompt');
  process.exit(1);
}
if (sent.sessionId !== 's1') {
  console.error('RENDER_FAIL: sent to ' + sent.sessionId + ' instead of the mainView session s1');
  process.exit(1);
}
if (sent.mode !== 'queue') {
  console.error('RENDER_FAIL: unexpected send mode ' + sent.mode);
  process.exit(1);
}
if (!sent.content[0].text.includes('中年人转行学编程') || !sent.content[0].text.includes('本次写作需求')) {
  console.error('RENDER_FAIL: assembled prompt is wrong:\n' + sent.content[0].text.slice(0, 400));
  process.exit(1);
}

/* 选一个附件再发送：验证 file 内容项 + 附件清单文案真的进入 session.prompt */
sent = null;
const uploadView = render(PAGE, pageProps);
const fileInput = findNode(uploadView.tree, (node) => node.tag === 'input' && node.props.type === 'file');
if (!fileInput) {
  console.error('RENDER_FAIL: file input not rendered');
  process.exit(1);
}
if (fileInput.props.multiple !== true) {
  console.error('RENDER_FAIL: file input does not allow multiple files');
  process.exit(1);
}
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const pickedFile = {
  name: '素材.md',
  size: bytes.length,
  type: 'text/markdown',
  arrayBuffer: async () => bytes.buffer,
};
fileInput.props.onChange({ target: { files: [pickedFile], value: '' } });
const picked = rerender(PAGE, pageProps);
if (!picked.text.includes('素材.md')) {
  console.error('RENDER_FAIL: picked file did not appear in the attachment list');
  process.exit(1);
}
const uploadSend = findNode(
  picked.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
uploadSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (!sent) {
  console.error('RENDER_FAIL: sending with an attachment did not call session.prompt');
  process.exit(1);
}
const fileParts = sent.content.filter((part) => part.type === 'file');
const serviceReceipt = fileParts[0] && fileParts[0].receiptId;
if (fileParts.length !== 1 || fileParts[0].receiptId !== 'rcpt-素材.md') {
  console.error('RENDER_FAIL: attachment not sent as a file content part:', JSON.stringify(fileParts));
  process.exit(1);
}
if (!sent.content[0].text.includes('素材.md')) {
  console.error('RENDER_FAIL: attachment note missing from the prompt text');
  process.exit(1);
}

/* 拿不到 fileUpload 服务时的兜底：直接 POST 上传接口，并用返回的 receiptId 发出去 */
sent = null;
fileUploadAvailable = false;
lastUploadRequest = null;
const fallbackView = render(PAGE, pageProps);
const fallbackInput = findNode(fallbackView.tree, (node) => node.tag === 'input' && node.props.type === 'file');
fallbackInput.props.onChange({ target: { files: [pickedFile], value: '' } });
const fallbackPicked = rerender(PAGE, pageProps);
const fallbackSend = findNode(
  fallbackPicked.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
fallbackSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (!lastUploadRequest) {
  console.error('RENDER_FAIL: no fileUpload service and no HTTP upload fallback request');
  process.exit(1);
}
if (!lastUploadRequest.url.includes('/api/session/uploadFileBinary?sessionId=s1')) {
  console.error('RENDER_FAIL: unexpected upload URL ' + lastUploadRequest.url);
  process.exit(1);
}
if (!lastUploadRequest.url.includes('name=')) {
  console.error('RENDER_FAIL: upload URL lost the file name: ' + lastUploadRequest.url);
  process.exit(1);
}
if (!sent || !sent.content.some((part) => part.type === 'file' && part.receiptId === 'rcpt-http')) {
  console.error('RENDER_FAIL: HTTP fallback receipt not sent as a file content part');
  process.exit(1);
}
fileUploadAvailable = true;

/* 服务在、但流式与 RPC 两层都返回 {ok:false}：必须继续退到直连接口，而不是拿空 receipt 去发送 */
sent = null;
uploadRejects = true;
uploadCalls = 0;
lastUploadRequest = null;
const rejectedView = render(PAGE, pageProps);
const rejectedInput = findNode(rejectedView.tree, (node) => node.tag === 'input' && node.props.type === 'file');
rejectedInput.props.onChange({ target: { files: [pickedFile], value: '' } });
const rejectedPicked = rerender(PAGE, pageProps);
const rejectedSend = findNode(
  rejectedPicked.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
rejectedSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (uploadCalls !== 2) {
  console.error('RENDER_FAIL: expected stream + rpc attempts before the HTTP fallback, saw ' + uploadCalls);
  process.exit(1);
}
if (!lastUploadRequest) {
  console.error('RENDER_FAIL: {ok:false} uploads did not fall through to the HTTP route');
  process.exit(1);
}
if (!sent || !sent.content.some((part) => part.type === 'file' && part.receiptId === 'rcpt-http')) {
  console.error('RENDER_FAIL: HTTP fallback after {ok:false} uploads did not reach session.prompt');
  process.exit(1);
}
uploadRejects = false;

/* 新流程：默认目标是「新流程」→ 在工作区里建会话、把提示词发给它、并把界面切到那个会话 */
sent = null;
opened.length = 0;
createdDirs.length = 0;
window.localStorage.removeItem('dsh.writing-workbench.target');
const flowView = render(PAGE, pageProps);
if (!flowView.text.includes(dicts.zh['session.newFlow'])) {
  console.error('RENDER_FAIL: the new-flow target option is missing from the session picker');
  process.exit(1);
}
const flowSend = findNode(
  flowView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
flowSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (!sent) {
  console.error('RENDER_FAIL: the new-flow send did not call session.prompt');
  process.exit(1);
}
if (sent.sessionId !== 'session-new') {
  console.error('RENDER_FAIL: the new-flow send went to ' + sent.sessionId + ' instead of the freshly created session');
  process.exit(1);
}
if (opened[0] !== 'session-new') {
  console.error('RENDER_FAIL: the new-flow session was not opened, opened=' + JSON.stringify(opened));
  process.exit(1);
}
if (!sent.content[0].text.includes('/Users/jim2056/DSH-Writing desk/稿件-')
  || !sent.content[0].text.includes('-new`')) {
  console.error('RENDER_FAIL: the new-flow prompt lost the per-session folder, text tail:', sent.content[0].text.slice(-260));
  process.exit(1);
}
if (createdDirs.length !== 1 || createdDirs[0].path !== '/Users/jim2056/DSH-Writing desk') {
  console.error('RENDER_FAIL: per-session folder was not created under the workspace: ' + JSON.stringify(createdDirs));
  process.exit(1);
}
if (!createdDirs[0].name.startsWith('稿件-')) {
  console.error('RENDER_FAIL: unexpected drafts folder name ' + createdDirs[0].name);
  process.exit(1);
}
const afterSend = rerender(PAGE, pageProps);
if (!afterSend.text.includes('/Users/jim2056/DSH-Writing desk/稿件-')) {
  console.error('RENDER_FAIL: status line does not show the absolute drafts folder');
  process.exit(1);
}
/* 后续阶段回到同一个会话：不需要再建目录，但要提醒模型把成果放进同一个文件夹 */
sent = null;
createdDirs.length = 0;
/* 真机上这个会话已经由工作区列出来了，测试夹具补进来 */
sessionState.ids.push('session-new');
sessionState.byId['session-new'] = summary('session-new', 'DSH-Writing desk', { updatedAt: 9 });
window.localStorage.setItem('dsh.writing-workbench.target', 'session-new');
window.localStorage.setItem('dsh.writing-workbench.values:pipeline', JSON.stringify({ brief: '把这篇稿子按老欧标准再自检一遍' }));
const reuseView = render(PAGE, pageProps);
const reuseSend = findNode(
  reuseView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
reuseSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
window.localStorage.setItem('dsh.writing-workbench.target', 's1');
window.localStorage.setItem(
  'dsh.writing-workbench.values:pipeline',
  JSON.stringify({ brief: '写一篇关于中年人转行学编程的文章，2000 字左右' }),
);
if (!sent || sent.sessionId !== 'session-new') {
  console.error('RENDER_FAIL: reusing the workflow session did not send to it, got ' + (sent && sent.sessionId));
  process.exit(1);
}
if (createdDirs.length !== 0) {
  console.error('RENDER_FAIL: reusing a session must not create another folder');
  process.exit(1);
}
if (!sent.content[0].text.includes(dicts.zh['note.saveKnown'].slice(0, 8))) {
  console.error('RENDER_FAIL: the reuse send lost the saved-drafts-folder reminder');
  process.exit(1);
}

/* 用户报告的场景：目标是一个已经在 DSH-Writing desk 里的会话（不是「新流程」），
   第一次发送时也必须在工作区下建出这个会话的专属目录 */
sent = null;
createdDirs.length = 0;
window.localStorage.removeItem('dsh.writing-workbench.folder:s1');
window.localStorage.setItem('dsh.writing-workbench.target', 's1');
window.localStorage.setItem(
  'dsh.writing-workbench.values:pipeline',
  JSON.stringify({ brief: '写一篇关于小区门口菜市场的文章' }),
);
const plainView = render(PAGE, pageProps);
const plainSend = findNode(
  plainView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
plainSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (!sent || sent.sessionId !== 's1') {
  console.error('RENDER_FAIL: plain session send went to ' + (sent && sent.sessionId));
  process.exit(1);
}
if (createdDirs.length !== 1 || createdDirs[0].path !== '/Users/jim2056/DSH-Writing desk') {
  console.error('RENDER_FAIL: a session already in the writing workspace did not get a folder: ' + JSON.stringify(createdDirs));
  process.exit(1);
}
const plainFolder = '/Users/jim2056/DSH-Writing desk/' + createdDirs[0].name;
if (!sent.content[0].text.includes(plainFolder)) {
  console.error('RENDER_FAIL: the prompt of a plain session lost its folder, tail:', sent.content[0].text.slice(-260));
  process.exit(1);
}
/* 同一个会话再发一次：命中缓存，不再建目录，但依然指向那个文件夹 */
sent = null;
createdDirs.length = 0;
const againView = render(PAGE, pageProps);
const againSend = findNode(
  againView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.sendQueue']),
);
againSend.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (createdDirs.length !== 0) {
  console.error('RENDER_FAIL: the cached folder was created a second time');
  process.exit(1);
}
if (!sent || !sent.content[0].text.includes(plainFolder)) {
  console.error('RENDER_FAIL: the cached folder is missing from the second prompt');
  process.exit(1);
}
window.localStorage.removeItem('dsh.writing-workbench.folder:s1');

/* 一键跑完后续：从「结构」开始，把后面 5 个环节按顺序排队到同一个会话 */
prompts.length = 0;
sent = null;
createdDirs.length = 0;
window.localStorage.setItem('dsh.writing-workbench.target', 's1');
window.localStorage.setItem('dsh.writing-workbench.stage', 'structure');
window.localStorage.setItem(
  'dsh.writing-workbench.values:structure',
  JSON.stringify({ topic: '中年人转行的真实代价' }),
);
const chainView = render(PAGE, pageProps);
const chainButton = findNode(
  chainView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.runRemaining']),
);
if (!chainButton) {
  console.error('RENDER_FAIL: the run-the-rest button is missing');
  process.exit(1);
}
if (!chainButton.props.title || !chainButton.props.title.includes('结构')) {
  console.error('RENDER_FAIL: the run-the-rest tooltip does not name the current stage: ' + chainButton.props.title);
  process.exit(1);
}
chainButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 120));
if (prompts.length !== 6) {
  console.error('RENDER_FAIL: expected 6 chained prompts (结构→润色→传播→自检→标题→封面), got ' + prompts.length);
  process.exit(1);
}
for (let index = 0; index < prompts.length; index += 1) {
  const entry = prompts[index];
  const text = entry.content[0].text;
  if (entry.sessionId !== 's1' || entry.mode !== 'queue') {
    console.error('RENDER_FAIL: chained prompt ' + (index + 1) + ' went to ' + entry.sessionId + '/' + entry.mode);
    process.exit(1);
  }
  if (!text.includes('【连续执行 ' + (index + 1) + '/6】')) {
    console.error('RENDER_FAIL: chained prompt ' + (index + 1) + ' lost its chain marker, tail: ' + text.slice(-200));
    process.exit(1);
  }
}
if (!prompts[0].content[0].text.includes('中年人转行的真实代价')) {
  console.error('RENDER_FAIL: the first chained prompt lost the filled field');
  process.exit(1);
}
if (!prompts[5].content[0].text.includes('封面')) {
  console.error('RENDER_FAIL: the last chained prompt is not the cover stage');
  process.exit(1);
}
const afterChain = rerender(PAGE, pageProps);
if (!afterChain.text.includes('已按顺序发出 6/6')) {
  console.error('RENDER_FAIL: the chain status line is missing, status text:', afterChain.text.slice(-200));
  process.exit(1);
}
/* 封面环节：17 种风格可选，点「生成封面」走宿主代理 */
window.localStorage.setItem('dsh.writing-workbench.stage', 'cover');
window.localStorage.setItem('dsh.writing-workbench.ark', 'ark-test-key');
window.localStorage.setItem(
  'dsh.writing-workbench.values:cover',
  JSON.stringify({
    title: '中年转行，先算清这三笔账',
    shortTitle: '三笔账',
    summary: '转行不是勇气问题，是现金流问题。',
    style: 'black-red-silhouette',
    ratio: '3:4',
  }),
);
const coverView = render(PAGE, pageProps);
const coverSelects = findAll(coverView.tree, (node) => node.tag === 'select');
const styleSelect = coverSelects.find((node) => findAll(node, (item) => item.tag === 'option').length === 17);
if (!styleSelect) {
  const sizes = coverSelects.map((node) => findAll(node, (item) => item.tag === 'option').length);
  console.error('RENDER_FAIL: no select with 17 cover styles, option counts: ' + sizes.join(','));
  process.exit(1);
}
const ratioSelect = coverSelects.find((node) => node !== styleSelect && findAll(node, (item) => item.tag === 'option').length === 3);
if (!ratioSelect) {
  console.error('RENDER_FAIL: the ratio select is missing');
  process.exit(1);
}
const previewArea = findNode(
  coverView.tree,
  (node) => node.tag === 'textarea' && String(node.props.className || '').indexOf('lou-wb-preview') !== -1,
);
const coverPrompt = previewArea ? String(previewArea.props.value || '') : '';
if (!coverPrompt.includes('cover prompt') || !coverPrompt.includes('黑红剪影')) {
  console.error('RENDER_FAIL: the cover preview is not the compiled cover prompt, head: ' + coverPrompt.slice(0, 160));
  process.exit(1);
}
if (!coverPrompt.includes('3:4') || !coverPrompt.includes('1536x2048')) {
  console.error('RENDER_FAIL: cover preview lost the ratio / size');
  process.exit(1);
}
if (!coverPrompt.includes('「“三笔账”」')) {
  console.error('RENDER_FAIL: cover preview does not quote the rendered title');
  process.exit(1);
}
const coverButton = findNode(
  coverView.tree,
  (node) => node.tag === 'button' && flatten(node).join('').includes(dicts.zh['action.generateCover']),
);
if (!coverButton) {
  console.error('RENDER_FAIL: the generate-cover button is missing');
  process.exit(1);
}
coverButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 60));
if (!lastCoverRequest) {
  console.error('RENDER_FAIL: clicking generate cover did not call the host proxy');
  process.exit(1);
}
const coverBody = JSON.parse(lastCoverRequest.init.body);
if (lastCoverRequest.init.headers['x-ark-key'] !== 'ark-test-key') {
  console.error('RENDER_FAIL: the Ark key header is missing: ' + JSON.stringify(lastCoverRequest.init.headers));
  process.exit(1);
}
if (coverBody.autoModel !== true) {
  console.error('RENDER_FAIL: cover request should enable auto model fallback by default');
}
if (coverBody.model !== 'doubao-seedream-4-0-250828') {
  console.error('RENDER_FAIL: default cover model is not the current seedream id: ' + coverBody.model);
}
if (coverBody.size !== '1536x2048' || !String(coverBody.prompt).includes('封面')) {
  console.error('RENDER_FAIL: unexpected cover request body: ' + lastCoverRequest.init.body.slice(0, 200));
  process.exit(1);
}
/* 模型 ID 可手填（旧 ID 会 404）：改成接入点 ID 后请求体要跟着变 */
const modelInput = findNode(
  coverView.tree,
  (node) => node.tag === 'input' && node.props && node.props.list === 'writing-workbench-cover-models',
);
if (!modelInput) {
  console.error('RENDER_FAIL: the cover model field is not an editable input with a datalist');
} else {
  modelInput.props.onChange({ target: { value: 'ep-20261117-test' } });
  const modelView = rerender(PAGE, pageProps);
  const modelButton = findNode(
    modelView.tree,
    (node) => node.tag === 'button' && flatten(node).join('') === dicts.zh['action.generateCover'],
  );
  lastCoverRequest = null;
  modelButton.props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 40));
  const typedBody = JSON.parse(lastCoverRequest.init.body);
  if (typedBody.model !== 'ep-20261117-test') {
    console.error('RENDER_FAIL: typed model id did not reach the host: ' + typedBody.model);
  }
}

const coverAfter = rerender(PAGE, pageProps);
if (!coverAfter.text.includes('封面已生成')) {
  console.error('RENDER_FAIL: cover status line missing, tail: ' + coverAfter.text.slice(-160));
  process.exit(1);
}
window.localStorage.setItem('dsh.writing-workbench.stage', 'pipeline');

function findAll(node, predicate) {
  const found = [];
  const walk = (item) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (predicate(item)) found.push(item);
    walk(item.children || []);
  };
  walk(node);
  return found;
}

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (predicate(node)) return node;
  return findNode(node.children || [], predicate);
}

console.log('components   :', [...capturedComponents.keys()].join(', '));
console.log('send path    :', 'session ' + sent.sessionId + ' / mode ' + sent.mode + ' / ' + sent.content[0].text.length + ' chars → session.prompt');
console.log('upload path  :', 'service receipt ' + serviceReceipt + ' + http fallback receipt rcpt-http → session.prompt');
console.log('renders      :', renderCount);
console.log('page text    :', page.text.slice(0, 120).replace(/\s+/g, ' '));
console.log('RENDER_OK');
