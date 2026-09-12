# dsh-tool-arg-repair

DeepSeek Harness（DSH）工具参数兼容插件，修复部分模型遗漏或误写参数导致的 `INVALID_ARGS`，不修改 DSH 核心包。

## 支持的修复

| 工具 | 参数问题 | 处理方式 |
| --- | --- | --- |
| 全部对象参数工具 | 真实参数被包进 `arguments` / `expected` 外层信封（可嵌套） | 拆掉信封后再执行原校验，条件见下 |
| `bash` / `pwsh` | 缺少 `description` | 补充默认描述，保留 `command` 的必填及类型校验 |
| `web_search` | 部分接口在 `queries` 数组签名下返回空参数 | 向模型声明必填的 `query` 字符串，内部转为原工具的 `queries` 数组 |

### 参数信封修复（0.1.3）

部分模型会把已经正确的参数再包一层，导致顶层缺少必填属性而报 `INVALID_ARGS`：

```json
{ "arguments": { "command": "git fetch upstream", "description": "Fetch upstream remote" } }
{ "arguments": { "arguments": { "command": "git fetch upstream" } } }
{ "expected": { "command": "git fetch upstream", "description": "Fetch upstream" } }
```

插件在执行原校验前只拆掉这一层（或连续几层）信封，使上面的调用按 `{ "command": …, "description": … }` 执行。边界：

- **仅在信封是调用里唯一的键时拆封**；同时带有真实顶层参数的调用一律不重写，避免猜测。
- **原参数必须校验失败、拆封后的参数必须校验通过**才会生效。因此声明了 `arguments` 字段的工具不会被误拆，真正缺参数或类型错误的调用仍然报原来的错。
- 覆盖 agent 作用域内**所有对象参数工具**（含 `subagent` / `subagent_fork` 等未在插件内写死名字的工具），非对象参数 schema 与保留的 `run_code` 传输不做改动。
- 拆封与别名转换、`description` 补全组合生效（例如 `{ "arguments": { "query": "…" } }`、`{ "arguments": { "command": "pwd" } }`）。

从 **0.1.1** 起，模型看到并应使用下面的单条搜索签名：

```json
{ "query": "DeepSeek Harness" }
```

插件在原工具校验前将其转换为（多条搜索请分次调用）：

```json
{ "queries": ["DeepSeek Harness"] }
```

执行层仍兼容旧的 `queries` 数组、`q` 字段以及 `query` / `q` 的字符串数组形式。**显式 `queries` 不会被覆盖**；完全没有查询内容、类型错误或缺少 `queries` 且同时提供两个别名时仍报错。原工具的空白查询和数量上限检查继续生效，不伪造搜索词、不截断查询。

0.1.0 只在执行阶段转换别名，无法处理接口已经返回 `{}` 的情况。0.1.1 改变模型可见的参数签名，规避已在对照测试中复现的兼容性问题；若接口仍返回真正的空参数，插件仍会报错，而不是假装搜索成功。

## 安装与更新

将插件加入 DSH profile 的依赖和 `dsh.profile.bundles`，完整配置见 [中文安装文档](README.zh.md#安装)。

已使用本地仓库安装的用户：

1. **在实际安装的插件目录**运行 `git pull --ff-only`，而不是只更新另一份开发仓库。
2. 在该目录运行 `npm install --ignore-scripts`，补齐插件的 peer dependencies。
3. 推荐 profile 使用 `link:` 指向该目录，避免 `file:` 复制安装继续命中旧副本；详见完整文档。
4. 完全退出并重新打开 DSH，再发起新的工具调用。macOS 桌面壳请用 `⌘Q`，只关闭窗口不会停止后台；历史日志不会被改写。

新版生效后，工具参数面板应显示 `query: string` 且 `required: ["query"]`，不再是 `queries` 数组。可用实际安装路径的 `package.json` 确认版本为 **`0.1.4`**。

0.1.2 修复了 Cordis effect 清理函数的注册方式，避免修复工具在注册后立即被卸载，并加入真实 Cordis 单/多 agent 生命周期回归测试。

0.1.3 增加参数信封修复：把模型多包的一层 `arguments` / `expected` 拆掉再校验，并把覆盖范围从写死的三个工具扩展到 agent 作用域内所有对象参数工具（因此 `subagent`、`subagent_fork` 等自动纳入）。

0.1.4 修复 0.1.3 引入的输出渲染递归：通用工具修复先复制 `output` 对象再包装 `render` / `presentationMeta`，不再改写原工具的渲染函数。

## 验证

```sh
npm install
npm test
```

回归测试覆盖参数信封拆封（含嵌套信封、歧义与仍非法输入）、别名转换、原参数校验、搜索展示与输出回调、工具注册/更新/清理，以及 `bash` / `pwsh` 的原有修复。测试使用真实 DSH 校验器与真实 Cordis 作用域，不发起联网搜索。

更多兼容条件及 `run_code` 限制见 [完整中文说明](README.zh.md)。
