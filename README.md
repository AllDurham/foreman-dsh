# Foreman · 工头模式

<p align="center">
  <a href="#许可证"><img alt="license" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="platform" src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.2--rc.1-blue">
  <img alt="topic" src="https://img.shields.io/badge/topic-dsh--plugin-purple">
  <img alt="lanes" src="https://img.shields.io/badge/lanes-delegate%20%7C%7C%20scout-orange">
</p>

<p align="center"><b>贵脑 + 贱手：让云端主脑做编排与验收，让本地模型做执行与阅读。</b></p>

<p align="center">
  English overview below · <a href="#english-overview">jump</a>
</p>

---

## 这是什么

**Foreman（工头模式）** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的一个社区 Agent 预设 + 配套插件。它给标准编码 Agent 增加两条通往本地模型的车道：

| 车道 | 工具 | 谁干活 | 干什么 |
| --- | --- | --- | --- |
| **执行车道** | `delegate_worker` | 本地工人模型 | 按五段简报写代码、跑测试、改文件 |
| **侦察车道** | `scout_worker` | 本地侦察兵模型（物理只读） | 按侦查简报通读代码库，回一张带 `file:line` 引用的"侦查地图" |

云端主模型（贵脑）只做三件事：**判断、拆解、验收**。写与读这两类最烧 token 的活，交给插电就算成本的本地模型。

```
                        ┌─────────────────────────────┐
                        │   云端主脑（编排者）          │
                        │   判断 · 拆解 · 验收          │
                        └──────┬──────────────┬───────┘
                    执行委托（写）│              │ 侦察委托（读）
                 五段简报 · 固定报告 │              │ 侦查简报 · 侦查地图
                        ┌──────┴──────┐  ┌────┴────────┐
                        │ 工人 worker  │  │ 侦察兵 scout │
                        │ 全套工具     │  │ 只读四件套    │
                        └──────┬──────┘  └────┬────────┘
                               └──────┬───────┘
                          本地 llama-server（单实例，串行）
```

## 为什么是"纪律"而不是"接口"

省 token 的敌人不是技术，是两件事：**编排者忍不住亲自下场**，和**工人的自由发挥**。所以 Foreman 的核心是一套可审计的委托纪律，其中两条是硬门槛：

- **决策外显**——写入任何实现文件之前，编排者必须二选一：已发出委托，或在回复正文写明「不委托，理由：…」。会话中断重启后必须先补这条决策。实战中它把"无声脱轨"变成了三种可审计结局：正确委托 / 有理有据的拒绝 /（修复前的）脱轨。
- **独立复验**——报告是工人写的，磁盘才是真相。复验分三层：机械校验命令优先（重跑 = O(1) 成本的全量复验）→ 无校验器才抽样（命中即升级全验）→ 小而关键才精读。

其余纪律：五段简报（目标/涉及文件/接口约定/验收标准/禁止事项）、固定执行报告格式（含 BLOCKED 时的『缺失信息』结构化字段）、简报红旗清单（函数体级细节 / 逐行 diff / 实现篇幅超过验收标准 = 白委托）、**拆分扫描**（拒绝委托前的最后一道工序：把任务切机械核/判断核两栏 ≤10 行，机械核用契约式简报外包、判断核自留，唯一合法拒绝理由 = 拆完没有机械核）、侦查地图四段格式（事实优先、推断标注、未覆盖声明）、失败次数熔断（FAILED ×3 自动回收，BLOCKED 不计次）。

完整纪律文本见 [`preset/skills/foreman-delegation/SKILL.md`](preset/skills/foreman-delegation/SKILL.md)——它同时约束编排者、工人和侦察兵三个身份。

## 实测数据（6 局 A/B，诚实版）

同一提示词、同盘初始状态，唯一变量是预设。机械验收（测试通过数 + 规格冒烟逐格核对 / 行为探针）：

| 配对 | 运行 | 预设 | 编排者 | billable tokens | 交付质量 | 行为 |
| --- | --- | --- | --- | --- | --- | --- |
| task1 | R1 | 标准 | glm-5.2 | 186,763 | 21 tests ✅ | 单干 |
| task1 | R2 | 工头 | glm-5.2 | 490,475 | **24 tests** ✅ | 委托 ×2，工人产出零返工 |
| task2 | R3 | 标准 | deepseek-v4-flash | 367,457 | 38 tests ✅ | 单干（3 次 TPM 限流死亡） |
| task2 | R4 | 工头 | deepseek-v4-flash | **247,243** | 38 tests ✅ | **外显拒委托**，单干 |
| psc（真实项目） | P-STD | 标准 | glm-5.2 | 210,606 | 行为探针全过 ✅ | 单干 |
| psc（真实项目） | P-FM | 工头 | glm-5.2 | **162,753** | 行为探针全过 ✅ | **两次外显拒绝**（侦察 + 委托），纪律开销 ≈ 0 |

四条一阶结论（详见 [docs/experiment-notes.md](docs/experiment-notes.md)）：

1. **成本由三个一阶因子决定**：重启/稳定性税（R2 的 42%）> 编排者思考风格（glm-5.2 单步 2 万 token 的推理）> 简报开销比。委托机制本身在干净运行下开销极小。
2. **边界判据 = 简报开销比，且纪律能自动执行它**：规格钉死、输出密集的任务（task1）委托成功且零返工；判断密集的任务（task2、真实项目）被红线正确弹回单干——"该委托时委托、不该时不委托"双向验证。
3. **账单的 64–78% 是输入 token**，这正是侦察车道存在的理由：让本地模型替脑子读。但侦察只在"读远大于改"的仓库上划算——27 文件的真实项目上它被第二判据（改动占读取大半）正确否决。
4. **glm-5.2 同预设同任务的运行间波动 ≈ 29%**：便宜脑上做小差异 A/B 是噪声里捞针，对比实验要么多对采样、要么换稳定模型。决策外显累计 6 次全部正确（2 委托 + 4 拒绝）。

## 安装

要求：DeepSeek Harness `>= 0.1.2-rc.1`，Windows（`pwsh` 车道默认启用），本地 OpenAI 兼容端点（llama-server 等）。

```text
1. 复制预设
   preset/  →  ~/.dsh/.agent-presets/foreman/

2. 适配两处绝对路径（示例为 admin，改成你的用户名）：
   a) preset/agent.cordis.yml 里 customSkillDirs 的 skills 目录
   b) plugins/foreman-dsh-config/lib/index.js 里的 PRESET_YML 常量

3. 挂载配置插件：在 web profile 的 cordis.patch.yml 加入
   - insert:
     - id: foreman-config
       name: foreman-dsh-config
       config:
         provider: qwen-daily
         model: qwen3.8-daily
         effort: low
   然后把 plugins/foreman-dsh-config 安装到该 profile 能解析到的 node_modules。

4. 在 settings.yaml 里声明本地端点（示例）：
   llm-pi-ai:
     providers:
       qwen-daily:
         api: openai-completions
         baseURL: http://127.0.0.1:11436/v1
         compat: { supportsReasoningEffort: true }
         models:
           - id: qwen3.8-daily
             reasoningEfforts: { low: low, medium: medium, xhigh: xhigh }
         apiKeyEnv: QWEN_DAILY_API_KEY

5. 重启 dsh web，Agent 预设选「Foreman 工头模式」。
```

可选：在设置 → 插件里启用 **subagent 模型选择**并白名单**当前实际在跑的档位**，编排者即可逐次给侦察调用指定 `reasoning_effort`（理解型侦查给 `medium`）。⚠️ 白名单必须镜像现实——llama-server 不校验模型名，白名单里有但没在跑的档会静默降级。

## 设计备忘（写给要改它的人）

- `list_subagent_models` 是固定名单单例：同一个 preset 里**只能有一个** `modelSelectionSettings: true` 的实例，两个并存会让第二个车道静默消失（2026-09-06 实测）。目前 scout 独占该能力。
- `tools.restrict()` 是持久作用域策略，在目录渲染时求值——对**全局注册**的工具可靠；own-scope 的 per-agent 懒安装注册豁免过滤（这是 `subagent` 曾漏进工人目录的原因，现已在 preset 层规避）。
- foreman-config 插件按"文件中第一个 `agentOptions:` 块"回写 UI 配置——**新增车道要放在 delegate 块之后**。
- 验证脚本：`python scripts/validate_preset.py` 可在校验结构后跑一遍（需要 pyyaml）。

## English overview

**Foreman** is a community agent preset + companion plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that adds two lanes to a local worker model (e.g. a 27B model on a 24GB GPU):

- **`delegate_worker`** — execution lane. The cloud orchestrator writes a five-section brief (goal / files / interface contract / mechanically-checkable acceptance criteria / prohibitions); the local worker implements it and reports back in a fixed format with per-acceptance evidence and a structured "missing info" field when blocked.
- **`scout_worker`** — read-only recon lane, enforced by a tool allow-list (read/glob/grep/read_image only). It returns a "recon map" with `file:line` references, conventions, and an uncovered-files declaration, so the expensive brain reads a 1K-token map instead of 100K tokens of repository.

The product is the **discipline**, not the plumbing: explicit delegation decisions before any implementation write, tiered independent verification (mechanical checker → sampling → full read), red-flag heuristics against briefing-through-the-implementation, and a hard 3-strike circuit breaker. A 4-run A/B experiment showed quality holds (all deliverables green) while the boundary between "delegate" and "do it yourself" is correctly detected by the discipline itself.

See the Chinese sections above for full details — the preset file comments are the authoritative design record.

## 许可证

[MIT](LICENSE) · 本项目为社区项目，与 DeepSeek 官方无隶属关系。
