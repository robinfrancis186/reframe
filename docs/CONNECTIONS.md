# Connect assistants through MCP

## Built-in OpenAI host

Open **Connections → OpenAI · local MCP host**. With `OPENAI_API_KEY` configured on the server, describe a public URL (or supply HTML) and the intended behavior, then choose **Run with OpenAI**. The model chooses capture, optional region picking, inspection, build and save calls. The local host dispatches them through the official MCP SDK over the same authenticated HTTP endpoint used by external clients. This is a local Responses API function-tool host backed by MCP, not a cloud MCP server that can reach localhost.

Each run gets a scoped, temporary MCP credential, revoked on completion, cancellation or provider failure. The key stays on the server. Source packages stay local; the model gets bounded captured HTML, inspected controls and short artifact references. Runs allow twelve tool calls, three minutes, one concurrent host run and a sixty-second limit per provider request. Errors are visible with no silent fallback. Already saved results survive cancellation.

Grouped captures can be narrowed with `pick_component` before inspection. Its selector must match exactly one existing element; it does not accept replacement HTML as a selected region. Picked items preserve their source URL and gain a distinct identity.

The host authors supported record, search, toggle, counter, navigation, details, reset and account actions. The canonical compiler validates every control ID and supplies shared frontend/API/storage code. Arbitrary private backend behavior, payment workflows, unsupported choice models and invented provider integrations are not inferred. External API contracts still require explicit setup in the existing feature builder. The host cannot install into a project: review/import from the shared clipboard and use **Projects** for fit, source review, apply and guarded undo.

Live verification on 22 October captured the public W3Schools newsletter form, built a local signup queue, saved/imported its complete package, installed it as `ReframeOpenAINewsletter` in Haven, rejected an empty submission, and persisted a valid signup across reload. No email was sent. The original source has a text-type email input; this capture retains it and validates required fields, not email syntax.

## External clients

Open **Connections** in Reframe. Name the assistant and select only the permissions it needs. The credential is returned once, held in the page's memory, and saved on disk only as a SHA-256 hash. Copy or download the generated configuration into your local MCP client. No OpenAI/xAI provider key is needed to call these tools.

## Transports

- **Local HTTP:** `http://127.0.0.1:5173/mcp` using Streamable HTTP and `Authorization: Bearer <connection token>`. The official SDK negotiates the protocol. Requests use stateless JSON responses; GET/SSE streams are not supported. A client must send the protocol's Accept headers.
- **stdio:** use the generated `mcpServers.reframe` entry. It starts the pinned Node runtime with the absolute `server/mcp-stdio.js` path, `REFRAME_PORT`, and `REFRAME_MCP_TOKEN`. The bridge forwards to the running loopback workbench. Only MCP messages appear on stdout. Reframe must already be running.

The configuration contains a connection credential. Keep it private. Finish by hiding the credential in the UI; it cannot be retrieved later. Revoke an old connection and create another if its credential is lost. Revocation rejects subsequent requests, including through already running stdio bridges; an in-flight operation may finish.

OpenAI/ChatGPT, Dots, Grok Bot, Cursor and other assistants can use this **when their client supports local MCP or a supported secure local bridge**. Names are examples, not automatic account integrations or a claim of testing every third-party product. Remote APIs cannot reach localhost directly. Do not expose this local project-editing server through a public reverse proxy to work around that limitation. OpenAI documents remote MCP and Secure MCP Tunnel at <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>.

## Permissions and tools

| Permission | Tools |
| --- | --- |
| Library | `status`, `search_components`, `get_original`, `export_original` |
| Capture | `capture_component` (public URL or supplied HTML), `pick_component` (one CSS-selected region within a capture) |
| Build | `inspect_component`, `build_component`, `analyze_source` (REA or Graphify) |
| Shared clipboard | `list_shared_components`, `read_shared_component`, `save_component` |
| Connected projects | `list_projects`, `inspect_project`, `project_targets`, `project_fit` |

No tool can connect arbitrary filesystem paths, run supplied code, apply/undo project changes, read provider keys or access destination account records. Original source and feature contracts regenerate through the same trusted services used by the app. Public capture uses the existing DNS/private-network controls. The shared inbox supports up to thirty items and a 16 MB store; tool calls have two concurrent execution slots. Fifty activity entries retain tool names/outcomes, not prompts, tokens or source contents.

Your browser clipboard is **not automatically shared**. Share the selected Studio item explicitly, or let an assistant save a new result to the shared inbox. Review its HTML/contract, import it as a new browser clipboard identity, then use Projects for actual fit, complete source review, installation and guarded undo. Removing a shared item leaves private copies intact.

Example workflow: ask the assistant to capture a form, inspect its controls, resolve supported create/counter behaviors, build the UI/API package, and save it. In Reframe import the result, choose your connected app, screen and container, review all generated files and apply. Restart a destination backend after installing a new contract.

## Verification

The official MCP SDK's HTTP client and stdio client are tested against an isolated real Reframe server: handshake, scoped discovery, capture, declared frontend/backend generation, inbox read/write, project inspection/fit, denied tools, private-network rejection and revoked credentials. These checks verify protocol interoperability; they do not certify an untested external product. Protocol reference: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>.
