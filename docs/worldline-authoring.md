# 世界线口径表（给卡作者 · L12-X8）

> **为什么有这份表**：v3.425.0 把内核主键从「变动率」换成「纪元 = 层标记@切换楼层」，
> v3.426.0 补上「当前纪元自动推进」，v3.429.0 把跳跃表做成结构化编辑器 —— 三版都把**口径**
> 改对了，但作者要落地仍得倒着读三份 CHANGELOG 才知道有哪几个键、哪个键会落盘、五态 `why`
> 各是什么意思。这份表就是那三份的**一次读完版**。
>
> **它不是新真源。** 表里每个读数都能用 `memory-config.js` / `worldline-memory.js` 复算，
> 复算命令写在各节末尾。改口径只能改代码，改完照着重跑一遍这里的命令。

---

## 1. 十一个卡键（全部住在 `memory-config.js`）

复算（**这一条命令就是本节的全部依据**）：

```bash
cd <仓库根>
for k in worldlineMemoryEnabled worldlineId worldlineDivergence worldlineAdjacentPolicy \
         worldlineReaders worldlineConvergences worldlineBands worldlineStartFloor \
         worldlineJumps worldlineLayerAlias worldlineReaderPolicy; do
  printf '%s\t%s\n' "$k" "$(grep -c "$k" memory-config.js)"
done
```

**实测读数（v3.430.0）**：前十个键各 **2** 次（默认值 + 白名单各一处），
`worldlineReaderPolicy` 是 **3** 次 —— 多出来的那一处是**注释里提到自己的键名**
（`* 要让保留者成立，须把下面的 worldlineReaderPolicy 显式改成 allow。`）。
读数不是 2 时先看是不是注释，别急着改代码。

| 键 | 干什么 | 形态 |
| --- | --- | --- |
| `worldlineMemoryEnabled` | 世界线记忆总开关 | `bool` |
| `worldlineId` | 当前线名。**空着就不成纪元**（`why=jump-without-line-id`） | `string` |
| `worldlineDivergence` | 分歧度（**显示口径**，内核不据此判纪元） | `number` |
| `worldlineAdjacentPolicy` | 相邻线之间是否互相可见 | `string` |
| `worldlineReaders` | 哪些角色能读别线的记忆 | `string[]` |
| `worldlineConvergences` | 世界线合流点 | 行表 |
| `worldlineBands` | 层标记的强度带 | 行表 |
| `worldlineStartFloor` | 本线从第几楼起算 | `number` |
| `worldlineJumps` | **跳跃表**：纪元切换的唯一真源 | 行表（见 §2） |
| `worldlineLayerAlias` | 层标记别名（同一层的多个叫法） | `map` |
| `worldlineReaderPolicy` | 读者策略细则，默认 `'none'`（保留者默认不可读） | `string` |

**★ 唯一「不落盘」的那个名字**：`epochAdvance` 是**推导结果**，不是配置 ——
`grep -c epochAdvance memory-config.js` ⇒ **0**。把它写进卡配置不会生效；
它是 `epochAt()` 的输出字段之一。

---

## 2. 跳跃表 `worldlineJumps` 的行语法

一行一个跳点。**解析器只有一个**（`engine-diagnostic-lines.js` 的 `parseJumpsText`），
v3.429.0 起面板与闸读的是**同一段解析**（此前是两套正则，面板说没问题、闸静默丢行）。

```
<楼层>:<层标记>[:<数字编号>]      ← 例如 40:梦境一层
<楼层>=<层标记>[:<数字编号>]      ← '=' 也收（旧卡写法）
# 井号开头是注释行，整行忽略
<空行>                            ← 记为 blank，不报错
```

行内字段：**左半边是消息索引（非负整数，可带小数但会被 `Math.floor` 向下取整）**；
右半边第一段是层标记，第二段是可选的数字编号（`divergence`），
第二段用 `:` `：` `=` 任一分隔都可以。

**四种坏行**（编辑器逐行标红并念出成因，**不是静默丢掉** —— 这是 X2 判据要守的那条）：

| 触发条件 | 成因文案（逐字取自源码） | 结果 |
| --- | --- | --- |
| 整行既无 `:` 也无 `=` | 「缺分隔符（要写成 楼层:层标记，如 40:梦境一层）」 | 整行作废，进 `rejects`（带 1 基行号） |
| 左半边不是数字，或是负数 | 「楼层不是非负数字（左半边是**消息索引**，如 40）」 | 整行作废 |
| 分隔符后面是空 | 「缺层标记（`楼层:` 后面必须写这一层的名字）」 | 整行作废 |
| 层标记本身为空（如 `40::2`） | 「层标记为空（分隔符后面先写名字）」 | 整行作废 |

另有一种**不废行**的提醒：第三列不是数字 ⇒ 进 `warns`，文案
「第三列（数字编号）不是数字，已忽略；该行仍按层标记生效」。

**★ 第一条跳点必须登记在第 1 楼**，否则第 1 楼到首跳之间那段**推不出纪元**（前史缺口）。
`worldlineJumpDraft()` 为此专门回一个 `prehistoryGap: {from, to, count}`——
它是**信息缺失**，不是「安全」：那批条目既不当事实，也不被挡。v3.429.0 起编辑器上有
`↥ 首跳移到第 1 楼` 一键，把这条出路从「文档里一句话」变成可点的动作。

## 3. `epochAt()` 的五态 `why`（作者最需要的一张表）

`worldline-memory.js:439` 的 `epochAt(floor, jumps, opts)` 只回五句话之一。
**五态当五个不同东西读**：

| `why` | 触发条件（源码分支） | 作者该做什么 |
| --- | --- | --- |
| `bad-floor` | `normFloor(floor)` 回 `null`（传进来的楼层不是非负数） | 查调用方，不是查配置 |
| `no-jump-before` | 扫完全表**没有任何跳点的楼层 ≤ 这一楼** | 补一条首跳在第 1 楼（或更早） |
| `jump-without-line-id` | 找到了最近跳点，但它的 `lineId`（或旧字段 `id`）归一化后为空 | 给那一行补层标记 |
| `own-jump` | 最近跳点的楼层**恰好等于**这一楼 | 正常，纪元从这里开始 |
| `carried` | 最近跳点的楼层**小于**这一楼 | 正常，纪元被「带」下来 |

注意三处容易记错的细节（都能在源码里复算）：

1. **只扫楼层 ≤ 本楼**的跳点（`if (jf > f) continue;`）—— 未来的跳跃不属于这一楼；
2. 最近跳点按**楼层最大**取，不是按表里的书写顺序取；
3. `epoch` 的形态是 `epochOf(lineId, floor)` ⇒ **`层标记@楼层`**，例如 `α线@47`。

复算（真装载内核，零宿主）：

```bash
node -e "const W=require('./worldline-memory.js');
const j=[{floor:40,lineId:'β线'},{floor:47,lineId:'α线'}];
for (const f of [0,30,40,50]) console.log(f, JSON.stringify(W.epochAt(f,j)));"
```

## 4. `WM_VERSION` 为什么不是卡键

`worldline-memory.js` 顶部有 `const WM_VERSION = 2;`。它是**内核载荷版本**（判「旧存档要不要迁移」），
**不是作者能配的东西** —— 写进卡配置不改变任何行为。

---

## 5. 一句话记忆法（三版口径压成三行）

1. **纪元 = 层标记@切换楼层**（不是变动率）；
2. **跳跃表是唯一真源**：面板、闸、诊断行读同一段解析；
3. **`why` 看五态**：`own-jump` / `carried` 正常，`no-jump-before` / `jump-without-line-id` 是待办。

---

## ★ 边界（与结论一起读）

- 本表由 **L12-X8** 交付，它证明「十一个键、行语法、五态 `why`、内核版本」四件事有**可复算的书面口径**；
  它**不证明**真浏览器里编辑器的排版观感与真机触摸命中；
- 表里没有一条读数靠手抄：§1 有 for 循环命令、§3 有 node 一行、§4 直接读文件；
- 「一键首跳」的**点击流**需要真 ST 才能验（见 L12-O5 边界），本表只交代它的存在与语义。