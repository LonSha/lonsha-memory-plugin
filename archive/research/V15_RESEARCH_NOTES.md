# v1.5.0 深度研究成果记录

> 用户指令：「再回去看看几个原项目，抄也抄好点」「还有其他的，好好读，好好学，深入研究一下，然后补全我们自己」
> 本文档记录 2026-09-11 深夜研究轮的全部发现与落地情况。

## 一、深入研究过的项目与文件

| 项目 | 深读文件 | 行数 | 收获 |
|---|---|---|---|
| HCDiary | index.js L900-1050（合并prompt）、L2742-2830（注入结构）、L13861（登场捕获） | 2.2万 | 三合一提取prompt、项链式注入、词边界正则 |
| baibai | src/memory/prompts.ts L334-430、inject.ts 全文、engine.ts L375-920 | 9945 | 结构化摘要、私密简报注入、楼层隐藏机制 |
| shujuku | index.js L120034 RRF、L656/L1049 纪要规范 | 19.9万 | RRF融合、客观纪要铁律 |
| yuzuki | config/character-name-matcher.js、plot-summary.js、rerank-client.js、floor-ledger.js | 4万 | 别名管道、时间线归一化、重排序 |
| TriviumDB | README（理念） | - | 三模一体架构思想 |

## 二、抄到的精华（已落地 v1.5.0）

### 1. RRF 倒数排名融合（抄 shujuku L120034）
```
rrfScore(item) = Σ 1/(K + rank + 1)   // K=60，对每路召回求和
```
- 替换了原来的固定权重 hybridMerge（α×vector + β×graph）
- 优点：零调参；多路同时命中的记忆自动胜出
- debugMode 会打印「多路命中 X 项」

### 2. 私密简报注入格式（抄 baibai prompts.ts L73-82）
```
〔记忆系统私密简报｜仅你可见〕...严禁在回复正文中复述...
〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写...
```
- 首尾封口，防止模型把记忆块当正文续写
- 正向引导替代单纯禁令（这是 baibai 作者的巧思）

### 3. 分区注入（抄 HCDiary L2753+）
注入内容分三区：`[前情摘要]` / `[角色关系]` / `[角色日记·近期]`
关系条目带态度图标：`何辞渊 → 程晟：依赖[友好]`

### 4. 登场角色捕获 captureCast（抄 HCDiary L13861）
```js
new RegExp('(?<![\\u4e00-\\u9fa5a-zA-Z])' + escape(name) + '(?![a-zA-Z0-9])')
```
- 词边界正则防止「何辞渊」匹配到「何辞渊明」之类
- 最近 8 楼窗口判定，最多 5 个角色
- 只召回登场角色的图谱/日记，省 token 且更准

### 5. 已知角色名单注入 prompt（抄 HCDiary 合并prompt L958）
提取 prompt 注入 `{{KNOWN_CHARS}}`：主卡角色 + 图谱积累角色
强制 LLM 复用主名，别名归并（resolveCharacterName：互相包含即归并）

### 6. 客观纪要规范（抄 shujuku L1049）
summary 要求：第三方视角、移除修辞、不抒情不升华、结尾开放、禁止总结收尾

### 7. 防编造原则（抄 baibai SUMMARY_PROMPT）
「只提取文本中明确提到的信息，没有的字段不写，禁止编造」

## 三、研究了但暂未落地的（记录备用）

| 机制 | 来源 | 为什么暂缓 |
|---|---|---|
| 楼层隐藏+摘要顶替（is_system=true /hide） | baibai engine.ts L844-920 | 侵入性极强，会修改用户聊天记录；风险大需谨慎设计 UI |
| Rerank 重排序 | yuzuki rerank-client.js | 需要额外 API（SiliconFlow bge-reranker），待用户有需求再加 |
| 批量摘要 token 分摊 | baibai BATCH_SUMMARY_PROMPT | 我们是逐楼提取，暂无批量场景 |
| 楼层账本 floor-ledger | yuzuki | 针对 swipe 分支重放的复杂机制，等出现实际需求 |
| 时间线归一化（剧情内日期推算） | yuzuki plot-summary.js | 需要 LLM 输出剧情内时间，当前 prompt 未要求 |
| 自定义过滤标签对 | HCDiary filterTags | 已内置清洗 SDC/HTML注释，用户有需求再开放配置 |
| 世界书联动 | HCDiary worldbookLink | 依赖 loadWorldInfo API，需真机验证 |

## 四、版本历史补充

- v1.5.0 commit e70e2fa：本研究的全部落地
- 提示词自动迁移：旧配置检测到不含 `{{KNOWN_CHARS}}` 时自动升级

## 五、下一步建议（供下次会话参考）

1. 真机验证 v1.5.0 的提取质量（何辞渊/程晟测试卡）
2. 观察 RRF 融合在真实对话中的召回效果（开 debugMode 看「多路命中」日志）
3. 若摘要仍有照抄原文倾向 → 考虑上 baibai 式结构化字段（time/location/state）
4. 「角色日记」当前是摘要复制品，可考虑抄 HCDiary 第一人称内心日记 prompt（L908-921 的★★★规则）——这是 HCDiary 的灵魂功能，值得单独一轮移植
