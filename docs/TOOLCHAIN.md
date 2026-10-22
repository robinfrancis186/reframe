# Toolchain check — 22 October 2026

| Engine | Installed / bundled | Verified upstream | Result |
| --- | --- | --- | --- |
| Ponytail | 5.3.2 policy | 5.3.2 | Bundled bytes match current upstream skill exactly |
| Graphify (`graphifyy`) | 0.9.93 | 0.9.93 | Updated from 0.9.34; Codex skill refreshed |
| REA (`rea-agents`) | 6.7.0 | 6.7.0 | Current |
| MCP TypeScript SDK | 1.32.1 | 1.32.1 stable npm tag | Added for real HTTP and stdio protocol support |

Version sources: [Ponytail metadata](https://github.com/DietrichGebert/ponytail/blob/main/.claude-plugin/plugin.json), [Graphify PyPI](https://pypi.org/project/graphifyy/), [REA npm](https://www.npmjs.com/package/rea-agents), [MCP SDK npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk). These are dated checks, not a promise of future automatic updates. `vendor/toolchain.json` records the checked versions; engine status reports actual availability/version. Ponytail policy SHA-256: `9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509`.

Graphify now runs inside Review tools as a real local AST extractor, separately from REA. Choose **Map source graph** to inspect the current component's generated or supplied JS/TS source and download its graph. No LLM calls, source execution, whole-repo scan or private-code recovery occur. Upstream inferred edges retain their metadata. Input is limited to 500 KB; extraction has a 20-second deadline, one concurrent job, a bounded response and temporary files that are removed. External assistants with Build permission can use the same extractor through MCP.

Setup on a new machine: `npm run graphify:setup`. The macOS default interpreter is `~/.local/share/uv/tools/graphifyy/bin/python`; set `GRAPHIFY_PYTHON` if your uv installation uses another location. Restart Reframe after installation. Optional Graphify absence reports setup guidance and does not disable REA or the remaining workbench.

`npm outdated` also found newer major build-tool versions (Node 26, TypeScript 7, Vite 8 and Lucide 1). These remain on their existing pins; broad major migrations were not needed for this feature and require separate compatibility validation. Babel's npm stable tag is 7.x while this project uses an existing 8.x line; no downgrade was applied. The current dependency audit reports no known vulnerabilities.
