# 语音成绩填写助手 — AGENTS.md

## 架构

- 前端: Vite + 纯 HTML/CSS/JS（无框架）, 入口 `index.html` → `src/main.js` → 各模块
- 后端 API: Cloudflare Pages Functions (`functions/api/chat.js`) 代理 LLM 请求, 保护 API_KEY
- 两个独立的 API 后端实现:
  - 开发环境: `vite.config.js` 的 `api-handler` 插件直接处理 `/api/chat` POST
  - 生产/CF 部署: `functions/api/chat.js` 由 Cloudflare Workers 运行时执行

## 开发命令

```bash
npm run dev       # Vite 开发服务器 (端口 5173), 内置 API 处理, 无需额外服务
npm run build     # 构建到 dist/
npm run cf:dev    # wrangler 全栈模拟 (端口 8788), 需先 build
npm run cf:deploy # 部署到 Cloudflare Pages
```

- **日常开发**只用 `npm run dev`, Vite 插件直接处理 `/api/chat` 请求
- 需要完整 Cloudflare 模拟时才用 `npm run cf:dev`

## 环境变量

| 文件 | 用途 | 提交? |
|---|---|---|
| `.env` | Vite 读取 (包括 API_KEY/BASE_URL/MODEL) | 否 (gitignore) |
| `.dev.vars` | `wrangler pages dev` 读取 | 否 (gitignore) |
| `wrangler.toml [vars]` | 生产环境非敏感默认值 (不含 API_KEY) | 是 |

- **API_KEY 永远不要**写入 `wrangler.toml` 或提交到 Git
- 生产环境通过 Cloudflare Dashboard Secrets 或 `wrangler secret put API_KEY` 设置
- `.env.example` 是提交到 Git 的脱敏模板

## 项目结构关键点

```
├── index.html            # Vite 入口 HTML, 仅有结构和模块 script 标签
├── lib/
│   └── llm-api.js        # LLM 请求构建/SSE解析 (vite + CF 共享)
├── src/
│   ├── main.js           # 启动: 导入 style.css, 注册事件, 暴露 window 全局函数
│   ├── state.js          # 集中状态 (State 单例)
│   ├── chat.js           # callLLM() fetch /api/chat + SSE 流式解析
│   ├── parse.js          # doParse() LLM 解析编排 + 数据归一化
│   ├── render.js         # 冲突/缺失检测 + 结果渲染
│   ├── upload.js         # Excel 拖拽/上传 + XLSX 解析
│   ├── export.js         # 填成绩 + 生成 XLSX + ZIP 打包下载
│   ├── ui.js             # goStep / toggleSection / showMsg
│   └── cancelParse.js    # 取消解析 (中断 fetch + 清理定时器)
├── functions/api/chat.js # Cloudflare Functions 后端 (生产部署使用)
└── vite.config.js        # api-handler 插件 + 构建配置
```

## 重要约定

- **无代码注释**: 代码中禁止添加注释, 保持简洁
- **window 全局函数**: 模块通过 `window.fn = fn` 暴露给 HTML onclick 属性
- **提醒/报错**: 中文提示 (alert / 页面消息)
- **UI 文本**: 全部中文 (用户界面 + 用户可见消息)
- **CSS 变量**: 使用 `:root` CSS 自定义属性 (参考 `src/style.css`)
- **无测试/无 lint/无 typecheck**: 项目无测试框架/lint 配置, 修改后运行 `npm run build` 验证

## 依赖

- `xlsx` (SheetJS): 读写 Excel, 使用 `import * as XLSX from 'xlsx'`
- `jszip`: 打包 ZIP 下载, 使用 `import JSZip from 'jszip'`
- `vite` (devDependency): 构建工具

## 部署

```bash
npm run build
wrangler pages deploy dist --project-name=score-fill-skill
```

生产环境需在 Cloudflare Dashboard 设置 `API_KEY` 作为 Secret, `BASE_URL` 和 `MODEL` 可从 `wrangler.toml [vars]` 自动注入。
