# dsh-tool-arg-repair

DeepSeek Harness 兼容性插件：修复部分模型调用 `bash` / `pwsh` 时遗漏 UI 注释字段 `description`，以及调用 `web_search` 时将 `queries` 误写为 `query` / `q` 导致的 `INVALID_ARGS`。

## web_search 参数兼容

缺少 `queries` 且只提供 `query` 或 `q` 之一时，将字符串包装为单元素数组，或将字符串数组改名：

```json
{ "query": "DeepSeek Harness" }
```

转换为：

```json
{ "queries": ["DeepSeek Harness"] }
```

同样支持 `{ "q": "DeepSeek Harness" }` 和 `{ "query": ["DeepSeek", "Harness"] }`。

- 保留原工具 schema 中的 `queries` 必填要求；在原执行函数校验参数之前转换别名，不修改原始参数或历史日志。
- 仅支持原工具声明 `queries` 为字符串数组、且未定义 `query` / `q` 字段的情况；其他 schema 不作猜测转换。
- 显式 `queries` 不覆盖、不纠正；没有查询内容、类型错误，或缺少 `queries` 且同时提供两个别名时仍然报错。
- 原工具继续检查空白查询、空数组及查询数量上限（通常为 1–4 条，取决于 DSH 配置）；不补默认搜索词、不截断查询。
- 转换时移除使用的别名，其余字段保留；原工具的额外字段限制继续生效。

## 安全边界

- 只对 `description` 做默认值补全；搜索参数仅作上述无歧义别名转换。`command`、`code` 仍然必须存在且必须是字符串。
- 复用原工具的执行、沙箱、审批、输出和超时逻辑，不绕过安全策略。
- 通过 agent scope shadow 原工具定义，不修改 `@deepseek-ai/dsh-tools` 核心包。
- 当前版本覆盖 `bash`、`pwsh` 与 `web_search`；`run_code` 通过 PTC 运行时生成，不能安全地在外层 shadow，建议在上游将其 description 改为 optional。

## 安装

将本目录作为 profile bundle 加入 `package.json`：

```json
{
  "dependencies": {
    "dsh-tool-arg-repair": "file:G:/develop/dsh-tool-arg-repair"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-tool-arg-repair"]
    }
  }
}
```

然后重启 DSH。更新插件后也需要重启；如果 profile 使用的是复制安装而非目录链接，请先在 profile 中重新安装更新后的插件。插件不改写历史日志，修复仅影响后续调用。

## 测试

```sh
npm install
npm test
```

测试使用真实的 `@deepseek-ai/dsh-tools` 校验器和 `defineTool`，模拟 agent scope 的注册与生命周期，不发起真实网络搜索。
