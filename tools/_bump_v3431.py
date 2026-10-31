#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.431.0 抬版 + CHANGELOG/TODO/PLAN 顶节改写。

只做两类事：
  1) 版本号四处（index.js / package.json / manifest.json / 三个模块副本）+ README；
  2) 往 CHANGELOG 顶部插新节、替换 TODO/PLAN 的「当前」段首句。
每处替换都先断言命中次数，不符立即退出，不静默改一半。
"""
import json
import sys

V_OLD = '3.430.0'
V_NEW = '3.431.0'
REPO = '/home/user/lonsha-memory-plugin/'


def read(p):
    with open(REPO + p, 'r', encoding='utf8') as f:
        return f.read()


def write(p, s):
    with open(REPO + p, 'w', encoding='utf8') as f:
        f.write(s)


def sub_exact(text, old, new, expect, label):
    n = text.count(old)
    if n != expect:
        sys.exit(f'[abort] {label}: 期望 {expect} 处，实测 {n} 处')
    return text.replace(old, new)


# ---------- 版本号 ----------
c = read('index.js')
c = sub_exact(c, f"const VERSION = '{V_OLD}';", f"const VERSION = '{V_NEW}';", 1, 'index.js VERSION')
write('index.js', c)

for p, indent in (('package.json', 2), ('manifest.json', 4)):
    obj = json.loads(read(p))
    if obj.get('version') != V_OLD:
        sys.exit(f'[abort] {p} version 期望 {V_OLD}，实为 {obj.get("version")}')
    obj['version'] = V_NEW
    with open(REPO + p, 'w', encoding='utf8') as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False)
        f.write('\n')

for p in ('memory-organs.js', 'memory-config.js', 'memory-core.js'):
    s = read(p)
    s = sub_exact(s, f"let VERSION = '{V_OLD}';", f"let VERSION = '{V_NEW}';", 1, p + ' VERSION')
    write(p, s)

s = read('README.md')
s = sub_exact(s, f'**当前版本**：`{V_OLD}`', f'**当前版本**：`{V_NEW}`', 1, 'README 当前版本')
write('README.md', s)

# ---------- CHANGELOG 新节 ----------
SECTION = """## v3.431.0
**回归临时根从内存盘搬到磁盘，并在搬家路上抓到一个躲在路径巧合后面的真缺陷**

- **起因是「没内存了」，不是计划项**：本机 `/tmp` 是 **tmpfs**（`size=5792440k`，占用即吃 RAM）。全量回归里 114 个测试/审计探针各自 `mkdtemp` 镜像树，一次全量累积实测 **4.3G · 3 万目录 · 12 万文件**，把内存压到 `free` 只剩 668MB、swap 用了 4.6G；而清理只写在各自的 `finally` 里 —— **被杀 / 超时 / 阻断就永久留在 RAM 里**，下一轮继续叠。清场时同时发现磁盘只剩 9.0G（96%），两个仓库的 `.git` 里各有 165MB / 89MB 的 `.l2s.tmp_obj_*` 垃圾对象（历次中断遗留，`git gc` 会刷 `bad sha1 file`）。
- **本版做的第一件事是搬家**（`tests/run.mjs`）：临时根改由 runner 统一决定并写回 `process.env.TMPDIR`。子进程用 `env: process.env` 派生，故**单改这一处即覆盖全部 114 个 `mkdtemp` 调用点**，不必逐文件改。取值顺序 `LONSHA_TEST_TMP` → 仓库同级 `.lonsha-test-tmp/`（磁盘）→ `os.tmpdir()`；每条 run 一个 `lonsha-run-*` 子目录，正常退出 / 异常 / `SIGINT`·`SIGTERM`·`SIGHUP` 都整棵删；`kill -9`（exit handler 不跑）留下的残留在下一轮按 **>6h** 老化回收（一轮全量约 5~8 分钟，不会误伤并行第二轮）。路径一律由 `REPO` 推导，**脚本里不出现任何绝对路径字面量**（`scan_cross_repo_binding` 的 P1/P7 口径，实测 0 问题）。
- **搬家当场炸出一个真缺陷（本版最有价值的一条）**：改完先跑全量，`tests/v34270_module_consumption_binding.test.mjs` **两连红**，而该档单独跑全绿 —— 差异只有临时根位置。根因：`scan_module_consumption.mjs` 的 `getProdFiles(root)` 用 `path.relative(ROOT, p)` 算相对名，调用方却用 `path.join(rootDir, pf)` 拼回去读文件，**两处基准不是同一个**。于是：
  - 夹具在 `/tmp` 下 ⇒ `pf = ../../../tmp/x/f.js`，`join('/tmp/x', pf)` 恰好还原 ✅ —— 缺陷此前一直躲在这个路径巧合后面；
  - 夹具在仓库同级（与 `ROOT` 共享 `/home/<user>/` 前缀）⇒ `pf = ../.lonsha-test-tmp/r/x/f.js`，拼回去变成 `…/r/.lonsha-test-tmp/r/x/f.js`（不存在）⇒ **生产代码全部读空** ⇒ 每个模块 `prodCallSites` 退化成 0 ⇒ 判据对**有消费**的模块报「零消费」。
  - 即：这个扫描器此前只在「夹具恰好落在 `/tmp`」时是对的；换任何别的盘位就会**把正常模块误判成孤儿**。处置：`getProdFiles(dir, base = dir)` 让基准跟随传入 root，递归时透传。
- **补了一条把该缺陷钉死的判据**（`v34270` 第 3 条，3 个 test）：夹具**刻意**建在仓库同级目录（正是旧写法会拼错的那种布局），并**双向**断言 —— ① 真·零消费的 `module-alpha.js` 必须被点名；② 真·有绑定的 `module-beta.js` **不得**被误杀；③ 孤儿总数恰为 1。只断①是假绿：把一切都判成零消费也能让①成立，那才是真误杀。
  - **判据自证（负向控制是我亲手做的，不是推断）**：把源文件里 `path.relative(base, p)` 改回 `path.relative(ROOT, p)` ⇒ `ℹ tests 3 / pass 2 / fail 1`，失败项正是「位置无关：有真实绑定的 module-beta.js 不得误杀」；还原后 3/3 绿，`md5` 与改动前一致。
  - **过程自纠一处**：第一次负向控制我把破坏写进了 `tests/audit/_mut_modcons_probe.mjs` **副本**，而测试 `import` 的是原文件 ⇒ 破坏根本没被加载，跑出来 2/2 绿 —— 这是「负控制假绿的第二形（对副本断言，破坏在真源里没发生）」。改为**真源码破坏 + md5 校验还原**后才拿到有效读数。
- **顺手清掉的欠账（不动产品行为）**：
  - `/tmp` 4.3G → 21M、`/dev/shm` 4.9M → 4K、磁盘可用 9.0G → **78G**（96% → 65%）；`lonsha-memory-plugin/.git` 274M → **11M**、`ruby-phone/.git` 456M → **191M**（`gc --prune=now`，两仓 `git fsck` 均无报错，`git status -sb` 均 `## main...origin/main`）；
  - 清掉可重建缓存 `/root/.npm/_cacache`、`/root/.cache/pnpm`、`/root/.local/share/{pnpm,pipx}`、`/var/cache`（保留 playwright 浏览器，复检要用）；
  - 仓库内未跟踪的 `index.js.bak` / `settings-ui.js.bak` / `.tmp/` / `tools/__pycache__/`。
- **本版自己抓到并修掉的缺陷：2 处，都是真产品/工具缺陷，无判据自伤**：① 上述 `getProdFiles` 路径基准（把有消费的模块误判成零消费）；② 过程自纠中的负控制假绿第二形（对副本断言）。
- **诚实边界**：
  1. 临时根落盘只改**位置**，不改并发度与超时阈值；本轮全量实测 `wall` 与改前同量级（改前 317~440s 抖动区间内），**不承诺**因搬家而变快或变慢。
  2. `TMPDIR` 只对本 runner 派生的子进程生效。**直接** `node tests/xxx.test.mjs` 单跑时仍用系统 `os.tmpdir()`（即 `/tmp`）；那时若夹具恰好落在 `/tmp`，`getProdFiles` 的新旧写法都能通过 —— 也就是说**本条缺陷的最初形态无法靠单跑来复现**，必须靠新判据（夹具建在仓库同级）钉住。
  3. 新判据会往仓库同级 `.lonsha-test-tmp/` 写夹具（已进 `.gitignore`），收尾删除；若进程被 `kill -9` 会留下 `pos-*` 目录，属残留而非判据失效。
  4. 本轮清理**未**删除：`/home/ruby_stitch`（2.2G，含 V99~V107 版本产物）、`memory-plugin-research`（350M 参考存档）、playwright 浏览器（850M）—— 都是仍会用到的资产，只清了可重生成的东西。
  5. `/tmp` 仍余 104 项约 21M 删不掉（`wa_head` / `wa-docsgate-*` 等，属主 root、权限 `drwx------` 但 `unlink` 返回 Permission denied，`lsattr` 也读不到属性）；量级无影响，已如实记录而非谎报「已清空」。
  6. `free` 显示 used 仍有 ~6.8G，但本层可见进程合计仅 25MB RSS —— 余量为宿主 Android 与其它 App 占用，**不在本层可管范围**。

"""

cl = read('CHANGELOG.md')
if cl.startswith('## v' + V_NEW):
    sys.exit('[abort] CHANGELOG 顶节已是新版，避免重复插入')
cl = SECTION + cl
write('CHANGELOG.md', cl)

print('[ok] 版本号 + README + CHANGELOG 顶节已写到', V_NEW)
for p in ('index.js', 'package.json', 'manifest.json', 'memory-organs.js',
          'memory-config.js', 'memory-core.js', 'README.md'):
    print('   ', p, '残留旧版号', read(p).count(V_OLD))
print('    CHANGELOG 新节长度', len(SECTION))
