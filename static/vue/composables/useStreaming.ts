import { ref, shallowRef } from 'vue';

export function useStreaming() {
  const fullContent = shallowRef('');
  const fullReasoning = shallowRef('');
  const streamUsage = ref<any>(null);
  const streamError = ref<string | null>(null);

  async function processStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    callbacks: {
      onContent?: (text: string) => void;
      onReasoning?: (text: string) => void;
      onDone?: (fullContent: string, fullReasoning: string) => void;
      onUsage?: (usage: any) => void;
    }
  ) {
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoning = '';
    let usage: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.substring(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            if (delta?.reasoning_content) {
              reasoning += delta.reasoning_content;
              fullReasoning.value = reasoning;
              callbacks.onReasoning?.(reasoning);
            }

            if (delta?.content != null && delta.content !== '') {
              content += delta.content;
              fullContent.value = content;
              callbacks.onContent?.(content);
            }

            if (json.usage) {
              usage = json.usage;
              streamUsage.value = usage;
              callbacks.onUsage?.(usage);
            }
          } catch {
            // skip parse errors for partial lines
          }
        }
      }

      callbacks.onDone?.(content, reasoning);
      return { content, reasoning, usage };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        streamError.value = 'aborted';
      } else {
        streamError.value = e.message;
      }
      return { content, reasoning, usage, error: e };
    }
  }

  function reset() {
    fullContent.value = '';
    fullReasoning.value = '';
    streamUsage.value = null;
    streamError.value = null;
  }

  return { fullContent, fullReasoning, streamUsage, streamError, processStream, reset };
}
