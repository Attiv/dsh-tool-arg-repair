# dsh-tool-arg-repair

DeepSeek Harness（DSH）工具参数兼容插件，修复部分模型遗漏或误写参数导致的 `INVALID_ARGS`，不修改 DSH 核心包。

## 支持的修复

| 工具 | 参数问题 | 处理方式 |
| --- | --- | --- |
| `bash` / `pwsh` | 缺少 `description` | 补充默认描述，保留 `command` 的必填及类型校验 |
| `web_search` | 部分接口在 `queries` 数组签名下返回空参数 | 向模型声明必填的 `query` 字符串，内部转为原工具的 `queries` 数组 |

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

新版生效后，工具参数面板应显示 `query: string` 且 `required: ["query"]`，不再是 `queries` 数组。可用实际安装路径的 `package.json` 确认版本为 `0.1.1`。

## 验证

```sh
npm install
npm test
```

回归测试覆盖别名转换、原参数校验、搜索展示与输出回调、工具注册/更新/清理，以及 `bash` / `pwsh` 的原有修复。测试使用真实 DSH 校验器，不发起联网搜索。

更多兼容条件及 `run_code` 限制见 [完整中文说明](README.zh.md)。
