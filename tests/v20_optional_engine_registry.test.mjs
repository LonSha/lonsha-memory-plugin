import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../optional-engine-registry.js';

test('optional engine registry discovers all dormant pure engines', () => {
    const status = registry.status();
    /* [v3.461.0 · 历史签证修复] 原判据把数量写死成 29。那时 R18 的 36 个引擎还是 ESM 形态，
     *   宿主/注册表按经典脚本 require 会整文件抛错 ⇒ loadOne 全返回 null，能加载的才只有 29。
     *   修好挂载形态后注册表真能取到 92 个 —— 写死 29 于是成了「锁着缺陷的数字」：
     *   修好它反而报红。改判**同源**（比写死数字更严）：
     *     ① status 必须与 entries 一一对应；② **每一个** entry 都真的 loaded；
     *     ③ entries 不得有重名（重名会让 loadAll 键数少于条目数 —— 同一引擎被静默装载两次，
     *        后一次覆盖前一次，调用方拿到的实例与注册表声明的不是同一份）；
     *     ④ loadAll 的键数必须等于条目数（③ 的可观测后果）。
     *   本轮正是靠 ③ 抓到注册表尾部重复登记 6 个引擎的真缺陷（loadAll 92 vs entries 98）。
     *   新增引擎忘了登记 / 某个引擎加载退化 / 重复登记，三种都能当场报红。 */
    assert.equal(status.length, registry.entries.length,
        `status 必须覆盖全部 entries（status ${status.length} / entries ${registry.entries.length}）`);
    assert.ok(registry.entries.length >= 29, '注册表条目数不得塌陷（原基线 29）');
    const notLoaded = status.filter((item) => !item.loaded).map((item) => item.file);
    assert.deepEqual(notLoaded, [], '这些引擎在注册表里取不到（加载形态退化）：' + notLoaded.join(', '));
    const names = registry.entries.map((e) => e[0]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dupes, [], '注册表有重名条目（loadAll 会静默去重、实例与声明不是同一份）：' + dupes.join(', '));
    const loaded = registry.loadAll();
    assert.equal(Object.keys(loaded).length, registry.entries.length,
        'loadAll 键数必须等于 entries 数（少就是有重名/加载失败）');
});
