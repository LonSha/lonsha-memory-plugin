# -*- coding: utf-8 -*-
"""v3.338.0 · 参考基准登记补登（幂等）。

背景：tests/audit/catalog_reference_consumers.tsv 是 v3204 跨仓守卫 P3 的参考基准。
新增测试文件未登记 ⇒ P3 覆盖率缺口（守卫 exit 1）。本脚本将三档漏登档案补上：
  · v3360_m4o9_knowledge_gate.test.mjs   —— HEAD 遗留漏登（前轮 M4-O9 就该登）
  · v3370_m4o7_evidence_protect.test.mjs —— HEAD 遗留漏登（M4-O7）
  · v3380_m4o8_center_actions.test.mjs   —— 本刀新增（M4-O8）
幂等：已在文件内则不改；文件末尾缺换行则补齐。
"""
import io, sys

TSV = 'tests/audit/catalog_reference_consumers.tsv'

ROWS = [
    ('v3360_m4o9_knowledge_gate.test.mjs',
     '第四期 M4-O9(按事实可知性裁剪故事年鉴/玩家版输出)的成对套件(**22 条 test**:含 4 条真源码破坏负控制):A 结构面(内核导出面 28→31 且既有 27 项逐字不动 / SA_VERSION 1→2 / 宿主五个判决口成员各恰一处 / **不建第二份权限表**即无白名单式常量表)+ B 内核闸真跑(逐事实逐时点判决:保留/遮蔽/判不了**三态不同形**)+ C **验收四例真跑**(同角色后揭密 / 匿名秘密(chars 为空不得默认放行) / 旧名伪装 / 已公开未结伏笔(判不了但保留单列 undecidedKept))+ D 生成侧(forPlayer **绝不回退作者版**:未给可知性面/没回顾/整篇裁空 ⇒ ok:false+reason)+ E 宿主真源四面真接通(秘密账本 / 知识轨迹 / 事实版本账 / 实体别名)+ F 零写·零缓存·现算 + 四条真源码破坏负控制(宿主两条+内核两条,各带原版阳性对照)+ H6 工具两向自证 + H5 判据纯度 + G 版本锚。★ 判据翻修留痕(第五版,前四版都是判据错不是实现错):B2 首版把泄漏源放在旧口径从不扫的 open 面;C1/F2 首版用了 secret-ledger find() 不存在的嵌套 ref 形;F3 首版三重错(锚点缩进打偏/内核锚点误拿去破坏宿主文件/判据只比 decision+basis 故拆掉中间判决后兜底同形假绿),修法=锚点全部从源码真行提取、内核破坏走 loadKernel 装载副本、J1/J2 增 why 具名比对。'),
    ('v3370_m4o7_evidence_protect.test.mjs',
     '第四期 M4-O7(长期压缩与遗忘保住不可替代证据)的成对套件(**8 条 test**:含 3 条真源码破坏负控制):A 模块层(memory-gc.js:evidenceScreen 三态 / capByForgetValue 保护与降级 / capSummaries 保护 / orphanOpsOf 保护 / runGc 证据汇总读数)+ B stm-ltm 层(LTM 滚动 salient 前移到存活条目 / 落账 salientCarriedOver / lookupSalient 可回源 / selfReport 计数)+ C 宿主层(index.js 判定器:revoked 不保 / pinned 保 / 文本特征保 + _lastGcEvidence 收账 + getDegradationLedger 并入 overBudget)+ F1/F2/F3 三条真源码破坏负控制(破坏 GC 保护筛 / 破坏滚动转移 / 破坏 revoked 判定,均当场翻红且原版阳性通过)+ G1 H5 判据纯度(三锚点各恰 1 次)+ H1 版本锚 v3.337.0。'),
    ('v3380_m4o8_center_actions.test.mjs',
     '第四期 M4-O8(记忆控制中心处置类动作的生产方落地)的成对套件(**16 条 test**:含 3 条真源码破坏负控制):A 结构面 3 条(宿主六个新出口 + 三个纠错出口在真源各恰一处 / 面板 9 handler 全在场 + 旧手写 state 三形态清零 / 内核声明 9 动作与面板提供面逐字相等)+ B 六个出口真跑 6 条(保存条件真落宿主真源且同条件覆盖 replaced / state 注入为浅拷贝且与真源同步、调用方对象不被反写 / 圈定范围只取范围内未撤回事实 / 未圈范围不退回全量(具名 reason) / 重提取取数口三态不同形(fixture 透传·extractor-absent 具名) / 单条撤回走真写面(幂等 replayed + 不碰 journal + 缺 id 具名))+ C 端到端 2 条(face.saved 与宿主真源同条(零同步缺陷闭合) / row.dispute 如实报不可用(不编假写入))+ F1/F2/F3 三条真源码破坏负控制(各带原版阳性对照:H5 破坏真源同步 / 破坏未圈范围闸 / 破坏保存落笔)+ G1 H5 判据纯度(三锚点在本档各恰 1 次、真源各恰中 1 次)+ H1 自防护 + 当版锚 v3.338.0。'),
]

def main():
    t = io.open(TSV, encoding='utf-8').read()
    if not t.endswith('\n'):
        t += '\n'
        print('补齐末尾换行')
    added, skipped = [], []
    for name, desc in ROWS:
        if name in t:
            skipped.append(name)
            continue
        t += name + '\t\t' + desc + '\n'
        added.append(name)
    io.open(TSV, 'w', encoding='utf-8').write(t)
    print('补登:', len(added), added)
    print('已存在跳过:', len(skipped), skipped)
    # 回读核验
    t2 = io.open(TSV, encoding='utf-8').read()
    rows = [l for l in t2.split('\n') if l.strip() and not l.strip().startswith('#')]
    print('当前登记行数:', len(rows))

if __name__ == '__main__':
    main()
