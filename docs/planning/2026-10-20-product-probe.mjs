// Planning evidence only. Real modules with synthetic data, not a host/model test.
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);
const C=req('../../lore-crosscheck.js'),MP=req('../../material-pack.js'),Q=req('../../qa-thread.js'),F=req('../../fact-version.js'),L=req('../../lore-import.js'),UR=req('../../unified-recall.js'),CL=req('../../commitment-ledger.js');
const out={};
out.crosscheck={negative:C.verdictOf({expect:'已归还'},[{text:'尚未归还，不能说已归还'}]),missing:C.verdictOf({settingAsHappened:true},[])};
out.materialConflict=MP.resolveConflicts([{id:'confirmed',usable:true,conflictGroup:'住所',floor:10,origin:'confirmed'},{id:'rumor',usable:true,conflictGroup:'住所',floor:11,origin:'reported'}]);
out.thread=Q.threadSpec({subjects:['甲','乙'],atFloor:20,state:'open',turn:2,compareAxis:'compare',chatKey:'x',branchKey:'b'});
out.modalityCopy=F.normalize({facts:[{id:'f',subject:'甲',predicate:'状态',value:'死亡',origin:'stated',floor:10,modality:'dream'}]}).facts;
out.tailRecall=UR.nodeToCandidate({id:'n',name:'档案',data:{content:'前'.repeat(4500)+'尾部唯一事实'}},{}).searchText.includes('尾部唯一事实');
const a=L.parseSource({text:`# 角色
甲住北京
# 角色
乙住上海`,file:'x'}),b=L.parseSource({text:`# 角色
乙住上海
# 角色
甲住北京`,file:'x'});
out.importReorder=L.changedSections(a,b).counts;
const cap=CL.normalize({seq:201,items:Array.from({length:201},(_,i)=>({id:'c'+i,content:'约定'+i,status:'open',actor:'甲'}))}).items.map(x=>x.id);
out.commitmentCap={kept:cap.length,first:cap[0],retainedOldest:cap.includes('c0')};
console.log(JSON.stringify(out,null,2));
