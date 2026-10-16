#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""[v3.339.0 M4-X1 2nd] host wiring: manual override faces + mapping confirm + apply + ledger persistence."""
import sys, io

IDX = 'index.js'

A_TAIL = "            } catch (e) { errLog(e, 'plugin.loreImportLine'); return '\u2014(\u8bca\u65ad\u5f02\u5e38)'; }\n        }"
A_EXPORT = "                prequel: this.prequel ? this.prequel.export() : { text: '' },   // [v3.87] \u524d\u60c5\u8d44\u6599\u968f\u804a\u5929\u6301\u4e45\u5316"
A_RESTORE = "            _imp('prequel', !!engine.prequel, () => engine.prequel.import(data.prequel));"

NEW_FACES = A_TAIL + open('tools/_faces3390b.txt', encoding='utf-8').read()
NEW_EXPORT = A_EXPORT + "\n                loreImportLedger: this._loreImportLedger || null,   // [v3.339.0 \u00b7 M4-X1] \u8d44\u6599\u5bfc\u5165\u8d26"
NEW_RESTORE = A_RESTORE + "\n            _imp('loreImportLedger', true, () => { if (data.loreImportLedger) engine._loreImportLedger = data.loreImportLedger; });"


def main():
    src = io.open(IDX, encoding='utf-8').read()
    hits = {}
    for name, anchor in [('tail', A_TAIL), ('export', A_EXPORT), ('restore', A_RESTORE)]:
        n = src.count(anchor)
        hits[name] = n
        if n != 1:
            print('ANCHOR FAIL %s: %d' % (name, n))
            return 1
    out = src.replace(A_TAIL, NEW_FACES, 1)
    out = out.replace(A_EXPORT, NEW_EXPORT, 1)
    out = out.replace(A_RESTORE, NEW_RESTORE, 1)
    io.open(IDX, 'w', encoding='utf-8').write(out)
    print('hits:', hits)
    print('index.js patched: %d -> %d chars' % (len(src), len(out)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
