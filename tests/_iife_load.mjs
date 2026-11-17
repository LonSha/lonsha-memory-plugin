// tests/_iife_load.mjs — L23 判据共用装载器
// 本仓 .js 是 IIFE 双导出（module.exports + global.X），测试用同一份源码在沙箱里装载，
// 这样「判据的输入面」与「运行时装载面」是同一件事（不许为测试另写一份实现）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(HERE, '..');

export function loadIife(file, globalName) {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    const sandbox = { module: { exports: {} }, window: undefined, globalThis: undefined };
    const loader = new Function('globalThis', 'module', 'window',
        src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.' + globalName + ';');
    return loader(sandbox, sandbox.module, undefined);
}

export function readManifest() {
    return JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
}
