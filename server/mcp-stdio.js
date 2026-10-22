import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const port=Number(process.env.REFRAME_PORT||5173),token=process.env.REFRAME_MCP_TOKEN;
if(!Number.isInteger(port)||port<1||port>65535||!/^[a-f0-9]{64}$/.test(token||''))throw new Error('Set REFRAME_PORT and a valid REFRAME_MCP_TOKEN from Reframe Connections.');
const client=new Client({name:'Reframe local bridge',version:'0.1.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
const server=new Server({name:'Reframe',version:'0.1.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,()=>client.listTools());
server.setRequestHandler(CallToolRequestSchema,request=>client.callTool(request.params));
server.onclose=()=>{void client.close();};
await server.connect(new StdioServerTransport());
