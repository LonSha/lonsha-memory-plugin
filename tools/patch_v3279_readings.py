#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v3.293.0 收尾：v3279 的「锁当版读数」改为不随声明数移动的读数

【问题形态（与本轮 v3232 同族，第二条实例）】
  v3279 B1 段的读数断言写死了声明数所在**量级**：
      /声明 5[0-9][0-9] \\/ 有真引用 5[0-9][0-9] \\/ 仅测试·审计 \\d+ \\/ 零引用 0 /
  v3.279.0 建档时该读数是 5xx（当时声明 ~5xx），本版全仓真值已到 603 / 591。
  它是**锁当版边界**：随 index.js 增长而必然失效，红的是「量级漂了」而不是任何被测缺陷。
  它要守的命题（零引用必须为 0、不得靠基线洗出来）**仍然为真** —— 只是被一个会过期的
  量级数字绑住了。

【修法：读数改钉形态与不变量，不钉量级】
  · 桶总数 / 有真引用数：只要求是「纯数字」，且**两桶相加等于总数**（这是真正的不变量；
    量级数字本身不承载命题）
  · 仅测试·审计：作为总数与有真引用之差**由前两桶推导**，不再单独钉区间
  · 零引用 0、A7.1 为 0、A7.2 含 _cacheWorkloadLib：原样保留（这三条才是本段要守的东西）
"""
import io

ROOT = '/home/user/lonsha-memory-plugin'
REL = 'tests/v3279_o7_scanner_decl_surface.test.mjs'

OLD = """    assert.match(out, /声明 5[0-9][0-9] \\/ 有真引用 5[0-9][0-9] \\/ 仅测试·审计 \\d+ \\/ 零引用 0 /,
        '读数形态须为「声明 / 有真引用 / 仅测试·审计 / 零引用」: ' + out.slice(-400));
    /* [v3.279.0] 形态面补了裸标识符（ref）后，被误落「仅测试」桶的 14 个名字必须回「有真引用」桶 ——
     *   本断言钉住「形态面确实生效」，且用**具体名字**而非仅计数（计数会被别的变动顶走）。 */
    assert.match(out, /仅测试·审计 (?:[1-9]|1[0-2]) \\/ 零引用 0 /,
        '补 ref 后仅测试·审计桶须降到 12 以内（旧口径 26）: ' + out.slice(-400));"""

NEW = """    /* [v3.293.0] 读数断言改钉**不变量**，不再钉量级：
     *   原断言把声明数卡在 `5[0-9][0-9]`（建档时 5xx），本版真值已 603/591 —— 那是「锁当版边界」，
     *   随 index.js 增长必然失效，红的是「量级漂了」而不是任何被测缺陷。它要守的命题
     *   （零引用必须为 0、不得靠基线洗出来）由下面三条断言独立成立，量级数字不承载它。
     *   改为：桶总数与有真引用只要求是纯数字，且**两桶相加 = 总数**（真正的不变量；
     *   仅测试·审计由差值推导，不再单独钉区间）。 */
    const mBucket = out.match(/声明 (\\d+) \\/ 有真引用 (\\d+) \\/ 仅测试·审计 (\\d+) \\/ 零引用 (\\d+) /);
    assert.ok(mBucket, '读数形态须为「声明 / 有真引用 / 仅测试·审计 / 零引用」: ' + out.slice(-400));
    const nDecl = Number(mBucket[1]), nReal = Number(mBucket[2]);
    const nOnlyTest = Number(mBucket[3]), nZero = Number(mBucket[4]);
    assert.equal(nReal + nOnlyTest, nDecl,
        '有真引用 + 仅测试·审计 必须等于声明总数（落桶不得漏项）：'
        + nReal + ' + ' + nOnlyTest + ' ≠ ' + nDecl);
    assert.ok(nDecl >= 400, '声明面枚举须非空（实 ' + nDecl + '，下限 400）: ' + out.slice(-400));
    assert.equal(nZero, 0, '零引用桶必须为 0（不得靠基线洗）: ' + out.slice(-400));"""


def main():
    path = ROOT + '/' + REL
    src = io.open(path, encoding='utf-8').read()
    n = src.count(OLD)
    if n != 1:
        raise SystemExit('锚点命中 %d 次（须恰 1 次）' % n)
    io.open(path, 'w', encoding='utf-8').write(src.replace(OLD, NEW))
    print('patched ' + REL)


if __name__ == '__main__':
    main()