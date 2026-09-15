import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
function extractClass(source, marker) { const start=source.indexOf(marker); assert.ok(start>=0); const body=source.indexOf('{',start); let depth=0; for(let i=body;i<source.length;i++){if(source[i]==='{')depth++; else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);} throw Error('class not closed'); }
test('DiarySystem 变化读取与角色白名单',()=>{ const D=new Function('return ('+extractClass(src,'class DiarySystem')+')')(); const d=new D(); d.diaries={甲:[{floor:2,text:'早期',keyEvents:['a']},{floor:5,text:'新近',keyEvents:['b']}],乙:[{floor:6,text:'无关'}]}; const out=d.getChangesSince(2,['甲']); assert.deepEqual(out.map(x=>x.text),['新近']); assert.equal(out[0].name,'甲'); out[0].keyEvents.push('mutated'); assert.deepEqual(d.diaries.甲[1].keyEvents,['b']); assert.deepEqual(d.getChangesSince(99,['甲']),[]); });
test('DiarySystem 空白白名单默认读取全部角色变化',()=>{ const D=new Function('return ('+extractClass(src,'class DiarySystem')+')')(); const d=new D(); d.diaries={甲:[{floor:1,text:'a'}],乙:[{floor:3,text:'b'}]}; assert.deepEqual(d.getChangesSince(0).map(x=>x.name),['甲','乙']); });
