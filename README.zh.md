# dsh-tool-arg-repair

DeepSeek Harness 兼容性插件：修复部分模型调用 `bash` / `pwsh` 时遗漏 UI 注释字段 `description` 导致的 `INVALID_ARGS`。

## 安全边界

- 只对 `description` 做默认值补全；`command`、`code` 仍然必须存在且必须是字符串。
- 复用原工具的执行、沙箱、审批、输出和超时逻辑，不绕过安全策略。
- 通过 agent scope shadow 原工具定义，不修改 `@deepseek-ai/dsh-tools` 核心包。
- 当前版本覆盖 `bash` 与 `pwsh`；`run_code` 通过 PTC 运行时生成，不能安全地在外层 shadow，建议在上游将其 description 改为 optional。

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

然后重启 DSH。插件不能修复已写入历史日志的旧错误，只会阻止后续调用再次因缺少 `description` 被拒绝。
