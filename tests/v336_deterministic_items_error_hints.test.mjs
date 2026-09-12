// v3.36 确定性物品重放 + 结构化错误诊断人话库 测试
import fs from 'node:fs';
const idxSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const suiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

// ===== 1. 版本一致性 =====
const mft = JSON.parse(mftSrc);
assert('manifest 版本为 3.36.0', mft.version === '3.36.0');
assert('index.js 版本为 3.36.0', idxSrc.includes("const VERSION = '3.36.0';"));

// ===== 2. 静态锚点检查 =====
assert('index.js 拥有 normalizeItemKey', idxSrc.includes('static normalizeItemKey(name)'));
assert('_sanitizeItemOp 包含 remove 动作', idxSrc.includes("act === 'remove'"));
assert('rebuildItems 包含三态补丁更新', idxSrc.includes("exist.desc = op.desc"));
assert('recallMemory 过滤丢失损毁物品', idxSrc.includes("r.state === '丢失' || r.state === '损毁'"));
assert('_ERROR_HINTS 包含结构化字段 (title/reason/action)', idxSrc.includes("title: 'API Key 无效'") && idxSrc.includes("action: '前往设置检查 API Key 与端点地址是否匹配。'"));
assert('hintForError 返回结构化组合人话', idxSrc.includes("`【${h.title}】${h.reason} 建议：${h.action}`"));
assert('settings-ui 包含 items 视图卡片', suiSrc.includes('data-view="items"'));
assert('settings-ui showBrowser 包含物品台账', suiSrc.includes("viewType === 'items'") && suiSrc.includes('🎒 物品台账'));
assert('settings-ui 物品条目绑定 data-opkind="item"', suiSrc.includes('data-opkind="item"'));
assert('settings-ui _memOps 包含物品操作 (变更持有者/变更状态/移除)', suiSrc.includes('👤 变更持有者') && suiSrc.includes('📦 变更状态') && suiSrc.includes('🗑 标记丢弃/移除'));
assert('settings-ui 诊断面板渲染人话指引', suiSrc.includes('💡 诊断指引：'));

// ===== 3. 行为模拟：normalizeItemKey 确定性键名归一 =====
function normalizeItemKey(name) {
    try {
        return String(name || '')
            .normalize('NFKC')
            .replace(/[《》【】\[\]（）\(\)"'“”‘’〈〉]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    } catch (e) { return String(name || '').trim().toLowerCase(); }
}
assert('剥离书名号《》', normalizeItemKey('《星空之钥》') === '星空之钥');
assert('剥离中括号【】', normalizeItemKey('【魔法药水】') === '魔法药水');
assert('剥离英文括号[]', normalizeItemKey('[Rusty Sword]') === 'rusty sword');
assert('空白折叠与小写归一', normalizeItemKey('  Key of   Truth  ') === 'key of truth');
assert('不同符号包裹归一到相同键', normalizeItemKey('《破晓之剑》') === normalizeItemKey('【破晓之剑】'));

// ===== 4. 行为模拟：rebuildItems 确定性重放与三态补丁 =====
function simSanitize(op) {
    if (!op || typeof op !== 'object') return null;
    const act = String(op.action || '').trim().toLowerCase();
    const action = (act === 'add' || act === 'update' || act === 'remove' || act === 'delete') ? act : '';
    const name = String(op.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!action || !name) return null;
    const key = normalizeItemKey(name);
    if (!key) return null;
    const clean = { action, name, key, floor: Math.max(0, Math.round(Number(op.floor) || 0)) };
    if (op.desc !== undefined && op.desc !== null) clean.desc = String(op.desc).trim().slice(0, 80);
    if (op.holder !== undefined && op.holder !== null) {
        const h = String(op.holder).trim();
        clean.holder = (h === '' || h === '无' || h === '地上' || h === 'null') ? '地上/遗落' : h.slice(0, 20);
    } else if (op.holder === null) {
        clean.holder = '地上/遗落';
    }
    if (op.state !== undefined && op.state !== null) clean.state = String(op.state).trim().slice(0, 10);
    return clean;
}

function simRebuild(ops) {
    const map = new Map();
    const REMOVE_STATES = new Set(['丢失', '损毁', '损坏', '已消耗', '消耗完毕', '丢弃', '已丢弃', '遗落']);
    for (const rawOp of ops) {
        const op = simSanitize(rawOp);
        if (!op) continue;
        const itemKey = op.key || normalizeItemKey(op.name);
        const exist = map.get(itemKey);
        if (op.action === 'remove' || op.action === 'delete') {
            map.delete(itemKey);
            continue;
        }
        if (op.action === 'add') {
            if (!exist) {
                if (!op.state || !REMOVE_STATES.has(op.state)) {
                    map.set(itemKey, {
                        name: op.name,
                        key: itemKey,
                        desc: op.desc || '',
                        holder: op.holder || '无主',
                        state: op.state || '完好',
                        floor: op.floor
                    });
                }
            } else {
                if (op.desc !== undefined) exist.desc = op.desc;
                if (op.holder !== undefined) exist.holder = op.holder;
                if (op.state !== undefined) exist.state = op.state;
                exist.floor = op.floor;
                if (exist.state && REMOVE_STATES.has(exist.state)) map.delete(itemKey);
            }
        } else if (op.action === 'update' && exist) {
            if (op.desc !== undefined) exist.desc = op.desc;
            if (op.holder !== undefined) exist.holder = op.holder;
            if (op.state !== undefined) exist.state = op.state;
            exist.floor = op.floor;
            if (exist.state && REMOVE_STATES.has(exist.state)) map.delete(itemKey);
        }
    }
    return Array.from(map.values());
}

{
    const ops = [
        { action: 'add', name: '《星空之钥》', holder: '爱丽丝', desc: '一把散发蓝光的钥匙', floor: 1 },
        { action: 'update', name: '星空之钥', desc: '钥匙光芒变得更加微弱', floor: 3 }
    ];
    const recs = simRebuild(ops);
    assert('确定性 ID 归一使得《星空之钥》与星空之钥合并', recs.length === 1);
    assert('三态语义：未提供 holder 时保留原持有者爱丽丝', recs[0].holder === '爱丽丝');
    assert('三态语义：提供了新 desc 时成功更新', recs[0].desc === '钥匙光芒变得更加微弱');

    // 转移到地上（明确置空）
    ops.push({ action: 'update', name: '星空之钥', holder: null, floor: 4 });
    const recs2 = simRebuild(ops);
    assert('三态语义：holder 为 null 转换为 地上/遗落', recs2[0].holder === '地上/遗落');

    // 明确移除
    ops.push({ action: 'remove', name: '【星空之钥】', floor: 5 });
    const recs3 = simRebuild(ops);
    assert('action: remove 成功将物品从活动列表剔除', recs3.length === 0);

    // 状态为损毁的物品不进入活动列表
    ops.push({ action: 'add', name: '生锈匕首', holder: '鲍勃', state: '损毁', floor: 6 });
    const recs4 = simRebuild(ops);
    assert('损毁物品不会残留于活动台账', recs4.length === 0);
}

// ===== 5. 行为模拟：_ERROR_HINTS 匹配与人话生成 =====
const HINTS = [
    { re: /401|Unauthorized|invalid.*api.*key|api key.*invalid/i, title: 'API Key 无效', reason: '密钥错误、被撤销或未配置。', action: '前往设置检查 API Key 与端点地址是否匹配。' },
    { re: /429|Too Many Requests|rate limit|quota/i, title: '触发频控限流', reason: '短时间内调用频率过高。', action: '稍等片刻重试，或调大并发间隔时间。' },
    { re: /context_length_exceeded|maximum context length/i, title: '上下文超限', reason: '单次提示词总 Token 超出了模型支持的上下文窗口。', action: '在设置中降低记忆注入预算，或开启归档隐藏已折叠楼层。' },
    { re: /Failed to fetch|NetworkError/i, title: '网络连接失败', reason: '无法连接到指定的 API 目标地址。', action: '检查设备网络连通性、代理软件是否放行或域名是否拼写错误。' }
];

function getHint(errStr) {
    for (const h of HINTS) {
        if (h.re.test(errStr)) {
            return `【${h.title}】${h.reason} 建议：${h.action}`;
        }
    }
    return '【未知异常】';
}

assert('401 准确命中并给出建议', getHint('API Error 401 Unauthorized').includes('【API Key 无效】'));
assert('429 限流命中并给出建议', getHint('Error: 429 Too Many Requests').includes('【触发频控限流】'));
assert('上下文超限给出预算降低建议', getHint('context_length_exceeded: maximum context length 8192').includes('在设置中降低记忆注入预算'));
assert('网络失败给出检查连通性建议', getHint('TypeError: Failed to fetch').includes('【网络连接失败】'));

console.log(`\n[v336-test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
