import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../engine-execution-pipeline.js',import.meta.url),'utf8');
function fixture(saveResult=true){
 let chat='a', acknowledged=0, saved;
 const batch={conversationId:'phone-a',events:[{id:'e1',type:'DEVICE_STATE_CHANGED',payload:{action:'impact',revision:1,source:'narrative-device-simulation',secret:'NEVER_COPY'}}]};
 const sandbox={console:{log(){},warn(){},error(){}},Set,Map,JSON};sandbox.window=sandbox;sandbox.self=sandbox;
 sandbox.VirtualPhone={lonshaBridge:{peekHolographicEvents:()=>batch,acknowledgeHolographicEvents:()=>{acknowledged++;return true;}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const engine={graph:{nodes:new Map()},config:{config:{autoSave:true}},clock:{date:'',setTime(){},syncFromNarrative(){},timeTagStats:{}},summary:{createSummary:async()=>{},compressSummary:t=>t},vector:{vectors:[]},getLatestStoryDate:()=>'',extractStoryDate:()=>'',readWorldLedger(){},checkTimeMonotonic(){},getCurrentChatId:()=>chat,collectExport:async()=>({extensions:{}}),_snapshotAnchorOf:()=>({fresh:false,floor:0}),recordSaveSource(){},recordSaveFailed(){},storage:{STORAGE_KEY:'test',save:async(id,payload)=>{saved=payload;return typeof saveResult==='function'?saveResult(()=>{chat='b';}):saveResult;},_lastWrite:{}},_loadedChatId:'a'};
 return {engine,run:()=>sandbox.LonShaEngineExecutionPipeline.applyExtractedPayload(engine,{}, {index:1,mes:'平静的一天'}, {chatId:'a'}),acked:()=>acknowledged,saved:()=>saved};
}
test('receiver persists sanitized batch before acknowledging',async()=>{const f=fixture();const r=await f.run();assert.equal(r.saved,true);assert.equal(f.acked(),1);assert.equal(f.saved().extensions.rubyPhoneDeviceEvents[0].action,'impact');assert.doesNotMatch(JSON.stringify(f.saved()),/NEVER_COPY/);});
test('failed save keeps batch unacknowledged and reports saved false',async()=>{const f=fixture(false);assert.equal((await f.run()).saved,false);assert.equal(f.acked(),0);assert.equal(f.engine._archiveExtensions,undefined);});
test('chat switch during save must not acknowledge or update current live state',async()=>{const f=fixture(switchChat=>{switchChat();return true;});await f.run();assert.equal(f.acked(),0);assert.equal(f.engine._archiveExtensions,undefined);});