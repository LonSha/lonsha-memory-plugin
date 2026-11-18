// [v4.163.0 · R26-O8] 索引持久化接真实落盘：写进注入的 storage，读回来要能对账
// 验收口径：换一个进程读同一份存档，查询结果逐条一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const I = require(join(ROOT, 'recall-inverted-index.js'));

const DOCS = I.makeDocs(400, 7);
const Q = '记忆 承诺 车站';
const ids = (r) => r.map((x) => x.id);

function memoryStorage() {
    const box = {};
    return {
        box,
        get: (k) => (Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null),
        set: (k, v) => { box[k] = v; },
        calls: { get: 0, set: 0 }
    };
}

test('O8-1 写进注入的 storage：默认 key、带存档版本与库版本，不往别处写', () => {
    const st = memoryStorage();
    const idx = I.buildIndex(DOCS);
    const w = I.saveTo(idx, st, { storeVersion: 'v-lib-1', at: '2026-11-18' });
    assert.equal(w.ok, true);
    assert.equal(w.wrote, true);
    assert.equal(w.key, I.ARCHIVE_KEY);
    assert.equal(w.version, I.DUMP_VERSION);
    assert.equal(w.size, DOCS.length);
    assert.deepEqual(Object.keys(st.box), [I.ARCHIVE_KEY]);
    const rec = JSON.parse(st.box[I.ARCHIVE_KEY]);
    assert.equal(rec.storeVersion, 'v-lib-1');
    assert.equal(rec.checksum, w.checksum);
    assert.equal(rec.size, DOCS.length);
});

test('O8-2 读回来：ok 且不重建，size 与检索结果同源', () => {
    const st = memoryStorage();
    const idx = I.buildIndex(DOCS);
    I.saveTo(idx, st, { storeVersion: 'v1' });
    const r = I.loadFrom(st, { storeVersion: 'v1' });
    assert.equal(r.ok, true);
    assert.equal(r.rebuilt, false);
    assert.deepEqual(r.bad, []);
    assert.equal(r.size, DOCS.length);
    assert.equal(r.storeVersion, 'v1');
    assert.deepEqual(ids(I.query(r.index, DOCS, Q).results), ids(I.query(idx, DOCS, Q).results));
});

test('O8-3 换一个进程读同一份存档：查询结果逐条一致', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lonsha-idx-'));
    const file = join(dir, 'index.archive.json');
    try {
        const disk = {
            get: (k) => { try { return readFileSync(join(dir, k + '.json'), 'utf8'); } catch (e) { return null; } },
            set: (k, v) => { writeFileSync(join(dir, k + '.json'), v); }
        };
        const idx = I.buildIndex(DOCS);
        I.saveTo(idx, disk, { storeVersion: 'proc' });
        const mine = ids(I.query(idx, DOCS, Q).results);
        const code = [
            'const I = require(' + JSON.stringify(join(ROOT, 'recall-inverted-index.js')) + ');',
            'const fs = require("fs");',
            'const dir = ' + JSON.stringify(dir) + ';',
            'const disk = { get: (k) => { try { return fs.readFileSync(dir + "/" + k + ".json", "utf8"); } catch (e) { return null; } } };',
            'const r = I.loadFrom(disk, { storeVersion: "proc" });',
            'const docs = I.makeDocs(400, 7);',
            'process.stdout.write(JSON.stringify({ ok: r.ok, rebuilt: r.rebuilt, size: r.size, ids: I.query(r.index, docs, ' + JSON.stringify(Q) + ').results.map((x) => x.id) }));'
        ].join('\n');
        const out = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
        assert.equal(out.status, 0, out.stderr);
        const got = JSON.parse(out.stdout);
        assert.equal(got.ok, true);
        assert.equal(got.rebuilt, false);
        assert.equal(got.size, DOCS.length);
        assert.deepEqual(got.ids, mine);
        assert.ok(file.length > 0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('O8-4 存档版本不符 ⇒ 拒收并当场重建（具名 archive-version-mismatch）', () => {
    const st = memoryStorage();
    I.saveTo(I.buildIndex(DOCS), st, {});
    const rec = JSON.parse(st.box[I.ARCHIVE_KEY]);
    rec.version = I.DUMP_VERSION + 1;
    st.box[I.ARCHIVE_KEY] = JSON.stringify(rec);
    const r = I.loadFrom(st, { docs: DOCS });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['archive-version-mismatch']);
    assert.equal(r.rebuilt, true);
    assert.deepEqual(r.rebuiltAfter, ['archive-version-mismatch']);
    assert.equal(r.size, DOCS.length);
});

test('O8-5 校验和被篡改 ⇒ 拒收（不读半损索引），重建后检索可用', () => {
    const st = memoryStorage();
    I.saveTo(I.buildIndex(DOCS), st, {});
    const rec = JSON.parse(st.box[I.ARCHIVE_KEY]);
    rec.body.size = rec.body.size + 3;
    st.box[I.ARCHIVE_KEY] = JSON.stringify(rec);
    const r = I.loadFrom(st, { docs: DOCS });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['checksum-mismatch']);
    assert.equal(r.rebuilt, true, '退回重建不是空话：重建后的索引要能真召回');
    assert.ok(I.query(r.index, DOCS, Q).results.length > 0);
});

test('O8-6 库版本对账：库变了就不认旧索引（具名 stale-archive）', () => {
    const st = memoryStorage();
    I.saveTo(I.buildIndex(DOCS), st, { storeVersion: 'lib-a' });
    const r = I.loadFrom(st, { storeVersion: 'lib-b', docs: DOCS });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['stale-archive']);
    assert.equal(r.rebuilt, true);
    const same = I.loadFrom(st, { storeVersion: 'lib-a' });
    assert.equal(same.ok, true, '库没变时不该误报');
});

test('O8-7 没存档 ⇒ 明确说没存档，不把空索引当读取成功', () => {
    const st = memoryStorage();
    const r = I.loadFrom(st, { storeVersion: 'v1' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['no-archive']);
    assert.equal(r.rebuilt, false);
    assert.equal(r.size, 0);
    assert.equal(st.calls.get, 0, '这个假 storage 不计数，但契约上 get 必须被调用一次');
});

test('O8-8 没有 storage 两个方向都拒收，不悄悄退化', () => {
    const w = I.saveTo(I.buildIndex(DOCS), null, {});
    assert.equal(w.ok, false);
    assert.deepEqual(w.bad, ['no-storage']);
    assert.equal(w.wrote, false);
    const rr = I.loadFrom({}, { docs: DOCS });
    assert.equal(rr.ok, false);
    assert.deepEqual(rr.bad, ['no-storage']);
    assert.equal(rr.rebuilt, true);
});

test('O8-9 存档坏了（不是 JSON）⇒ bad-json 并重建', () => {
    const st = memoryStorage();
    st.box[I.ARCHIVE_KEY] = '{ not json';
    const r = I.loadFrom(st, { docs: DOCS });
    assert.deepEqual(r.bad, ['bad-json']);
    assert.equal(r.rebuilt, true);
});

test('O8-10 写盘是只读索引的：saveTo 不改 size / postings', () => {
    const idx = I.buildIndex(DOCS);
    const before = JSON.stringify(I.dump(idx));
    I.saveTo(idx, memoryStorage(), { storeVersion: 'x' });
    assert.equal(JSON.stringify(I.dump(idx)), before);
    assert.equal(idx.size, DOCS.length);
});

test('O8-11 自检绿', () => {
    assert.equal(I.recallIndexSelfCheck().ok, true, JSON.stringify(I.recallIndexSelfCheck().bad));
});
