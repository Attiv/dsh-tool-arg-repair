# dsh-tool-arg-repair

DeepSeek Harness（DSH）工具参数兼容插件，修复部分模型遗漏或误写参数导致的 `INVALID_ARGS`，不修改 DSH 核心包。

## 支持的修复

| 工具 | 参数问题 | 处理方式 |
| --- | --- | --- |
| `bash` / `pwsh` | 缺少 `description` | 补充默认描述，保留 `command` 的必填及类型校验 |
| `web_search` | 缺少 `queries`，误传 `query` 或 `q` | 将字符串包装为数组，或将字符串数组改名为 `queries` |

例如，下面的搜索调用可能导致 `Error: invalid arguments: missing required property "queries"`：

```json
{ "query": "DeepSeek Harness" }
```

插件在原工具校验前将其转换为：

```json
{ "queries": ["DeepSeek Harness"] }
```

也支持 `q` 字段，以及 `query` / `q` 的字符串数组形式。**显式 `queries` 不会被覆盖**；完全没有查询内容、类型错误或缺少 `queries` 且同时提供两个别名时仍报错。原工具的空白查询和数量上限检查继续生效，不伪造搜索词、不截断查询。

## 安装与更新

将插件加入 DSH profile 的依赖和 `dsh.profile.bundles`，完整配置见 [中文安装文档](README.zh.md#安装)。

已使用本地仓库安装的用户：

1. 在插件目录运行 `git pull --ff-only`。
2. 如果 profile 使用复制安装而非目录链接，重新安装更新后的插件。
3. 重启 DSH，再发起新的工具调用；历史日志中的旧错误不会被改写。

## 验证

```sh
npm install
npm test
```

回归测试覆盖别名转换、原参数校验、搜索展示与输出回调、工具注册/更新/清理，以及 `bash` / `pwsh` 的原有修复。测试使用真实 DSH 校验器，不发起联网搜索。

更多兼容条件及 `run_code` 限制见 [完整中文说明](README.zh.md)。
