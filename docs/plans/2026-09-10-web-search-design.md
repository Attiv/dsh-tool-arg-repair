# web_search 参数兼容设计

用户确认：扩展当前 agent scope shadow 机制，在 `queries` 遗漏且提供 `query` / `q` 时转换为原工具接受的数组；正确参数保持不变，没有查询内容仍报错。

- 只覆盖 `web_search`，保留 `bash` / `pwsh` 的现有 description 补全。
- 根据原工具的 queries item schema 决定可支持的转换，不猜测未知的对象结构。
- 同时处理校验层和执行层，避免 required 校验先于修复导致别名无法生效。
- 原定义不变；转换后再次使用原工具 schema 校验，再转交原 execute，保持执行上下文、返回值和错误传播。
- 不补空数组、不截断查询、不覆盖显式 queries，不扩大其他工具的参数接受范围。
- 回归覆盖别名转换、原 schema 约束、无查询/错误类型、注册与卸载。
