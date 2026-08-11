# RelayBench CN · 模型验真台

一个本地优先的中文 LLM/Codex 对比评测工具。它用同一组客观任务，同时比较官方 Codex、本机当前供应商与 OpenAI-compatible API，记录质量、稳定性、耗时和 Token 使用。

![模型验真台界面](docs/assets/overview.png)

## 为什么做这个项目

第三方模型中转或低价 API 往往只展示模型名称，但名称、自我描述和响应头都可能被改写。RelayBench CN 不尝试“证明模型身份证”，而是用可重复任务回答更实际的问题：

- 同一任务能否稳定完成？
- 隐藏代码测试能否通过？
- 医疗文本中的来源边界是否被混淆？
- 质量、速度与 Token 消耗是否存在持续差异？

## 当前能力

- 官方 Codex 与当前本机供应商并行运行，无需来回切换 CC Switch
- 支持 Responses API 与 Chat Completions API
- 每项可运行 1 次或 3 次，显示通过次数、稳定率与得分波动
- 响应题合并请求，减少重复调用开销
- 代码任务在临时隔离目录执行，不接触用户真实项目
- Markdown 与 JSON 报告导出，API Key 不进入报告或项目文件

### 重复运行结果示例

![重复运行结果示例](docs/assets/results-sample.png)

> 上图为界面展示用模拟数据，用于说明稳定率和波动展示方式，不是真实供应商评测结论。

## 评测任务

| 类型 | 当前任务 | 核心检查 |
|---|---|---|
| 响应 | 精确计算 | 正确性与格式约束 |
| 响应 | 结构化输出 | 严格 JSON 与字段准确性 |
| 响应 | 指令遵循 | 行数、顺序与禁止附加解释 |
| 响应 | 长文本找回 | 较长上下文中的精确信息提取 |
| 响应 | 来源边界判断 | 合成医疗文本中的既往/本次事实区分 |
| 代码 | 真实代码修复 | 边界条件与隐藏测试 |
| 代码 | 事件时间线归一化 | 去重、日期校验、稳定排序与输入不可变性 |

医疗测试仅使用完全合成资料，不包含患者数据，也不用于诊断或治疗决策。

## 工作方式

```mermaid
flowchart LR
  A[选择同一组任务] --> B1[官方 Codex]
  A --> B2[当前本机供应商]
  A --> B3[自定义 API]
  B1 --> C[确定性评分与隐藏测试]
  B2 --> C
  B3 --> C
  C --> D[质量·稳定性·耗时·Token]
  D --> E[Markdown / JSON 报告]
```

## 快速开始

要求：Node.js 22+。官方 Codex 和本机供应商对比目前以 macOS 为主要运行环境。

```bash
git clone https://github.com/longjianw/relaybench-cn.git
cd relaybench-cn
npm install
npm run build
npm start
```

打开 `http://127.0.0.1:8787`。

开发模式：

```bash
npm run dev
```

### 安装 Mac 启动应用

```bash
npm run app:install
```

执行后，桌面会出现 `模型验真台.app`。双击即可启动本机服务并打开固定地址 `http://127.0.0.1:8790`。

停止后台服务：

```bash
npm run app:stop
```

## 验证

```bash
npm run typecheck
npm test
npm run build
```

当前自动测试覆盖评分器、重复运行聚合与“偶发失败不能被高平均分掩盖”的统计规则。

## 安全与边界

- 自定义 API Key 只参与当前请求，不写入源码、配置文件或导出报告
- 本机供应商信息在运行时读取，不进入仓库
- 代码任务使用一次性临时目录，完成后删除
- 结果只能说明指定任务上的表现，不能作为模型身份的密码学证明
- 当前不是生产级模型治理平台，也没有宣称临床有效性

安全说明见 [SECURITY.md](SECURITY.md)，评测设计见 [docs/benchmark-design.md](docs/benchmark-design.md)。

## 开发方式与贡献说明

本项目由龙建伟从真实的第三方模型使用需求出发，提出产品问题、评测指标、医疗安全场景和验收方向；代码实现与迭代在 AI 编程工具协助下完成。项目不把“使用 AI 开发”包装成独立手写全部代码，重点展示的是问题定义、评测设计、产品判断与可验证交付。

## 路线图

- 完成受控的 3 次真实供应商对照
- 增加模型替换、提示词注入与异常响应检测
- 接入可扩展评测集与本地历史趋势
- 发布可下载的 Mac 版本与不调用真实模型的在线展示页

## 维护与学习

第一次维护 GitHub 项目可阅读 [docs/GITHUB_GUIDE_ZH.md](docs/GITHUB_GUIDE_ZH.md)。

## License

[MIT](LICENSE)
