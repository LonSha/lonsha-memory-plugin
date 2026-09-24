import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf8');
function extractClass(source, marker) { const start=source.indexOf(marker); assert.ok(start>=0); const body=source.indexOf('{',start); let d=0; for(let i=body;i<source.length;i++){if(source[i]==='{')d++; else if(source[i]==='}'&&--d===0)return source.slice(start,i+1);} throw Error('closed'); }
test('v3.118 变化驱动 DeltaBook API',()=>{ const D=new Function('return ('+extractClass(src,'class DeltaBook')+')')(); const db=new D(); db.add('早期事实成立','established',10); db.add('中期事实待定','uncertain',20); db.add('后期事实成立','established',30); const c=db.getChangesSince(10); assert.deepEqual(c.map(x=>x.evidenceFloor),[20,30]); c[0].summary='外部修改'; assert.equal(db.deltas[1].summary,'中期事实待定'); assert.deepEqual(db.getChangesSince(999),[]); const p=db.toPrompt({sinceFloor:10}); assert.ok(p.includes('中期事实待定')); assert.ok(p.includes('后期事实成立')); assert.ok(!p.includes('早期事实成立')); });
test('v3.118 无参数保持旧注入行为',()=>{ const D=new Function('return ('+extractClass(src,'class DeltaBook')+')')(); const db=new D(); db.add('兼容事实成立','established',1); assert.ok(db.toPrompt().includes('[正史增量]')); });
