
/* 性能取证探针 v2（O-5）：修正 v1 的口径错误 ——
 *   v1 把 `mkHost(1000)`（建 1000 楼场景树）算进了被测调用 ⇒ 报出 replayShift 98ms/次，
 *   而那 ~99ms 全是**夹具成本**。计时必须只包围**被测操作**。
 * 口径仍声明：合成数据 + 真模块，非实机。
 */
const path=require('path');
const R='/home/user/lonsha-memory-plugin';
const LR=require(path.join(R,'ledger-replay.js'));
const SB=require(path.join(R,'scene-book.js'));
function buildScene(N){const s=new SB.SceneBook();for(let f=1;f<=N;f++)s.apply([{action:'add',path:['城A','街'+f]}],f);return s;}
function mkHost(N,scene){
  return {floorLedger:{volumes:[{floorStart:1,floorEnd:N}],archived:[],_timelineInjectFloor:N,_diaryInjectFloor:N},
    diary:{removeByFloor:()=>1}, scene:scene||buildScene(N),
    archived:{removeByFloor:()=>0}, injectCursor:{shift:()=>0,drop:()=>0},
    stmLtm:{shiftFloorRefs:()=>0,removeByFloors:()=>0}};
}
function time(label, setup, fn, reps){
  // setup 不计时；每个 rep 用独立 host（避免前移/删楼之间的状态耦合）
  const hosts=[]; for(let i=0;i<reps;i++) hosts.push(setup());
  const t0=process.hrtime.bigint();
  let sum=0;
  for(let i=0;i<reps;i++) sum+=fn(hosts[i])||0;
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  return {label, per_op_ms:+(ms/reps).toFixed(2), reps, sum};
}
const res=[];
res.push(time('replayShift 1000 楼', ()=>mkHost(1000), h=>LR.replayShift(h,500).shifted, 5));
res.push(time('replayDrop  1000 楼', ()=>mkHost(1000), h=>LR.replayDrop(h,500).dropped, 5));
res.push(time('coverage()  1000 楼', ()=>mkHost(1000), h=>LR.coverage(h).rows.length, 5));
res.push(time('replayShift  200 楼', ()=>mkHost(200),  h=>LR.replayShift(h,100).shifted, 10));
res.push(time('coverage()   200 楼', ()=>mkHost(200),  h=>LR.coverage(h).rows.length, 10));
// 基线：只建 host 的成本（对照，不计入任何被测读数）
const s0=buildScene(1000); const h0=mkHost(1000,s0);
const t0=process.hrtime.bigint(); for(let i=0;i<5;i++){const s=buildScene(1000);} 
const buildMs=+(Number(process.hrtime.bigint()-t0)/1e6/5).toFixed(2);
// summary 纯读
const t1=process.hrtime.bigint(); for(let i=0;i<20;i++) s0.summary();
const sumMs=+(Number(process.hrtime.bigint()-t1)/1e6/20).toFixed(2);
console.log(JSON.stringify({synth:true,note:'合成数据 + 真模块（非实机）',
 scene_book_build_1000_ms:buildMs, summary_1000_floor_ms:sumMs, rows:res},null,1));
