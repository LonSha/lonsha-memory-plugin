#!/usr/bin/env node
/* ============================================================
 * tools/realhost_up.mjs — L13-O1 真宿主启动器
 *
 * 这不是 SillyTavern 的替代实现。它只负责把一个用户明确提供的
 * SillyTavern clone、当前插件和隔离 dataRoot 组装成可复跑的测试现场，
 * 再交给 tests/audit/_realhost_suite.mjs 取证。
 *
 * 环境变量 / 参数：
 *   LONSHA_ST_ROOT       ST clone（默认 /tmp/st-src）
 *   LONSHA_ST_DATA_ROOT  隔离数据目录（默认 /tmp/st/data）
 *   LONSHA_EXT_DIR       插件部署目录（默认 dataRoot/default-user/extensions/...）
 *   LONSHA_ST_PORT       端口（默认 8123）
 *
 * 用法：
 *   node tools/realhost_up.mjs              启动并等待 HTTP 200
 *   node tools/realhost_up.mjs --status     只检查现场
 *   node tools/realhost_up.mjs --stop       按进程组停止现场
 *
 * 失败统一 exit 2；不把「没启动」包装成真宿主通过。
 * ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag, env, fallback) => {
    const hit = argv.find((a) => a.startsWith(flag + '='));
    return hit ? hit.slice(flag.length + 1) : (process.env[env] || fallback);
};
const ST_ROOT = path.resolve(value('--root', 'LONSHA_ST_ROOT', '/tmp/st-src'));
const DATA_ROOT = path.resolve(value('--data-root', 'LONSHA_ST_DATA_ROOT', '/tmp/st/data'));
const PORT = Number(value('--port', 'LONSHA_ST_PORT', '8123'));
const EXT_DIR = path.resolve(value('--ext-dir', 'LONSHA_EXT_DIR', path.join(DATA_ROOT, 'default-user', 'extensions', 'lonsha-memory-plugin')));
const STATE_FILE = path.join(DATA_ROOT, '.lonsha-realhost.json');
const LOG_FILE = path.join(DATA_ROOT, 'lonsha-realhost.log');
const URL = 'http://127.0.0.1:' + PORT + '/';

function fail(message) {
    console.error('[realhost_up] 环境不可用：' + message);
    process.exit(2);
}
function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function killGroup(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(-pid, 'SIGTERM'); return true; } catch { return false; }
}
function extensionFiles() {
    const skip = (src) => {
        const rel = path.relative(ROOT, src);
        return rel === '.git' || rel.startsWith('.git' + path.sep) || rel === 'node_modules' || rel.startsWith('node_modules' + path.sep);
    };
    fs.mkdirSync(path.dirname(EXT_DIR), { recursive: true });
    /* 目标目录可能是上一次部署的同名目录；cpSync(ROOT, EXT_DIR) 会把目标
     * 视为 ROOT 的子树并产生自复制环，尤其会碰到 .git 临时对象。
     * 先清空目标，再只复制仓库内容，保持部署目录与仓库逐字一致。 */
    if (path.resolve(EXT_DIR) === path.resolve(ROOT)) fail('插件部署目录不能等于仓库根：' + EXT_DIR);
    fs.rmSync(EXT_DIR, { recursive: true, force: true });
    fs.mkdirSync(EXT_DIR, { recursive: true });
    for (const name of fs.readdirSync(ROOT)) {
        if (name === '.git' || name === 'node_modules') continue;
        const src = path.join(ROOT, name);
        const dest = path.join(EXT_DIR, name);
        fs.cpSync(src, dest, { recursive: true, force: true, filter: (item) => !skip(item) });
    }
}
async function httpStatus() {
    return await fetch(URL, { method: 'GET' }).then((r) => r.status).catch(() => 0);
}
async function waitForHttp(child, deadline) {
    while (Date.now() < deadline) {
        if (child.exitCode != null) return 0;
        const status = await httpStatus();
        if (status === 200) return status;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return 0;
}

if (has('--stop')) {
    const state = readState();
    if (!state || !state.pid) fail('没有可停止的现场状态：' + STATE_FILE);
    const killed = killGroup(Number(state.pid));
    try { fs.unlinkSync(STATE_FILE); } catch { /* 已清理 */ }
    console.log('[realhost_up] ' + (killed ? '已请求停止' : '进程组已不存在') + ' pid=' + state.pid);
    process.exit(0);
}
if (has('--status')) {
    const state = readState();
    const status = await httpStatus();
    const alive = !!(state && state.pid && status === 200);
    console.log(JSON.stringify({ alive, httpStatus: status, state }, null, 2));
    process.exit(alive ? 0 : 2);
}
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) fail('端口不合法：' + PORT);
if (!fs.existsSync(path.join(ST_ROOT, 'package.json')) || !fs.existsSync(path.join(ST_ROOT, 'server.js'))) {
    fail('ST clone 不完整，需要 package.json 与 server.js：' + ST_ROOT + '（设 LONSHA_ST_ROOT 覆盖）');
}
const existing = await httpStatus();
if (existing === 200) {
    const state = readState();
    if (state && state.pid) {
        console.log('[realhost_up] 已有可用 ST：' + URL + ' pid=' + state.pid);
        process.exit(0);
    }
    fail('端口已有 HTTP 200，但没有本工具的状态文件；为避免测到未知宿主，先手动清理或设其他端口');
}
fs.mkdirSync(DATA_ROOT, { recursive: true });
extensionFiles();
const log = fs.openSync(LOG_FILE, 'a');
const child = spawn(process.execPath, ['server.js', '--disableCsrf', '--dataRoot', DATA_ROOT], {
    cwd: ST_ROOT,
    env: { ...process.env, SILLYTAVERN_PORT: String(PORT) },
    detached: true,
    stdio: ['ignore', log, log],
});
child.unref();
const state = {
    schema: 'lonsha-realhost@1',
    pid: child.pid,
    port: PORT,
    url: URL,
    stRoot: ST_ROOT,
    dataRoot: DATA_ROOT,
    extDir: EXT_DIR,
    pluginVersion: JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version,
    startedAt: new Date().toISOString(),
};
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
const status = await waitForHttp(child, Date.now() + 120000);
if (status !== 200) {
    killGroup(child.pid);
    try { fs.unlinkSync(STATE_FILE); } catch { /* 已清理 */ }
    fail('ST 在 120s 内未返回 HTTP 200；日志：' + LOG_FILE);
}
console.log('[realhost_up] ST 已启动：' + URL);
console.log('[realhost_up] pid=' + child.pid + ' dataRoot=' + DATA_ROOT);
console.log('[realhost_up] 插件已同步到：' + EXT_DIR);
console.log('[realhost_up] 下一步：LONSHA_ST_URL=' + URL + ' LONSHA_EXT_DIR=' + EXT_DIR + ' node tests/audit/_realhost_suite.mjs --json');
