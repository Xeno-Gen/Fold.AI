import { ref } from 'vue';
import {
  chats, chatTitles, chatTokens, currentChat, chatBranches, isChatActive,
  streaming, currentAbortController, currentRequestId, currentProvider,
  currentModel, currentChatFormat, currentParams, currentThinkMode,
  cothinkEnabled, pluginPrompts, maxContextTokens, memoryEnabled, cachedMemories,
  commandExecEnabled, commandConfirmEnabled, agentEnabled, agentMaxIterations,
  sandboxEnabled, askEnabled, activeFiles, includeReasoning, streamEnabled,
} from '../state';
import { useI18n } from './useI18n';
import { useStreaming } from './useStreaming';
import { useHistory } from './useHistory';

declare global {
  interface Window {
    CommandExecutionPlugin?: {
      confirmCommand?: (shell: string, cmd: string) => Promise<boolean>;
      executeCommand?: (shell: string, cmd: string, callbacks?: any) => Promise<any>;
    };
  }
}

const { t } = useI18n();
const { processStream, reset: resetStream } = useStreaming();
const { saveChatToBackend, newChatOnServer } = useHistory();

const dangerousPatterns = [
  /rm\s+-rf/i, /(?:^|[&|;])\s*format\s+[a-z]:/i, /del\s+\/f/i,
  /rd\s+\/s/i, /shutdown/i, /sudo\s+rm\s+-rf/i, />\s*\/dev\/sda/i,
  /dd\s+if=/i, /:\(\)\s*\{/i,
];

export function useChat() {
  const streamingMsgIndex = ref<number | null>(null);
  const streamingContent = ref('');
  const streamingReasoning = ref('');

  function stripTags(text: string): string {
    return text
      .replace(/<mem:[^>]+>[\s\S]*?<\/mem>/gi, '')
      .replace(/<power>[\s\S]*?<\/power>/gi, '')
      .replace(/<powershell>[\s\S]*?<\/powershell>/gi, '')
      .replace(/<cmd>[\s\S]*?<\/cmd>/gi, '')
      .replace(/<shell>[\s\S]*?<\/shell>/gi, '')
      .replace(/<mem-del:[^>]+>/gi, '')
      .trim();
  }

  function buildToolPrompt(): string {
    // Build from plugin prompts
    let text = '';
    if (pluginPrompts.value) {
      if (pluginPrompts.value.plugins) {
        for (const p of pluginPrompts.value.plugins) {
          if (p.prompt) text += p.prompt + '\n';
        }
      }
    }
    return text;
  }

  function reorderMessages(msgs: any[]): any[] {
    // Move tool/system prompts to front
    const systems = msgs.filter((m: any) => m.role === 'system');
    const rest = msgs.filter((m: any) => m.role !== 'system');
    return [...systems, ...rest];
  }

  function compressOldExecMessages(msgs: any[]): any[] {
    // Replace consecutive exec messages with summary
    const result: any[] = [];
    let execCount = 0;
    for (const m of msgs) {
      if (m._isExec) {
        execCount++;
        if (execCount <= 3) result.push(m);
      } else {
        if (execCount > 3) {
          result.push({ role: 'system', content: '<End_Tool>', images: [] });
        }
        execCount = 0;
        result.push(m);
      }
    }
    if (execCount > 3) {
      result.push({ role: 'system', content: '<End_Tool>', images: [] });
    }
    return result;
  }

  async function callAPI(messages: any[]): Promise<{ body?: ReadableStream<any>; json?: any; apiRequest: any }> {
    if (!currentModel.value) throw new Error(t('noModel'));

    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    currentRequestId.value = requestId;

    const payload: any = {
      messages,
      provider: currentProvider.value,
      model: currentModel.value,
      chatFormat: currentChatFormat.value,
      stream: streamEnabled.value,
      requestId,
    };

    // Add params
    const params = currentParams as any;
    if (params.temperature != null) payload.temperature = params.temperature;
    if (params.top_p != null) payload.top_p = params.top_p;
    if (params.max_tokens != null) payload.max_tokens = params.max_tokens;
    if (params.frequency_penalty != null) payload.frequency_penalty = params.frequency_penalty;
    if (params.presence_penalty != null) payload.presence_penalty = params.presence_penalty;
    if (params.seed != null) payload.seed = params.seed;

    if (currentThinkMode.value !== 'fast') {
      payload.deep_think = true;
      payload.thinkMode = currentThinkMode.value;
    }
    if (maxContextTokens.value) payload.maxContextTokens = maxContextTokens.value;

    const controller = new AbortController();
    currentAbortController.value = controller;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    if (res.body) {
      return { body: res.body, apiRequest: payload };
    }

    const json = await res.json();
    return { json, apiRequest: payload };
  }

  async function sendMessage(userText = '', target = 'initial') {
    if (streaming.value) { console.log('[Chat] already streaming'); return; }
    if (!currentProvider.value) throw new Error('未选择提供商');
    if (!currentModel.value) throw new Error('未选择模型');

    // Get files from activeFiles
    const files = activeFiles[target];
    const textFiles = files.filter((f: any) => f.type === 'text');
    const imageFiles = files.filter((f: any) => f.type === 'image');
    const videoFiles = files.filter((f: any) => f.type === 'video');
    const imgs = imageFiles.map((f: any) => f.content);

    const userMsg: any = { role: 'user', content: userText || '', images: imgs };
    chats.value[currentChat.value].push(userMsg);

    // Add text file contents as tool messages
    for (const f of textFiles) {
      chats.value[currentChat.value].push({
        role: 'tool',
        content: f.content,
        _fileCard: true,
        _fileName: f.fileName,
      });
    }

    // Clear input files
    activeFiles[target] = [];

    // Save
    saveChatToBackend();

    // Start streaming
    streaming.value = true;
    const stream = useStreaming();
    let fullContent = '';
    let fullReasoning = '';
    let streamRequestBody: any = null;

    // Add placeholder AI message
    const aiMsg: any = { role: 'assistant', content: '', reasoning: '' };
    chats.value[currentChat.value].push(aiMsg);
    streamingMsgIndex.value = chats.value[currentChat.value].length - 1;

    try {
      const maxAgentIter = agentEnabled.value ? agentMaxIterations.value : 1;
      let firstIter = true;

      for (let agentIter = 0; agentIter < maxAgentIter; agentIter++) {
        // Build messages for this iteration
        let iterMsgs = reorderMessages(
          compressOldExecMessages(
            chats.value[currentChat.value]
              .filter((m: any) => m.role)
              .map((m: any) => {
                const msg: any = { role: m.role, content: m.content, images: m.images || [], _isExec: m._isExec };
                if (m.role === 'assistant' && includeReasoning.value && m.reasoning) {
                  msg.reasoning = m.reasoning.length > 2000 ? m.reasoning.substring(0, 2000) + '...' : m.reasoning;
                }
                return msg;
              })
          )
        );

        // Add tool prompt
        const toolPromptText = buildToolPrompt();
        if (toolPromptText) {
          const hasToolPrompt = iterMsgs.some((m: any) =>
            m.role === 'system' && (m.content.includes('[Agent') || m.content.includes('[工具'))
          );
          if (!hasToolPrompt) {
            iterMsgs.unshift({ role: 'system', content: toolPromptText, images: [] });
          }
        }

        // Add think mode prompts
        if (currentThinkMode.value === 'deep' || currentThinkMode.value === 'meditate') {
          try {
            const cfgFile = currentThinkMode.value === 'deep' ? 'DeepThink.md' : 'Medit.md';
            const cfgRes = await fetch('/api/config/' + cfgFile);
            if (cfgRes.ok) {
              const cfg = await cfgRes.json();
              if (cfg.think && cfg.think.trim()) {
                const exists = iterMsgs.some((m: any) => m.role === 'system' && m.content.includes(cfg.think.substring(0, 20)));
                if (!exists) iterMsgs.unshift({ role: 'system', content: cfg.think, images: [] });
              }
            }
          } catch {}
        }

        // Add CoThink chain
        if (cothinkEnabled.value && pluginPrompts.value?.cothink) {
          const exists = iterMsgs.some((m: any) => m.role === 'system' && m.content.includes('[思维链'));
          if (!exists) {
            iterMsgs.unshift({ role: 'system', content: pluginPrompts.value.cothink, images: [] });
          }
        }

        // Add plugin status
        const statusLines = [
          '- 命令执行: ' + (commandExecEnabled.value ? '开启' : '关闭'),
          '- 记忆: ' + (memoryEnabled.value ? '开启' : '关闭'),
          '- Agent: ' + (agentEnabled.value ? '开启' : '关闭'),
        ];
        let sysCount = iterMsgs.filter((m: any) => m.role === 'system').length;
        iterMsgs.splice(sysCount, 0, {
          role: 'system',
          content: '[当前插件状态]\n' + statusLines.join('\n'),
          images: [],
        });

        // Add memories
        if (memoryEnabled.value && cachedMemories.value.length > 0) {
          let memContent = '[已有记忆]\n';
          cachedMemories.value.forEach((m: any, i: number) => {
            memContent += '\n' + (i + 1) + '. ' + m.key + ': ' + (m.content || '');
          });
          sysCount = iterMsgs.filter((m: any) => m.role === 'system').length;
          iterMsgs.splice(sysCount, 0, { role: 'system', content: memContent.trim(), images: [] });
        }

        // Call API
        const callResult = await callAPI(iterMsgs);
        streamRequestBody = callResult.apiRequest;

        fullContent = '';
        fullReasoning = '';

        if (callResult.body) {
          // Streaming
          await processStream(callResult.body.getReader(), {
            onContent: (text: string) => {
              fullContent = text;
              aiMsg.content = text;
              streamingContent.value = text;
            },
            onReasoning: (text: string) => {
              fullReasoning = text;
              aiMsg.reasoning = text;
              streamingReasoning.value = text;
            },
            onDone: (content: string, reasoning: string) => {
              fullContent = content;
              fullReasoning = reasoning;
            },
          });
        } else if (callResult.json) {
          // Non-streaming
          let content = '';
          if (callResult.json.choices?.[0]?.message?.content) {
            content = callResult.json.choices[0].message.content;
          }
          fullContent = content;
          aiMsg.content = content;
          streamingContent.value = content;
        }

        streamingMsgIndex.value = null;
        saveChatToBackend();

        // Check for tool calls
        if (agentIter < maxAgentIter - 1) {
          const hasTools = await processToolCalls(fullContent);
          const hasMemories = await processMemoryCalls(fullContent);

          if (!hasTools && !hasMemories) break;
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        aiMsg.content = (aiMsg.content || '') + '\n\n[错误: ' + e.message + ']';
      }
    }

    streaming.value = false;
    currentAbortController.value = null;
    currentRequestId.value = null;
    saveChatToBackend();

    // Update title from first message
    if (chatTitles.value[currentChat.value] === t('currentChatTitle') || chatTitles.value[currentChat.value] === '新对话') {
      const firstUserMsg = chats.value[currentChat.value].find((m: any) => m.role === 'user');
      if (firstUserMsg?.content) {
        chatTitles.value[currentChat.value] = firstUserMsg.content.substring(0, 50);
        saveChatToBackend();
      }
    }
  }

  async function processToolCalls(responseText: string): Promise<boolean> {
    const commands: { idx: number; shell: string; command: string }[] = [];

    const powerRegex = /<power>([\s\S]*?)<\/power>/gi;
    const psRegex = /<powershell>([\s\S]*?)<\/powershell>/gi;
    const cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/gi;
    const shellRegex = /<shell>([\s\S]*?)<\/shell>/gi;
    let match;

    while ((match = powerRegex.exec(responseText)) !== null) {
      commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
    }
    while ((match = psRegex.exec(responseText)) !== null) {
      commands.push({ idx: commands.length, shell: 'powershell', command: match[1].trim() });
    }
    while ((match = cmdRegex.exec(responseText)) !== null) {
      commands.push({ idx: commands.length, shell: 'cmd', command: match[1].trim() });
    }
    while ((match = shellRegex.exec(responseText)) !== null) {
      commands.push({ idx: commands.length, shell: 'shell', command: match[1].trim() });
    }

    if (commands.length === 0) return false;

    for (const cmd of commands) {
      if (dangerousPatterns.some(p => p.test(cmd.command))) {
        const msg = { role: 'tool', content: '⚠️ 危险命令已被阻止: ' + cmd.command, images: [], _isExec: true };
        chats.value[currentChat.value].push(msg);
        continue;
      }

      if (commandConfirmEnabled.value && window.CommandExecutionPlugin?.confirmCommand) {
        try {
          const confirmed = await window.CommandExecutionPlugin.confirmCommand(cmd.shell, cmd.command);
          if (!confirmed) {
            const msg = { role: 'tool', content: '命令已取消: ' + cmd.shell + ' ' + cmd.command, images: [], _isExec: true };
            chats.value[currentChat.value].push(msg);
            continue;
          }
        } catch {}
      }

      try {
        const res = await fetch('/api/plugin/command/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shell: cmd.shell, command: cmd.command }),
        });
        if (res.ok) {
          const data = await res.json();
          const execMsg = {
            role: 'tool',
            content: '[执行结果]\n' + (data.output || data.result || ''),
            images: [],
            _isExec: true,
            _shell: cmd.shell,
            _command: cmd.command,
          };
          chats.value[currentChat.value].push(execMsg);
        }
      } catch {}
    }

    return true;
  }

  async function processMemoryCalls(responseText: string): Promise<boolean> {
    let hasMem = false;

    // Save memory: <mem:key>content</mem>
    const memRegex = /<mem:([^>]+)>([\s\S]*?)<\/mem>/gi;
    let memMatch;
    while ((memMatch = memRegex.exec(responseText)) !== null) {
      hasMem = true;
      const key = memMatch[1].trim();
      const content = memMatch[2].trim();
      try {
        await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
      } catch {}
    }

    // Delete memory: <mem-del:key>
    const delRegex = /<mem-del:([^>]+)>/gi;
    let delMatch;
    while ((delMatch = delRegex.exec(responseText)) !== null) {
      hasMem = true;
      const key = delMatch[1].trim();
      try {
        await fetch('/api/plugin/Memory/memory/' + encodeURIComponent(key), { method: 'DELETE' });
      } catch {}
    }

    return hasMem;
  }

  function stopGeneration() {
    if (currentAbortController.value) {
      currentAbortController.value.abort();
      currentAbortController.value = null;
    }
    if (currentRequestId.value) {
      fetch('/api/chat/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: currentRequestId.value }) }).catch(() => {});
      fetch('/api/plugin/CommandExecution/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: currentRequestId.value }) }).catch(() => {});
    }
  }

  return {
    sendMessage,
    stopGeneration,
    processToolCalls,
    processMemoryCalls,
    streamingMsgIndex,
    streamingContent,
    streamingReasoning,
    stripTags,
  };
}
