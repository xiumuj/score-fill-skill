# 语音成绩填写助手

一个基于 Cloudflare Pages + LLM 的智能成绩填写工具。粘贴语音转文字后的成绩文本，上传 Excel 花名册，AI 自动解析并填入对应学生的成绩。

## 功能

- **智能解析**：通过 LLM 从自由文本中提取学号与分数，支持中文数字、多种格式
- **多班级支持**：一次处理多个班级，自动匹配班级名称
- **冲突检测**：同一学号出现多个不同分数时高亮提示
- **缺失检测**：标记花名册中有但未解析到的学生
- **在线编辑**：解析结果可直接在页面中修改
- **导出下载**：导出为 `.xlsx` 文件，支持一键打包 ZIP 下载
- **流式输出**：实时显示 LLM 解析过程，体验更流畅

## 使用流程

```
Step 1: 粘贴成绩文本 + 上传花名册
               ↓
    LLM 智能解析（实时显示过程）
               ↓
Step 2: 确认/编辑解析结果
               ↓
Step 3: 下载已填成绩的 Excel
```

### 花名册格式要求

Excel 文件需满足以下格式：

| 第一行 | 班级名称文字 |
| 第二行 | 表头（必须包含「学号」或「编号」列） |
| 第三行起 | 数据行 |

示例：

| 学号 | 姓名 |
|------|------|
| 1    | 张三 |
| 2    | 李四 |

## 技术栈

- **前端**：纯 HTML + CSS + JavaScript（无框架，单页应用）
- **后端**：Cloudflare Pages Functions（Edge Worker）
- **LLM 代理**：通过后端转发 API 请求，保护 API Key
- **依赖库**：SheetJS (xlsx)、JSZip（CDN 加载）

## 本地开发

### 前置条件

- Node.js >= 18
- wrangler CLI

### 配置

```bash
# 安装依赖
npm install

# 复制环境变量模板并填写 API_KEY
# 编辑 .dev.vars 文件
```

**.dev.vars** 内容：

```
API_KEY="your-llm-api-key"
BASE_URL="https://open.bigmodel.cn/api/paas/v4"
MODEL="glm-4-flash"
```

### 启动

```bash
wrangler pages dev .
```

## 部署

### Cloudflare Pages 部署

```bash
wrangler pages deploy . --project-name=score-fill-skill
```

### 环境变量（生产环境）

在 Cloudflare Dashboard → Pages → `score-fill-skill` → 设置 → 环境变量 中设置：

| 变量名 | 说明 |
|--------|------|
| `API_KEY` | LLM API Key |
| `BASE_URL` | API 基础地址 |
| `MODEL` | 模型名称（如 glm-4-flash） |

可选方式：

1. Cloudflare Dashboard 手动添加
2. `wrangler secret put API_KEY`
3. GitHub Actions Secrets（推荐）

**注意**：`.dev.vars` 仅用于本地开发，生产环境通过 Cloudflare 环境变量注入。

## 项目结构

```
.
├── index.html          # 主页面（所有前端逻辑）
├── wrangler.toml       # Wrangler 配置
├── .dev.vars           # 本地开发环境变量（已 gitignore）
├── functions/
│   └── api/
│       └── chat.js     # LLM API 代理（Cloudflare Function）
├── src/                # 预留目录
└── node_modules/       # 依赖
```
