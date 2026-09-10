# dsh-tool-arg-repair

DeepSeek Harness 兼容性插件：修复部分模型调用 `bash` / `pwsh` 时遗漏 `description`，以及部分接口不兼容 `web_search` 的 `queries` 数组签名导致的空参数问题。

## web_search 参数兼容

**0.1.1 起，模型可见的参数改为必填 `query` 字符串。** 工具名仍为 `web_search`，多个搜索词分次调用。插件将单条查询转为原工具的数组格式：

```json
{ "query": "DeepSeek Harness" }
```

转换为：

```json
{ "queries": ["DeepSeek Harness"] }
```

执行层仍兼容旧的 `queries` 数组，以及 `{ "q": "DeepSeek Harness" }`、`{ "query": ["DeepSeek", "Harness"] }`；模型新生成的调用应优先使用上面的单条 `query`。

- 仅修改对模型公开的 schema 和调用提示；原工具 schema 中的 `queries` 必填要求继续用于内部校验，不修改原始参数或历史日志。
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

先在实际插件目录安装依赖（尤其是 profile 配置了 `autoInstallPeers: false` 时）：

```sh
cd ~/.dsh/plugins/dsh-tool-arg-repair
npm install --ignore-scripts
```

然后将该目录作为 profile bundle 加入 profile 的 `package.json`。以下示例适用于插件放在 `~/.dsh/plugins/dsh-tool-arg-repair`、profile 位于 `~/.dsh/profiles/web` 的布局：

```json
{
  "dependencies": {
    "dsh-tool-arg-repair": "link:../../plugins/dsh-tool-arg-repair"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-tool-arg-repair"]
    }
  }
}
```

在 profile 目录执行 `pnpm install`，然后完全退出并重新启动 DSH。其他目录布局请调整相对路径；Windows 也可使用指向实际插件目录的 `link:` 路径。

### 更新与确认生效

```sh
cd ~/.dsh/plugins/dsh-tool-arg-repair
git pull --ff-only
npm install --ignore-scripts
git log -1 --oneline
node -p "require('./package.json').version"
```

然后完全退出并重新打开 DSH；macOS 桌面壳应使用 `⌘Q`，仅关闭窗口不会重启后台。确认实际 profile 的 `node_modules/dsh-tool-arg-repair` 指向刚更新的目录，而不是旧的 `file:` 安装副本。

请更新到 **0.1.2**：它还修复了 Cordis effect 清理函数误在注册阶段执行、导致修复工具立即卸载的问题。新请求的工具参数应为 `query: string`、`required: ["query"]`。历史日志中的旧 schema 和错误不会被改写。

### 为什么只更新旧版还可能报错？

对同一接口进行最小对照测试时，`web_search` + `queries` 数组收到原始参数 `{}`，而 `web_search` + `query` 字符串能够收到正确查询。0.1.0 仅做执行前别名转换，无法恢复原始空参数；0.1.1 同时调整模型可见的签名。如果新签名下接口仍返回 `{}`，需要继续检查接口响应，插件不会编造搜索词来掩盖问题。

## 测试

```sh
npm install
npm test
```

测试使用真实的 `@deepseek-ai/dsh-tools` 校验器和 `defineTool`，同时覆盖模拟注册边界与真实 Cordis 单/多 agent scope 生命周期，不发起真实网络搜索。
