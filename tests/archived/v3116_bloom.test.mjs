/**
 * v3.116 — gpu-renderer Bloom 真实现（空函数补全）
 *
 * 背景：applyBloom() 原先是空函数体（TODO 未实现），但 enableBloom 默认开
 *   （options.enableBloom !== false）且在渲染循环中被调用——即 Bloom 一直
 *   “假启用”。本版补上两遍高斯模糊 + 相加叠加，并把场景渲染到 sceneFbo。
 *
 * 无 WebGL 运行环境，用 mock gl 记录调用序列做端到端断言。
 *
 * 覆盖：
 *   0  版本与 manifest 注册（gpu-renderer.js 已在 extra_js）
 *   1  applyBloom 不再是空函数
 *   2  Bloom 资源句柄初值（_bloomSize=[0,0] 触发首次懒初始化）
 *   3  默认选项：enableBloom=true / bloomIntensity=0.8
 *   4  端到端 4-pass 流水线：FBO 切换顺序
 *   5  u_direction 顺序：水平 (1,0) 在垂直 (0,1) 之前
 *   6  u_intensity 只施加一次（Pass2 保持 1.0，避免强度被平方）
 *   7  GL 状态保存/恢复（BLEND / DEPTH / VIEWPORT）
 *   8  失败静默关闭：帧缓冲分配抛错时 enableBloom 置 false 且 render 不抛
 *   9  dispose 释放 Bloom 资源（FBO / 纹理全部回收）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const gpuSrc = readFileSync(path.join(ROOT, 'gpu-renderer.js'), 'utf8');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const { GPUGraphRenderer } = require('../gpu-renderer.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- mock gl ----------
class MockGL {
  constructor(opts = {}) {
    this.canvas = { width: 800, height: 600 };
    this.throwOnFbo = !!opts.throwOnFbo;
    this.fboLog = [];      // bindFramebuffer 调用序列
    this.texLog = [];      // bindTexture 调用序列
    this.dirLog = [];      // uniform2f(u_direction) 序列
    this.intLog = [];      // uniform1f(u_intensity) 序列
    this.drawCalls = 0;
    this.deletedTextures = 0;
    this.deletedFbos = 0;
    this.blendLog = [];    // enable/disable(BLEND) 序列
    this._state = {};      // glEnable/getParameter 状态表
    this._viewport = [0, 0, 800, 600];
    // 常量（与 WebGL 一致的数值）
    this.BLEND = 3042; this.DEPTH_TEST = 2929; this.VIEWPORT = 2978;
    this.COLOR_BUFFER_BIT = 16384; this.DEPTH_BUFFER_BIT = 256;
    this.TEXTURE_2D = 3553; this.FRAMEBUFFER = 36160; this.COLOR_ATTACHMENT0 = 36064;
    this.ARRAY_BUFFER = 34962; this.STATIC_DRAW = 35044; this.DYNAMIC_DRAW = 35048;
    this.TRIANGLES = 4; this.POINTS = 0; this.LINES = 1; this.FLOAT = 5126;
    this.TEXTURE0 = 33984; this.LINEAR = 9729; this.CLAMP_TO_EDGE = 33071;
    this.TEXTURE_MIN_FILTER = 10241; this.TEXTURE_MAG_FILTER = 10240;
    this.TEXTURE_WRAP_S = 10242; this.TEXTURE_WRAP_T = 10243;
    this.RGBA = 6408; this.UNSIGNED_BYTE = 5121;
    this.VERTEX_SHADER = 35633; this.FRAGMENT_SHADER = 35632;
    this.LINK_STATUS = 35714; this.COMPILE_STATUS = 35713;
    this.SRC_ALPHA = 770; this.ONE_MINUS_SRC_ALPHA = 771; this.ONE = 1;
    this.LEQUAL = 515;
    this._texSeq = 0; this._fboSeq = 0; this._progSeq = 0;
  }
  getExtension() { return null; }
  createShader() { return {}; }
  shaderSource() {}
  compileShader() {}
  getShaderParameter() { return true; }
  createProgram() { return { id: ++this._progSeq }; }
  attachShader() {}
  linkProgram() {}
  getProgramParameter() { return true; }
  getProgramInfoLog() { return ''; }
  getAttribLocation() { return 0; }
  getUniformLocation(prog, name) {
    if (String(name) === 'u_resolution') return null; // 与真实 GL 一样可能返回 null，且不入记录
    return { id: ++this._texSeq, name: String(name) };
  }
  createBuffer() { return { id: ++this._texSeq }; }
  bindBuffer() {}
  bufferData() {}
  enableVertexAttribArray() {}
  vertexAttribPointer() {}
  useProgram() {}
  uniformMatrix3fv() {}
  uniform2f(loc, x, y) { if (loc && loc.id != null && loc.name !== 'u_resolution') this.dirLog.push([x, y]); }
  uniform1f(loc, v) { if (loc && loc.id != null && loc.name !== 'u_resolution') this.intLog.push(v); }
  uniform1i() {}
  activeTexture() {}
  createTexture() { return { id: ++this._texSeq }; }
  bindTexture(t, o) { this.texLog.push(o && o.id != null ? o.id : null); }
  texImage2D() {}
  texParameteri() {}
  createFramebuffer() { return { id: ++this._fboSeq }; }
  bindFramebuffer(target, fbo) {
    this.fboLog.push(fbo == null ? 'screen' : (fbo && fbo.id != null ? fbo.id : '?'));
    if (fbo != null && this.throwOnFbo) throw new Error('mock: framebuffer alloc failed');
  }
  framebufferTexture2D() {}
  drawArrays() { this.drawCalls++; }
  viewport(x, y, w, h) { this._viewport = [x, y, w, h]; }
  clear() {}
  clearColor() {}
  depthFunc() {}
  blendFunc() {}
  enable(p) { this._state[p] = true; if (p === this.BLEND) this.blendLog.push('on'); }
  disable(p) { this._state[p] = false; if (p === this.BLEND) this.blendLog.push('off'); }
  getParameter(p) {
    if (p === this.VIEWPORT) return this._viewport;
    return !!this._state[p];
  }
  deleteTexture() { this.deletedTextures++; }
  deleteFramebuffer() { this.deletedFbos++; }
  deleteProgram() {}
  deleteBuffer() {}
}

function makeRenderer(opts = {}, mockOpts = {}) {
  const gl = new MockGL(mockOpts);
  const canvas = {
    width: 800, height: 600,
    clientWidth: 800, clientHeight: 600,
    getContext: () => gl,
  };
  const r = new GPUGraphRenderer(canvas, opts);
  return { r, gl };
}

const NODES = [{ x: 10, y: 20, size: 8, color: [1, 0, 0, 1], importance: 0.5 }];
const EDGES = [{ x1: 0, y1: 0, x2: 10, y2: 20, color: [0.3, 0.3, 0.3, 0.5] }];

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.116.0'), `index.js 版本 ${v} < 3.116.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.116.0'), `manifest 版本 ${manifest.version} < 3.116.0`);
  assert.ok(manifest.extra_js.includes('gpu-renderer.js'), 'gpu-renderer.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】applyBloom 不再是空函数', () => {
  const m = /applyBloom\(\)\s*{([\s\S]*?)\n    }/.exec(gpuSrc);
  assert.ok(m, 'applyBloom 方法存在于源码');
  const body = m[1];
  // 空实现特征：体内无 drawArrays / 无 bindFramebuffer
  assert.ok(/drawArrays/.test(body), 'applyBloom 体内包含真实绘制调用 drawArrays');
  assert.ok(/bindFramebuffer/.test(body), 'applyBloom 体内包含帧缓冲切换');
  assert.ok(/_initBloomTargets/.test(body), 'applyBloom 触发 FBO 懒初始化');
  // 逆向：原 TODO 空实现标记应已消失
  const todoInBloom = /applyBloom[\s\S]{0,400}?TODO/.test(gpuSrc);
  assert.ok(!todoInBloom, 'applyBloom 区域不再残留 TODO');
  ok('applyBloom 为真实实现');
});

// ---------- 2 ----------
test('【2】Bloom 资源句柄初值', () => {
  const { r } = makeRenderer();
  assert.deepStrictEqual(r._bloomSize, [0, 0], '_bloomSize 初值 [0,0]');
  assert.strictEqual(r._bloomFboA, null, '_bloomFboA 初值 null');
  assert.strictEqual(r._bloomFboB, null, '_bloomFboB 初值 null');
  assert.strictEqual(r._bloomSceneFbo, null, '_bloomSceneFbo 初值 null');
  // 首次 render 后被懒初始化
  r.render(NODES, EDGES);
  assert.deepStrictEqual(r._bloomSize, [800, 600], 'render 后 _bloomSize 更新为画布尺寸');
  assert.ok(r._bloomFboA && r._bloomFboB && r._bloomSceneFbo, '双 FBO 与 sceneFbo 均已创建');
  ok('资源句柄初值与懒初始化');
});

// ---------- 3 ----------
test('【3】默认选项：enableBloom=true / bloomIntensity=0.8', () => {
  const { r } = makeRenderer(); // 不传 options
  assert.strictEqual(r.options.enableBloom, true, 'enableBloom 默认开');
  assert.strictEqual(r.options.bloomIntensity, 0.8, 'bloomIntensity 默认 0.8');
  // 显式关闭
  const { r: r2 } = makeRenderer({ enableBloom: false });
  assert.strictEqual(r2.options.enableBloom, false, 'enableBloom 可显式关闭');
  const { r: r3 } = makeRenderer({ bloomIntensity: 0 });
  assert.strictEqual(r3.options.bloomIntensity, 0, 'bloomIntensity 可显式设 0');
  ok('默认选项正确');
});

// ---------- 4 ----------
test('【4】端到端 4-pass 流水线：FBO 切换顺序', () => {
  const { r, gl } = makeRenderer();
  r.render(NODES, EDGES);
  const log = gl.fboLog;
  // 实测序列（fbo id 逐次递增，故用「相对结构」断言而非具体 id）：
  //   init 创建期 [sceneFbo, fboA, fboB, 'screen'] → render 绑 sceneFbo
  //   Pass0 'screen' → Pass1 fboB → Pass2 fboA → Pass3 'screen'
  const screenIdx = log.map((v, i) => (v === 'screen' ? i : -1)).filter(i => i >= 0);
  assert.ok(screenIdx.length === 3, `默认帧缓冲（screen）恰好出现 3 次：init 尾 / Pass0 / Pass3，实际 ${screenIdx.length} 次 @${JSON.stringify(screenIdx)}`);
  const [initTail, p0, p3] = screenIdx;
  // render 阶段绑定的必须是 init 首创的 sceneFbo（场景确实渲染进离屏纹理）
  assert.strictEqual(log[p0 - 1], log[0], 'render 绑定 == init 首创的 sceneFbo（场景入离屏纹理）');
  // Pass0 与 Pass3 之间夹着 Pass1/Pass2 两次离屏输出，互不相同且都不是 screen
  const pass1Dest = log[p0 + 1], pass2Dest = log[p0 + 2];
  assert.ok(pass1Dest !== 'screen' && pass2Dest !== 'screen', 'Pass1/Pass2 输出到离屏 FBO（非 screen）');
  assert.notStrictEqual(pass1Dest, pass2Dest, 'Pass1 与 Pass2 输出到不同 FBO（双缓冲乒乓）');
  assert.strictEqual(log[p3 - 1], pass2Dest, 'Pass3 紧接 Pass2 的输出目标采样');
  // 场景绘制调用：边+节点 2 次 + Bloom 4 pass
  assert.strictEqual(gl.drawCalls, 6, `drawCalls == 6（边+节点 + 4 pass），实际 ${gl.drawCalls}`);
  ok('4-pass FBO 流水线顺序正确');
});

// ---------- 5 ----------
test('【5】u_direction 顺序：水平先于垂直', () => {
  const { r, gl } = makeRenderer({ bloomIntensity: 0.8 });
  r.render(NODES, EDGES);
  const dirs = gl.dirLog;
  assert.ok(dirs.some(d => d[0] === 1 && d[1] === 0), '存在水平方向 (1,0)');
  assert.ok(dirs.some(d => d[0] === 0 && d[1] === 1), '存在垂直方向 (0,1)');
  const h = dirs.findIndex(d => d[0] === 1 && d[1] === 0);
  const v = dirs.findIndex(d => d[0] === 0 && d[1] === 1);
  assert.ok(h < v, `水平 Pass(${h}) 必须在垂直 Pass(${v}) 之前`);
  ok('双 Pass 方向顺序正确');
});

// ---------- 6 ----------
test('【6】u_intensity 只施加一次（Pass2 保持 1.0）', () => {
  const { r, gl } = makeRenderer({ bloomIntensity: 0.8 });
  r.render(NODES, EDGES);
  const ints = gl.intLog;
  // 4 pass 的强度序列应为 [1.0, 0.8, 1.0, 1.0]——0.8 只出现一次
  const hits = ints.filter(v => Math.abs(v - 0.8) < 1e-9).length;
  assert.strictEqual(hits, 1, `bloomIntensity=0.8 在流水线中只施加一次（实际 ${hits} 次）`);
  // Pass2 垂直模糊必须保持 1.0：取 (1,0) 之后的那个强度
  const hIdx = gl.dirLog.findIndex(d => d[0] === 1 && d[1] === 0);
  const vIdx = gl.dirLog.findIndex(d => d[0] === 0 && d[1] === 1);
  assert.strictEqual(ints[hIdx], 0.8, '水平 Pass 施加 bloomIntensity');
  assert.strictEqual(ints[vIdx], 1.0, '垂直 Pass 强度保持 1.0（不被平方）');
  ok('强度只施加一次');
});

// ---------- 7 ----------
test('【7】GL 状态保存/恢复（BLEND 恢复为开）', () => {
  const { r, gl } = makeRenderer();
  r.render(NODES, EDGES);
  // setupGLState 开了 BLEND；applyBloom 中途 disable，末尾必须恢复
  const onIdx = gl.blendLog.lastIndexOf('on');
  const offIdx = gl.blendLog.lastIndexOf('off');
  assert.ok(onIdx > -1 && offIdx > -1, '存在 BLEND 的 enable/disable 记录');
  assert.ok(onIdx > offIdx, `BLEND 最终为开启态（on@${onIdx} > off@${offIdx}）`);
  assert.strictEqual(gl.getParameter(gl.BLEND), true, '渲染结束后 BLEND 仍开启（不污染下一帧）');
  assert.strictEqual(gl.getParameter(gl.DEPTH_TEST), true, '渲染结束后 DEPTH_TEST 仍开启');
  ok('GL 状态保存/恢复');
});

// ---------- 8 ----------
test('【8】失败静默关闭：分配抛错时 enableBloom=false 且 render 不抛', () => {
  // 第二参数是 mock 配置（throwOnFbo），不是 renderer options
  const { r } = makeRenderer({}, { throwOnFbo: true });
  assert.throws(() => r._initBloomTargets(800, 600), /framebuffer alloc failed/, 'mock 分配确实抛错');
  // render 必须不抛（双通道都保护了）
  let stats = null;
  assert.doesNotThrow(() => { stats = r.render(NODES, EDGES); }, 'render 在 Bloom 失败时不抛');
  assert.strictEqual(r.options.enableBloom, false, '失败后 enableBloom 静默置 false');
  assert.ok(stats && typeof stats.fps === 'number', 'render 仍返回统计');
  ok('失败静默降级');
});

// ---------- 9 ----------
test('【9】dispose 释放 Bloom 资源', () => {
  const { r, gl } = makeRenderer();
  r.render(NODES, EDGES);
  assert.ok(r._bloomFboA, '渲染后存在 Bloom 资源');
  r.dispose();
  assert.strictEqual(r._bloomFboA, null, 'dispose 后 _bloomFboA=null');
  assert.strictEqual(r._bloomFboB, null, 'dispose 后 _bloomFboB=null');
  assert.strictEqual(r._bloomSceneFbo, null, 'dispose 后 _bloomSceneFbo=null');
  assert.strictEqual(r._bloomSceneTex, null, 'dispose 后 _bloomSceneTex=null');
  // 3 张场景/模糊纹理 + 3 个 FBO 被回收
  assert.ok(gl.deletedTextures >= 3, `纹理释放 ${gl.deletedTextures} >= 3`);
  assert.ok(gl.deletedFbos >= 3, `帧缓冲释放 ${gl.deletedFbos} >= 3`);
  ok('dispose 释放 Bloom 资源');
});

test('汇总', () => {
  console.log(`\nv3116_bloom: ${pass} 项断言通过`);
});
