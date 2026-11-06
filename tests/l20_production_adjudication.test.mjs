import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pipeline = require('../engine-execution-pipeline.js');
const immunity = require('../memory-healing-immunity-adjudicator.js');
test('production extraction quarantines contradictory output before graph mutation', async () => {
  const engine = {config:{config:{}}, invariants:{items:[{character:'林深',rule:'林深已死亡'}]},summary:{getLockedFacts:()=>[]}};
  const result = await pipeline.applyExtractedPayload(engine,{characters:['林深']},{mes:'林深拔剑走出房门。',index:4});
  assert.equal(result.quarantined,true);
  assert.equal(result.saved,false);
  assert.match(immunity.buildImmunizationDirectives(engine._memoryHealingImmunityState),/林深/);
});
test('empty entities do not match arbitrary actors or items; regex entities are literal',()=>{
  const state = immunity.createState();
  assert.equal(immunity.adjudicateAndHeal('他大笑，佩戴徽章。',[{text:'已死亡'},{text:'焚毁'},null],state).healthy,true);
  assert.equal(immunity.adjudicateAndHeal('路人大笑。',[{character:'[',rule:'已死亡'}],state).healthy,true);
  assert.equal(immunity.adjudicateAndHeal('[大笑。',[{character:'[',rule:'已死亡'}],state).healthy,false);
});