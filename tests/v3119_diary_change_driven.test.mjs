import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf8');
/* [v3.258.0 A1 第三刀] DiarySystem 已抽为 narrative-generators.js：真执行面读模块文件
   （宿主不再内联声明由 v3260 A 段钉住）。 */
const genSrc = readFileSync(`${REPO_ROOT}/narrative-generators.js`, 'utf8');
/* [v3.279.0 O7] 抽取面改为**真模块装载**：修前本档从 narrative-generators.js 抠 DiarySystem 类体 +
 *   new Function 重放，那是与真类**并行的第二实现**；现在直接 require 真模块拿真类 ——
 *   语义一字不改，只换「被跑的对象」（genSrc 仍保留供静态面）。 */
const require_ = createRequire(import.meta.url);
const NG = require_(new URL('../narrative-generators.js', import.meta.url).pathname);
test('DiarySystem 变化读取与角色白名单',()=>{ const D=NG.DiarySystem; const d=new D(); d.diaries={甲:[{floor:2,text:'早期',keyEvents:['a']},{floor:5,text:'新近',keyEvents:['b']}],乙:[{floor:6,text:'无关'}]}; const out=d.getChangesSince(2,['甲']); assert.deepEqual(out.map(x=>x.text),['新近']); assert.equal(out[0].name,'甲'); out[0].keyEvents.push('mutated'); assert.deepEqual(d.diaries.甲[1].keyEvents,['b']); assert.deepEqual(d.getChangesSince(99,['甲']),[]); });
test('DiarySystem 空白白名单默认读取全部角色变化',()=>{ const D=NG.DiarySystem; const d=new D(); d.diaries={甲:[{floor:1,text:'a'}],乙:[{floor:3,text:'b'}]}; assert.deepEqual(d.getChangesSince(0).map(x=>x.name),['甲','乙']); });
