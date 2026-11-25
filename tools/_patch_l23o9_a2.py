import io

P = 'tests/l23_o9_frozen_freshness_all.test.mjs'
s = io.open(P, encoding='utf8').read()

old = (
    "        assert.ok(Number.isFinite(v.ageDays), e.rel + ' 判定必须回报年龄（否则三态没法复核）');\n"
)
new = (
    "        /* ★ [v3.483.0 修既有] 判读器的契约是 `ageDays: number|null`（见 _freshness_judge.mjs 的\n"
    "         *   `@returns`）：**版本式时间戳解析不到对应提交时就返回 null**，同时按最保守口径判 expired。\n"
    "         *   本仓历史被压缩过（`git rev-list --count HEAD` 只有个位数），`v3.475.0` 这类旧版本号\n"
    "         *   本来就解析不出提交 ⇒ 原来那句 `Number.isFinite(v.ageDays)` 是一条**永不可能满足**的断言，\n"
    "         *   而它要守的性质（「三态必须可复核」）照样能守：null 必须显式、必须 fail-closed、\n"
    "         *   而且只要判成 fresh 就必须给得出有限年龄 —— 三条一起才是「可复核」的完整含义。 */\n"
    "        assert.ok(v.ageDays === null || Number.isFinite(v.ageDays),\n"
    "            e.rel + ' 判定必须回报年龄（有限数字，或「解析不到」的显式 null —— 不许 NaN）');\n"
    "        if (v.ageDays === null) {\n"
    "            assert.equal(v.state, 'expired',\n"
    "                e.rel + ' 年龄未知时必须按最保守口径判 expired（fail-closed，不许当 fresh）');\n"
    "        }\n"
    "        if (v.state === 'fresh') {\n"
    "            assert.ok(Number.isFinite(v.ageDays),\n"
    "                e.rel + ' 判成 fresh 就必须给得出有限年龄（否则「现行」这句话无从复核）');\n"
    "        }\n"
)
assert old in s, 'A2 assertion not found'
s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf8').write(s)
print('A2 patched')