# LonSha 记忆引擎

为 SillyTavern 打造的记忆与账本引擎。核心理念：**「记错了能被发现」** —— 每次写入有出处，每条召回有归因，每个读数能回源到真实计算。

## 快速开始

放入 SillyTavern 的 `third-party extensions` 目录，刷新即可。无需构建，无外部数据库。

```bash
npm test              # 全量测试
npm run test:serial   # 串行模式（排查偶发）
npm run test:audit    # 带审计面
```

## 目录结构

```
lonsha-memory-plugin/
├── index.js              # 主入口
├── manifest.json         # 插件清单（extra_js 133 项 + css 3 项）
├── package.json
├── CHANGELOG.md
├── README.md
├── TODO.md
├── *.js                  # 133 个功能模块（IIFE 零依赖，通过 extra_js 加载）
├── css/                  # 样式文件
├── tests/                # 测试套件 + 审计脚本
├── tools/                # 开发辅助脚本
└── docs/                 # 规划文档与存档
    ├── planning/         # 各期规划
    └── archive/          # 历史报告与参考项目存档
```

## 工程纪律

- **版本四源同源**：index.js / manifest.json / package.json / CHANGELOG.md 由 `scan_version_guard.mjs` 把守
- **文档不得说谎**：TODO.md「最近更新」行必须等于当前版本
- **负控制测试**：每个批次包含真源码破坏负控制，证明破坏可观测
- **历史测试不锁版本**：用 `vnum >= 出生版本` 下界检查，不硬等号

## 版本

当前版本见 `CHANGELOG.md` 顶节。版本以 git tag 发行。

## 许可证

MIT License — Copyright (c) 2026 LonSha