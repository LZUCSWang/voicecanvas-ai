# VoiceCanvas AI

VoiceCanvas AI 是一个纯语音控制的 AI 绘图工具。用户通过语音指令完成图形创建、属性修改、撤销、清空和导出等操作，尽量不依赖鼠标或键盘。

项目主体验是语音控制画布对象。基础绘图以图形、文本、箭头等可编辑对象为核心，重点展示语音指令理解、容错、复杂指令拆解和绘图操作执行。

## 当前状态

当前版本已完成 React + TypeScript + Vite 工程脚手架、Vitest 基础测试、绘图 action 模型、SVG 画布渲染、基础状态界面、结构化场景模板、本地中文指令解析、浏览器 Web Speech API 语音识别入口、SpeechSynthesis 语音反馈、对象选择与细粒度画布微调、ModelScope 场景解析后端接口、前端 AI 优先上下文解析、撤销/重做历史，以及 PNG 导出。页面可展示圆形、矩形、三角形、直线、箭头和文本对象，也可通过语音或开发辅助输入框触发 flowchart、mind-map、comparison、architecture、poster 五类完整画面进行验证，并支持对指定对象做移动、缩放、改色、改文字、样式和图层调整；语音识别文本和开发辅助中文命令默认调用 `/api/parse-command`，请求会携带最近对话、当前画布摘要和最近动作，返回的 actions 或 scenePlan 会在前端再次校验后执行。撤销、重做、清空和导出图片属于可靠离线编辑命令，会直接本地执行；后端不可用时，其他基础命令才切换到本地基础兜底。

当前导出优先把当前 SVG 画布转换为 PNG 并下载；如果浏览器阻止 canvas 转换或无法生成 PNG，会自动退回为稳定 SVG 下载，并在系统状态中提示实际格式。开发辅助输入框只用于本地测试，正式交互主入口是语音控制。Chrome 等浏览器可能要求用户点击一次开始按钮授权麦克风；授权后即可通过语音完成绘图创作。

## 本地运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run test -- --run
npm run build
npm run dev:server
npm run preview
```

后端 ModelScope 解析接口单独启动：

```bash
cp .env.example .env
npm run dev:server
```

`.env` 中需要填写 `MODELSCOPE_API_TOKEN`。`MODELSCOPE_MODEL` 可选，默认优先使用 `deepseek-ai/DeepSeek-V3.2`；`MODELSCOPE_FALLBACK_MODELS` 可选，用英文逗号配置备选模型队列；`PORT` 可选，默认 `8787`。后端只在 Node 进程中读取 token，前端不直接持有 ModelScope token。

默认备选模型来自 ModelScope `GET /v1/models` 当前可用于 chat completions 的通用模型，按顺序为：

```text
deepseek-ai/DeepSeek-V4-Flash
Qwen/Qwen3-235B-A22B-Instruct-2507
Qwen/Qwen3-30B-A3B-Instruct-2507
Qwen/Qwen3-Next-80B-A3B-Instruct
moonshotai/Kimi-K2.5
ZhipuAI/GLM-5.1
MiniMax/MiniMax-M3
```

如果优先模型触发每日限额、上游不可用或返回不合法 JSON，后端会继续尝试下一个备选模型。接口响应中的 `model` 表示最终成功或最终失败的模型，`attemptedModels` 表示本次实际尝试过的模型顺序。

解析接口：

```bash
curl -X POST http://localhost:8787/api/parse-command \
  -H "content-type: application/json" \
  -d '{"text":"帮我整理一张登录流程图"}'
```

接口返回两类结构化结果之一：

```json
{ "actions": [{ "type": "update", "target": { "objectType": "arrow", "strategy": "latest" }, "changes": { "translate": { "dx": 24, "dy": 0 } } }] }
```

```json
{ "scenePlan": { "template": "flowchart", "title": "登录流程", "items": ["打开页面", "输入账号", "完成登录"] } }
```

## 当前依赖

- Hono：轻量 Node 后端路由。
- @hono/node-server：Node 环境运行 Hono 服务。
- dotenv：本地后端启动时读取 `.env` 配置。
- React：前端界面框架。
- React DOM：浏览器端渲染入口。
- TypeScript：类型检查与前端源码编写。
- Vite：本地开发服务器与前端构建工具。
- @vitejs/plugin-react：Vite 的 React 插件。
- Vitest：基础自动化测试。
- zod：后端 action schema 与 scenePlan schema 校验。
- tsx：本地运行 TypeScript 后端入口。

## 设计思路

项目采用端云协同方案：

1. 结构化绘图为主：圆形、矩形、线条、箭头、文本等对象由 React 状态驱动，并通过 SVG 渲染。
2. 简单指令优先在浏览器端解析，降低延迟。
3. 对常见识别错词和同义词做本地归一化，例如“园形”“圆”“圈圈”都识别为圆形。
4. 后端通过 ModelScope 多模型队列解析复杂自然语言，返回结构化绘图动作或可控 scenePlan，避免前端直接持有 API token。
5. 页面展示浏览器识别到的文本，方便演示和排查。
6. 可变更画布的绘图动作会进入撤销/重做历史；一句完整场景生成作为一个历史单元，AI 微调 update/delete 也会被记录。
7. 模拟语音输入仅用于开发和测试，不作为正式交互主入口。

## 依赖与原创性说明

- 第三方依赖：React、React DOM、TypeScript、Vite、@vitejs/plugin-react、Vitest、Hono、@hono/node-server、dotenv、zod、tsx。
- 原创功能部分：当前包含项目脚手架、绘图 action 模型、action executor、兼容自定义布局字段、SVG 画布渲染、结构化场景模板、本地中文指令解析、容错词归一化、多动作拆分、场景意图触发、Web Speech API 语音识别 hook、SpeechSynthesis 语音反馈、对象 target selector、相对移动/缩放/尺寸微调、样式/文字/图层更新、指定删除、ModelScope 后端解析 prompt、多模型 fallback 队列、后端 action/scenePlan schema 校验、前端 AI 优先上下文解析、画布/对话/最近动作 payload、前端 actions/scenePlan 安全校验、AI scenePlan 前端模板展开、包含画布和对话版本的内存缓存、AI 不可用后的本地基础兜底、结构化错误处理、语音状态与错误提示、基础状态面板、最近识别文本展示、动作历史、开发辅助预置 action、撤销/重做历史、清空后撤销、AI 微调动作历史记录，以及当前 SVG 画布的 PNG 导出和 SVG 兜底下载。
- 复用代码来源：无。
