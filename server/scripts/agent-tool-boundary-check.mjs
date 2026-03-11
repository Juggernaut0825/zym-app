#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  let ToolManager;
  try {
    ({ ToolManager } = await import('../dist/tools/tool-manager.js'));
  } catch (error) {
    throw new Error('Cannot import dist/tools/tool-manager.js. Run `npm run build` in /server first.');
  }

  const manager = new ToolManager(serverRoot);

  const cases = [
    {
      name: 'reject unknown tool field',
      tool: 'get_context',
      args: {
        scope: 'recent',
        unknownField: 'x',
      },
      expectOk: false,
      expectIncludes: 'Unknown field',
    },
    {
      name: 'reject invalid enum value',
      tool: 'get_context',
      args: {
        scope: 'admin',
      },
      expectOk: false,
      expectIncludes: 'Invalid "scope" value',
    },
    {
      name: 'reject missing required field',
      tool: 'log_meal',
      args: {
        foo: 'bar',
      },
      expectOk: false,
      expectIncludes: 'Missing required field: description',
    },
    {
      name: 'reject malformed media id',
      tool: 'inspect_media',
      args: {
        mediaId: 'bad_media',
      },
      expectOk: false,
      expectIncludes: 'Invalid "mediaId" format',
    },
    {
      name: 'reject write tool in read-only scope',
      tool: 'set_profile',
      args: {
        profile: { height_cm: 180 },
      },
      context: {
        conversationScope: 'group',
        allowWriteTools: false,
      },
      expectOk: false,
      expectIncludes: 'Tool policy error',
    },
    {
      name: 'accept valid get_context call',
      tool: 'get_context',
      args: {
        scope: 'recent',
        limit: 5,
      },
      expectOk: true,
      expectIncludes: 'rollingSummary',
    },
    {
      name: 'accept valid search_knowledge call',
      tool: 'search_knowledge',
      args: {
        query: 'how to improve squat form depth',
        domains: 'fitness',
        topK: 3,
      },
      expectOk: true,
      expectIncludes: 'matches',
    },
  ];

  for (const item of cases) {
    const result = await manager.executeTool(
      {
        id: `tc_${item.name.replace(/\s+/g, '_')}`,
        type: 'function',
        function: {
          name: String(item.tool || 'get_context'),
          arguments: JSON.stringify(item.args),
        },
      },
      {
        workingDirectory: serverRoot,
        userId: '1',
        ...(item.context || {}),
      },
    );

    if (item.expectOk) {
      assertTrue(result.ok === true, `[${item.name}] expected ok=true, got ok=${result.ok}. content=${result.content}`);
    } else {
      assertTrue(result.ok === false, `[${item.name}] expected ok=false, got ok=${result.ok}. content=${result.content}`);
    }

    if (item.expectIncludes) {
      assertTrue(
        String(result.content || '').toLowerCase().includes(item.expectIncludes.toLowerCase()),
        `[${item.name}] expected output to include "${item.expectIncludes}", got: ${result.content}`,
      );
    }
  }

  console.log('✅ Agent tool boundary checks passed');
}

run().catch((error) => {
  console.error(`❌ Agent tool boundary checks failed: ${error.message}`);
  process.exit(1);
});
