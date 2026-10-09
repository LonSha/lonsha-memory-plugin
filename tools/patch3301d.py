#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3301d.py — M-O2 第二刀收尾：修一个「already-live 时丢掉传入的新配置实例」的窄缺陷。

【本补丁修什么（真缺陷，不是整洁性偏好）】
  `rebuildComponents(newConfig)` 在「体检发现 0 个空退路」时直接给 why='already-live' 并返回，
  **完全不看 newConfig** —— 而 init() 每次都会新造一份 configMgr 传进来。
  于是只要出现「init 跑第二次」或「模块比构造更早到场」的次序，就会发生：
    · plugin.configMgr 是第二份真配置实例；
    · engine.config 仍是第一份；
    · 设置面板读 engine.config、保存路径可能写 this.configMgr ⇒ **UI 与保存面各持一份**，
      表现与「设置保存了但读不回」同族（本刀的 M-O1 上游）。
  修法：already-live 分支里若传入了**不同实例**的新配置，就装上它，并把这件事记进读数
  （`configSwapped: true`）—— 不重新装配（成员已经是真实现，重装是白做工且徒增丢数据风险）。

【替换锚点（各恰中 1 次；先全部校验，后统一写盘）】
"""
import io
import sys

PATH = 'index.js'

OLD = """                read.before = this._componentProbe();
                if (read.before.absent === 0) {
                    read.why = 'already-live';   // \u6a21\u5757\u63d0\u524d\u5728\u573a\uff08\u5224\u636e\u5939\u5177 / \u70ed\u66f4\u65b0\uff09\u21d2 \u65e0\u9700\u91cd\u5efa
                } else {"""

NEW = """                read.before = this._componentProbe();
                if (read.before.absent === 0) {
                    read.why = 'already-live';   // \u6a21\u5757\u63d0\u524d\u5728\u573a\uff08\u5224\u636e\u5939\u5177 / \u70ed\u66f4\u65b0\uff09\u21d2 \u65e0\u9700\u91cd\u5efa
                    /* [v3.301.0] \u5df2\u5168\u771f\u65f6\u4e0d\u91cd\u88c5\uff0c\u4f46**\u4f20\u5165\u7684\u65b0\u914d\u7f6e\u5b9e\u4f8b\u5fc5\u987b\u88c5\u4e0a**\uff1a
                     *   init() \u6bcf\u6b21\u90fd\u4f1a\u65b0\u9020\u4e00\u4efd configMgr \u4f20\u8fdb\u6765\uff0c\u82e5\u56e0\u4e3a\u201c\u5df2\u5168\u771f\u201d\u5c31\u4e22\u6389\u5b83\uff0c
                     *   \u4f1a\u51fa\u73b0 plugin.configMgr \u4e0e engine.config \u5404\u6301\u4e00\u4efd\u7684\u5206\u88c2\uff08\u9762\u677f\u8bfb\u4e00\u4efd\u3001\u4fdd\u5b58\u53e6\u4e00\u4efd\uff09\u3002 */
                    if (newConfig !== undefined && newConfig !== null && newConfig !== this.config) {
                        this.config = newConfig;
                        read.configSwapped = true;
                    }
                } else {"""


def main():
    src = io.open(PATH, encoding='utf-8').read()
    n = src.count(OLD)
    if n != 1:
        print('[FAIL] \u951a\u70b9\u547d\u4e2d %d \u6b21\uff08\u8981\u6c42\u6070\u597d 1 \u6b21\uff09' % n)
        return 2
    src = src.replace(OLD, NEW)
    io.open(PATH, 'w', encoding='utf-8').write(src)
    print('[OK] rebuildComponents: already-live \u65f6\u88c5\u4e0a\u4f20\u5165\u7684\u65b0\u914d\u7f6e\u5b9e\u4f8b')
    return 0


if __name__ == '__main__':
    sys.exit(main())