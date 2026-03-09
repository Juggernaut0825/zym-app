import { Tool, ToolDefinition, ToolCall, ToolResult, ToolExecutionContext } from '../types/index.js';
import { BashTool } from './bash-tool.js';

/**
 * Tool manager for all available tools.
 * ZJ agent minimal setup: keep only the bash tool.
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // ZJ Agent keeps one core tool: bash
    this.registerTool(new BashTool());
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  async executeTool(
    toolCall: ToolCall,
    contextOverrides?: Partial<ToolExecutionContext>,
  ): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolName,
        content: `Error: tool "${toolName}" was not found.`,
        ok: false,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    try {
      const context: ToolExecutionContext = {
        workingDirectory: this.workingDirectory,
        conversationHistory: contextOverrides?.conversationHistory || [],
        ...contextOverrides,
      };

      let args: unknown;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error: any) {
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: `Tool argument parse error: ${error.message}`,
          ok: false,
          errorCode: 'INVALID_TOOL_ARGUMENTS',
        };
      }

      const output = await tool.execute(args, context);

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: output,
        ok: true,
      };
    } catch (error: any) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: `Tool execution error: ${error.message}`,
        ok: false,
        errorCode: 'TOOL_EXECUTION_ERROR',
      };
    }
  }

  getToolCount(): number {
    return this.tools.size;
  }
}
