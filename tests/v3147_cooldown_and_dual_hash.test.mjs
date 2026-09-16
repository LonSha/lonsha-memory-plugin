import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const src = fs.readFileSync('index.js', 'utf8');

function braceEnd(str, openBraceIdx) {
    let depth = 0;
    for (let i = openBraceIdx; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch; i++;
            while (i < str.length && str[i] !== q) { if (str[i] === '\\') i++; i++; }
        }
        else if (ch === '/' && str[i + 1] === '/') { while (i < str.length && str[i] !== '\n') i++; }
    }
    return -1;
}

function extractFn(name) {
    let start = src.indexOf(`async function ${name}(`);
    if (start < 0) start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    const end = braceEnd(src, brace);
    if (end < 0) throw new Error('unterminated fn ' + name);
    return src.slice(start, end + 1);
}

function extractClass(name) {
    let start = src.indexOf(`class ${name} {`);
    if (start < 0) start = src.indexOf(`class ${name}{`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    const end = braceEnd(src, brace);
    if (end < 0) throw new Error('unterminated class ' + name);
    return src.slice(start, end + 1);
}

test('【v3.147.0】结构与契约基线断言', () => {
  assert.ok(src.includes("const VERSION = '3.150.0';"), '版本号为 3.150.0');
  assert.ok(src.includes('_credCooldowns = new Map()'), '存在 _credCooldowns 冷却表');
  assert.ok(src.includes('clearApiCooldowns'), '存在 clearApiCooldowns 方法');
  assert.ok(src.includes('getApiCooldownStats'), '存在 getApiCooldownStats 方法');
  assert.ok(src.includes('_calcHashes'), 'VectorStore 存在 _calcHashes');
  assert.ok(src.includes('this.embedCache'), 'VectorStore 存在 embedCache');
});

test('【v3.147.0 行为】API 凭据 401/403 冷却拦截与恢复', async () => {
  let fetchCount = 0;
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    fetchCount++;
    if (fetchCount === 1) {
      return { ok: false, status: 401, text: async () => 'Unauthorized' };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
  };

  const hash32Code = extractFn('hash32');
  const getCredKeyCode = extractFn('_getCredKey');
  const clearCooldownsCode = extractFn('clearApiCooldowns');
  const getStatsCode = extractFn('getApiCooldownStats');
  const fetchCode = extractFn('fetchWithTimeoutRetry');

  const makeScope = new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'PLUGIN_NAME', `
    ${hash32Code}
    const _credCooldowns = new Map();
    ${getCredKeyCode}
    ${clearCooldownsCode}
    ${getStatsCode}
    ${fetchCode}
    fetchWithTimeoutRetry.clearCooldowns = clearApiCooldowns;
    fetchWithTimeoutRetry.getCooldownStats = getApiCooldownStats;
    return { fetchWithTimeoutRetry, clearApiCooldowns, getApiCooldownStats };
  `);

  const scope = makeScope(global.fetch, AbortController, setTimeout, clearTimeout, 'LonShaMemory');

  // 清理初始状态
  scope.clearApiCooldowns();

  // 1. 发起请求，第一次触发 401
  let err1 = null;
  try {
    await scope.fetchWithTimeoutRetry('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test_key_401' }
    }, { label: 'LLMTest', apiKey: 'test_key_401' });
  } catch (e) {
    err1 = e;
  }
  assert.strictEqual(fetchCount, 1, '第一次请求发出了网络请求');

  // 2. 再次发起相同凭据的请求，应该被 401 冷却拦截，网络 fetch 计数不增加！
  let err2 = null;
  try {
    await scope.fetchWithTimeoutRetry('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test_key_401' }
    }, { label: 'LLMTest', apiKey: 'test_key_401' });
  } catch (e) {
    err2 = e;
  }
  assert.strictEqual(fetchCount, 1, '第二次请求在冷却期被拦截，未发出 fetch');
  assert.ok(err2?.message?.includes('401/403 冷却中'), '抛出明确的凭据冷却异常');

  // 3. 检查 冷却诊断统计
  const stats = scope.getApiCooldownStats();
  assert.strictEqual(stats.activeCount, 1, '统计有 1 条活跃冷却');

  // 4. 清理冷却
  scope.clearApiCooldowns();
  assert.strictEqual(scope.getApiCooldownStats().activeCount, 0, '清理后 activeCount 为 0');

  // 5. 再次请求，这次正常发出
  const res3 = await scope.fetchWithTimeoutRetry('https://api.example.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer test_key_401' }
  }, { label: 'LLMTest', apiKey: 'test_key_401' });

  assert.strictEqual(fetchCount, 2, '清理冷却后，请求正常发出');
  assert.strictEqual(res3.status, 200, '返回 200 OK');

  global.fetch = originalFetch;
});

test('【v3.147.0 行为】VectorStore 双 hash 分层对账与 embedCache 缓存命中', async () => {
  let apiCallCount = 0;
  const originalFetch = global.fetch;

  global.fetch = async () => {
    apiCallCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    };
  };

  const hash32Code = extractFn('hash32');
  const errLogCode = 'function errLog(e, label) { console.error(label, e); }';
  const getCredKeyCode = extractFn('_getCredKey');
  const clearCooldownsCode = extractFn('clearApiCooldowns');
  const getStatsCode = extractFn('getApiCooldownStats');
  const fetchCode = extractFn('fetchWithTimeoutRetry');
  const vecStoreCode = extractClass('VectorStore');

  const makeScope = new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'PLUGIN_NAME', 'localStorage', `
    ${hash32Code}
    ${errLogCode}
    const _credCooldowns = new Map();
    ${getCredKeyCode}
    ${clearCooldownsCode}
    ${getStatsCode}
    ${fetchCode}
    ${vecStoreCode}
    return { VectorStore };
  `);

  const mockStorage = { getItem: () => '', setItem: () => {} };
  const scope = makeScope(global.fetch, AbortController, setTimeout, clearTimeout, 'LonShaMemory', mockStorage);

  const cfg = {
    config: {
      embeddingUrl: 'https://api.openai.com/v1',
      embeddingKey: 'sk-valid-key',
      embeddingModel: 'text-embedding-ada-002'
    }
  };

  const vs = new scope.VectorStore(cfg);

  // 1. 首次添加向量
  const id1 = await vs.addVector('这是测试文本A', { floor: 10, importance: 4 });
  assert.ok(id1.startsWith('vec_'), '生成 vector ID');
  assert.strictEqual(apiCallCount, 1, '首次获取向量调用了 API');

  const vec1 = vs.vectors[0];
  assert.ok(vec1.docHash.startsWith('doc_'), '生成 docHash');
  assert.ok(vec1.payloadHash.startsWith('pay_'), '生成 payloadHash');

  // 2. 再次添加相同文本（docHash 相同，payloadHash 改变）
  const id2 = await vs.addVector('这是测试文本A', { floor: 20, importance: 9 });
  assert.strictEqual(apiCallCount, 1, '命中 embedCache，未重复调用 API！');

  const vec2 = vs.vectors[1];
  assert.strictEqual(vec1.docHash, vec2.docHash, '相同文本 docHash 一致');
  assert.notStrictEqual(vec1.payloadHash, vec2.payloadHash, '不同 metadata payloadHash 区分');

  // 3. 导出与导入 round-trip，核验 embedCache 热恢复
  const exported = vs.export();
  assert.strictEqual(exported.length, 2);
  assert.ok(exported[0].docHash && exported[0].payloadHash, '导出包含 docHash 与 payloadHash');

  const vs2 = new scope.VectorStore(cfg);
  vs2.import(exported);
  assert.strictEqual(vs2.getCacheStats().cacheSize, 1, '导入后自动预热 1 个唯一 docHash');

  // 4. 对导入后的已存在文本发起 getEmbedding
  apiCallCount = 0;
  const emb = await vs2.getEmbedding('这是测试文本A');
  assert.strictEqual(apiCallCount, 0, '导入预热后，查询已存在文本 API 调用为 0');
  assert.deepStrictEqual(Array.from(emb), Array.from(new Float32Array([0.1, 0.2, 0.3])), '向量数据精确匹配');

  global.fetch = originalFetch;
});