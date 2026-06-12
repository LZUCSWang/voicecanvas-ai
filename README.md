# VoiceCanvas AI

VoiceCanvas AI 是一个纯语音控制的 AI 绘图工具。用户通过语音指令完成图形创建、属性修改、撤销、清空和导出等操作，尽量不依赖鼠标或键盘。

项目主体验是语音控制画布对象。基础绘图以图形、文本、箭头等可编辑对象为核心，重点展示语音指令理解、容错、复杂指令拆解和绘图操作执行。

## 当前状态

当前版本已完成 React + TypeScript + Vite 工程脚手架、Vitest 基础测试、绘图 action 模型、SVG 画布渲染和基础状态界面。页面可展示圆形、矩形、三角形、直线、箭头和文本对象，并通过开发辅助输入框触发预置 action 进行本地验证。

当前尚未实现真实语音识别、语音反馈、云端解析、后端能力或导出功能。开发辅助输入框只用于本地测试，不作为正式交互主入口。

## 本地运行

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run test -- --run
npm run build
npm run preview
```

## 当前依赖

- React：前端界面框架。
- React DOM：浏览器端渲染入口。
- TypeScript：类型检查与前端源码编写。
- Vite：本地开发服务器与前端构建工具。
- @vitejs/plugin-react：Vite 的 React 插件。
- Vitest：基础自动化测试。

## 后续规划

以下能力是后续 PR 的计划范围，当前版本尚未实现：

- 语音识别：浏览器 Web Speech API。
- 语音反馈：浏览器 SpeechSynthesis。
- 指令解析：本地规则解析 + ModelScope DeepSeek 云端兜底。
- 后端：Node.js 服务，负责安全调用 ModelScope API。
- 校验：zod action schema。
- 编辑与导出：撤销、重做、删除、清空和图片导出。

## 设计思路

项目采用端云协同方案：

1. 结构化绘图为主：圆形、矩形、线条、箭头、文本等对象由 React 状态驱动，并通过 SVG 渲染。
2. 简单指令优先在浏览器端解析，降低延迟。
3. 对常见识别错词和同义词做本地归一化，例如“园形”“圆”“圈圈”都识别为圆形。
4. 多动作、相对位置、复杂自然语言指令交给 ModelScope DeepSeek 解析为结构化绘图动作。
5. 页面展示浏览器识别到的文本，方便演示和排查。
6. 模拟语音输入仅用于开发和测试，不作为正式交互主入口。

## 依赖与原创性说明

- 第三方依赖：React、React DOM、TypeScript、Vite、@vitejs/plugin-react、Vitest。
- 原创功能部分：当前包含项目脚手架、绘图 action 模型、action executor、SVG 画布渲染、基础状态面板、最近识别文本展示、动作历史和开发辅助预置 action；语音、后端、云端解析和导出将在后续小 PR 中实现。
- 复用代码来源：无。
