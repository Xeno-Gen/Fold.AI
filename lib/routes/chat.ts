import { Router, Request, Response } from 'express';
import { getUserConfig, incrementUsage } from '../user/manager';
import { getUserProviderKey, getUserProviderUrl, getProviders } from './providers';
import { getSystemPrompt } from '../parser/configparser';
import { logger } from '../logger';

export const chatRouter = Router();

// 系统版本（服务器启动时设置）
export let systemVersion = '';

export function setSystemVersion(ver: string) {
    systemVersion = ver;
}

// 存储活跃请求的 AbortController
const activeControllers = new Map<string, AbortController>();

// 停止生成接口
chatRouter.post('/chat/stop', (req: Request, res: Response) => {
    const { requestId } = req.body;
    if (!requestId) {
        return res.status(400).json({ success: false, error: '缺少 requestId' });
    }
    const controller = activeControllers.get(requestId);
    if (controller) {
        logger.info(`stop generation: request ${requestId}, aborting`);
        controller.abort();
        activeControllers.delete(requestId);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: '没有找到活跃的请求' });
    }
});

// 将消息转换为 Anthropic 格式
function toAnthropicMessages(messages: any[]) {
    const systemMessages: string[] = [];
    const apiMessages: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemMessages.push(msg.content);
        } else if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
            let content: any;
            if (msg.images && msg.images.length > 0) {
                const parts: any[] = [];
                if (msg.content) parts.push({ type: 'text', text: msg.content });
                msg.images.forEach((img: string) => {
                    // 支持 base64 或 url 图片
                    if (img.startsWith('data:')) {
                        const mediaType = img.split(';')[0].split(':')[1] || 'image/png';
                        const base64Data = img.split(',')[1] || img;
                        parts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } });
                    } else {
                        parts.push({ type: 'image', source: { type: 'url', url: img } });
                    }
                });
                content = parts;
            } else {
                content = msg.content;
            }
            apiMessages.push({ role: msg.role, content });
        }
        // 忽略其他 role
    }

    return { system: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined, messages: apiMessages };
}

// 将 OpenAI 流式响应行转换为前端 SSE
function processOpenAIStreamLine(line: string, fullContent: { current: string }, fullReasoning: { current: string }): string | null {
    if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') return 'data: [DONE]\n\n';
        try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (delta) {
                if (delta.reasoning_content) {
                    fullReasoning.current += String(delta.reasoning_content);
                    return 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: delta.reasoning_content } }] }) + '\n\n';
                }
                if (delta.content !== undefined && delta.content !== null) {
                    const contentPart = parseContent(delta.content);
                    if (contentPart) {
                        fullContent.current += contentPart;
                        return 'data: ' + JSON.stringify({ choices: [{ delta: { content: contentPart } }] }) + '\n\n';
                    }
                }
            }
        } catch (e) {}
    }
    return null;
}

function parseContent(c: any): string {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        return c.map(item => {
            if (typeof item === 'string') return item;
            if (item?.text) return item.text;
            if (item?.value) return item.value;
            return '';
        }).join('');
    }
    if (typeof c === 'object' && c !== null) {
        return c.text || c.value || c.content || '';
    }
    return '';
}

// 处理非流式 OpenAI 响应
function parseOpenAIResponse(data: any): string {
    let content = data.choices?.[0]?.message?.content || '';
    if (Array.isArray(content)) {
        content = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('');
    } else if (typeof content === 'object' && content !== null) {
        content = content.text || JSON.stringify(content);
    }
    return content;
}

// 处理 Anthropic 流式 SSE 事件，转换为前端统一的 SSE 格式
function processAnthropicStreamLine(line: string, fullContent: { current: string }, fullReasoning: { current: string }): string | null {
    if (line.startsWith('event: ')) {
        // 事件类型行，跳过（在 data 行处理）
        return null;
    }
    if (line.startsWith('data: ')) {
        const dataStr = line.substring(6);
        try {
            const data = JSON.parse(dataStr);
            const type = data.type;

            if (type === 'content_block_delta') {
                const delta = data.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                    fullContent.current += delta.text;
                    return 'data: ' + JSON.stringify({ choices: [{ delta: { content: delta.text } }] }) + '\n\n';
                }
                if (delta?.type === 'thinking_delta' && delta?.thinking) {
                    fullReasoning.current += delta.thinking;
                    return 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: delta.thinking } }] }) + '\n\n';
                }
            } else if (type === 'message_start') {
                // 可以忽略或处理初始消息
                return null;
            } else if (type === 'message_delta') {
                if (data.delta?.stop_reason) {
                    return 'data: ' + JSON.stringify({ type: 'stop_reason', stop_reason: data.delta.stop_reason }) + '\n\n';
                }
                return null;
            } else if (type === 'message_stop') {
                return 'data: [DONE]\n\n';
            } else if (type === 'content_block_start') {
                return null;
            } else if (type === 'content_block_stop') {
                return null;
            } else if (type === 'ping') {
                return null;
            }
        } catch (e) {}
    }
    return null;
}

// 处理非流式 Anthropic 响应
function parseAnthropicResponse(data: any): string {
    if (data.content && Array.isArray(data.content)) {
        return data.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('');
    }
    return data.content?.[0]?.text || '';
}

chatRouter.post('/chat', async (req: Request, res: Response) => {
    let requestId: string | null = null;
    let abortController: AbortController | null = null;

    try {
        const {
            messages, provider, model, temperature, top_p, max_tokens,
            seed, frequency_penalty, presence_penalty, top_k, stop, stream,
            chat_template_kwargs, deep_think, thinkMode, chatFormat,
            requestId: reqId, maxContextTokens, pluginStatus,
            customProviderUrl
        } = req.body;

        requestId = reqId || null;
        // 标准化 max_tokens：前端传空字符串 = 不限制，不要用后端硬编码兜底
        const cleanMt = (max_tokens !== undefined && max_tokens !== null && max_tokens !== '')
            ? Number(max_tokens) : undefined;
        logger.info(`API chat: provider=${provider} model=${model} stream=${stream ?? false} messages=${(messages||[]).length}`);

        const userConfig = getUserConfig(req.userToken!);

        let apiKey: string | null = null;
        let baseUrl: string | null = null;

        if (provider) {
            apiKey = getUserProviderKey(req.userToken!, provider);
            baseUrl = getUserProviderUrl(provider);
            // 自定义提供商：使用前端传入的 URL
            if (!baseUrl && customProviderUrl) {
                baseUrl = customProviderUrl;
            }
            if (!apiKey || !baseUrl) {
                return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            }
        } else {
            return res.status(400).json({ error: '未选择模型提供商' });
        }

        // 判断使用的格式
        const currentFormat = chatFormat || 'OpenAI';
        const providerInfo = getProviders().find((p: any) => p.id === provider);

        // 如果是 Anthropic 格式，使用对应的 URL
        let requestUrl = baseUrl;
        let isAnthropicFormat = false;
        if (currentFormat === 'Anthropic') {
            isAnthropicFormat = true;
            // 如果提供商有专门的 anthropic URL，使用它
            if (providerInfo?.anthropicUrl) {
                requestUrl = providerInfo.anthropicUrl;
            }
        }

        const params = userConfig.defaultParams;

        // 构建消息数组，保留 images 字段
        const rawMessages = (messages || []) as any[];
        const finalMessages: any[] = rawMessages.map((m: any) => ({
            role: m.role,
            content: m.content || '',
            images: m.images || [],
            ...(m.role === 'assistant' ? { reasoning_content: m.reasoning || '' } : {})
        }));
        // DeepSeek 要求 tool 消息必须有 tool_call_id 且前置 assistant 消息
        // 必须有 tool_calls，但只要有 tool_calls 模型就会学歪输出
        // <tool_calls><invoke name="plugin_tool">。
        // 方案：发给 API 时 tool → user，本地存储仍用 tool role。
        for (let i = 0; i < finalMessages.length; i++) {
            if (finalMessages[i].role === 'tool') {
                finalMessages[i].role = 'user';
                delete finalMessages[i].tool_call_id;
            }
            if (finalMessages[i].role === 'assistant') {
                delete finalMessages[i].tool_calls;
            }
        }

        if (!isAnthropicFormat) {
            // 将带 images 的消息转换为多模态 content 数组
            const processedMessages = finalMessages.map((msg: any) => {
                if (!msg.images || msg.images.length === 0) return msg;
                const contentParts: any[] = [];
                if (msg.content) {
                    contentParts.push({ type: "text", text: msg.content });
                }
                msg.images.forEach((img: string) => {
                    contentParts.push({ type: "image_url", image_url: { url: img } });
                });
                return { ...msg, content: contentParts };
            });

            const openaiBody: any = {
                model: model || userConfig.currentModel || 'deepseek-v4-flash',
                messages: processedMessages,
                temperature: temperature ?? params.temperature,
                top_p: top_p ?? params.top_p,
                stream: stream ?? false,
            };
            const mt = cleanMt ?? (params.max_tokens ? Number(params.max_tokens) : undefined);
            if (mt) openaiBody.max_tokens = mt;

            if (seed !== null && seed !== undefined) openaiBody.seed = seed;
            else if (params.seed !== null) openaiBody.seed = params.seed;
            if (frequency_penalty !== undefined) openaiBody.frequency_penalty = frequency_penalty;
            else openaiBody.frequency_penalty = params.frequency_penalty;
            if (presence_penalty !== undefined) openaiBody.presence_penalty = presence_penalty;
            else openaiBody.presence_penalty = params.presence_penalty;
            if (top_k !== null && top_k !== undefined) openaiBody.top_k = top_k;
            else if (params.top_k !== null) openaiBody.top_k = params.top_k;
            if (stop) openaiBody.stop = stop;
            if (chat_template_kwargs) openaiBody.chat_template_kwargs = chat_template_kwargs;
            // DeepSeek 思考强度适配
            if (provider === 'DEEPSEEK' && deep_think) {
                let effort = 'high';
                if (thinkMode === 'fast') effort = 'low';
                else if (thinkMode === 'think') effort = 'medium';
                else if (thinkMode === 'deep') effort = 'high';
                else if (thinkMode === 'meditate') effort = 'max';
                openaiBody.reasoning_effort = effort;
            } else if (deep_think !== undefined) {
                openaiBody.deep_think = deep_think;
            }

            abortController = new AbortController();
            if (requestId) {
                activeControllers.set(requestId, abortController);
                abortController.signal.addEventListener('abort', () => {
                    logger.info(`request aborted for ${requestId}`);
                    activeControllers.delete(requestId!);
                }, { once: true });
            }

            logger.info('[chat] request body: ' + JSON.stringify(openaiBody));

            const upstreamResponse = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(openaiBody),
                signal: abortController.signal,
            });

            if (!upstreamResponse.ok) {
                const err = await upstreamResponse.text();
                if (requestId) activeControllers.delete(requestId);
                if (openaiBody.stream) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.write('data: ' + JSON.stringify({ type: 'error', content: err }) + '\n\n');
                    res.write('data: [DONE]\n\n');
                    return res.end();
                }
                return res.json({ type: 'error', content: err });
            }

            // 记录模型使用次数
            const usedModel = openaiBody.model;
            if (usedModel && req.userToken) {
                try { incrementUsage(req.userToken, usedModel); } catch (e) {}
            }

            const reqStartTime = Date.now();
            if (openaiBody.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.write('data: ' + JSON.stringify({ type: 'request_body', requestBody: openaiBody }) + '\n\n');

                logger.info(`[chat] streaming → model=${usedModel} msgs=${(messages||[]).length}`);

                req.on('close', () => {
                    const dur = Date.now() - reqStartTime;
                    logger.info(`[chat] stream ended (client disconnect) model=${usedModel} dur=${dur}ms`);
                    if (abortController) abortController.abort();
                    if (requestId) activeControllers.delete(requestId);
                });

                const reader = upstreamResponse.body?.getReader();
                if (!reader) {
                    if (requestId) activeControllers.delete(requestId);
                    return res.status(500).json({ error: '无响应流' });
                }

                const decoder = new TextDecoder();
                let streamBuffer = '';
                let lastUsage: any = null;
                let streamAborted = false;
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        streamBuffer += chunk;
                        const lines = streamBuffer.split('\n');
                        streamBuffer = lines.pop() || '';
                        for (const line of lines) {
                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                try {
                                    const d = JSON.parse(line.substring(6));
                                    if (d.usage) lastUsage = d.usage;
                                } catch {}
                            }
                        }
                        res.write(chunk);
                    }
                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        streamAborted = true;
                        const dur = Date.now() - reqStartTime;
                        logger.info(`[chat] stream aborted model=${usedModel} dur=${dur}ms`);
                    } else {
                        logger.error('stream error: ' + e.message);
                    }
                } finally {
                    if (!streamAborted) {
                        const dur = Date.now() - reqStartTime;
                        const tokStr = lastUsage
                            ? `in=${lastUsage.prompt_tokens || '?'} out=${lastUsage.completion_tokens || '?'} total=${lastUsage.total_tokens || '?'}`
                            : 'tokens=?';
                        logger.info(`[chat] stream done model=${usedModel} ${tokStr} dur=${dur}ms`);
                    }
                    if (requestId) activeControllers.delete(requestId);
                    if (!res.writableEnded) {
                        res.end();
                    }
                }
            } else {
                const data: any = await upstreamResponse.json();
                const content = parseOpenAIResponse(data);
                const usage = data.usage || null;
                const dur = Date.now() - reqStartTime;
                const tokStr = usage
                    ? `in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'} total=${usage.total_tokens || '?'}`
                    : 'tokens=?';
                logger.info(`[chat] done model=${usedModel} ${tokStr} dur=${dur}ms`);
                logger.info('[chat] response body: ' + JSON.stringify(data));
                if (requestId) activeControllers.delete(requestId);
                res.json({ content, usage, requestBody: openaiBody });
            }
        } else {
            // ===== Anthropic 格式 =====
            const { system, messages: anthropicMessages } = toAnthropicMessages(finalMessages);

            // 注入系统版本和用户 systemPrompt 到 Anthropic system 字段
            // 从 config/prompts/Zh|En/*.md 读取基础系统提示词
            const basePrompt = getSystemPrompt(userConfig.promptLang || 'zh');
            let effectiveSystem = system || '';
            // 非纯净模式时加入基础提示词
            if (!userConfig.pureMode && basePrompt) {
                effectiveSystem = effectiveSystem
                    ? basePrompt + '\n\n' + effectiveSystem
                    : basePrompt;
            }
            if (userConfig.systemPrompt) {
                effectiveSystem = effectiveSystem
                    ? effectiveSystem + '\n\n' + userConfig.systemPrompt
                    : userConfig.systemPrompt;
            }
            if (systemVersion) {
                effectiveSystem = effectiveSystem
                    ? `[用户使用的系统版本: ${systemVersion}]\n${effectiveSystem}`
                    : `[用户使用的系统版本: ${systemVersion}]`;
            }

            const anthropicBody: any = {
                model: model || userConfig.currentModel || 'claude-sonnet-4-6',
                max_tokens: cleanMt
                    ?? (params.max_tokens ? Number(params.max_tokens) : undefined)
                    ?? 65536,
                messages: anthropicMessages,
                temperature: temperature ?? params.temperature,
                top_p: top_p ?? params.top_p,
                stream: stream ?? false,
            };

            if (effectiveSystem) anthropicBody.system = effectiveSystem;
            if (top_k !== null && top_k !== undefined) anthropicBody.top_k = top_k;
            else if (params.top_k !== null) anthropicBody.top_k = params.top_k;
            if (stop) anthropicBody.stop_sequences = Array.isArray(stop) ? stop : [stop];
            if (seed !== null && seed !== undefined) anthropicBody.metadata = { ...anthropicBody.metadata, user_id: String(seed) };

            abortController = new AbortController();
            if (requestId) {
                activeControllers.set(requestId, abortController);
                abortController.signal.addEventListener('abort', () => {
                    logger.info(`request aborted for ${requestId} (Anthropic)`);
                    activeControllers.delete(requestId!);
                }, { once: true });
            }

            logger.info('[chat] request body: ' + JSON.stringify(anthropicBody));

            const upstreamResponse = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(anthropicBody),
                signal: abortController.signal,
            });

            if (!upstreamResponse.ok) {
                const err = await upstreamResponse.text();
                if (requestId) activeControllers.delete(requestId);
                if (anthropicBody.stream) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.write('data: ' + JSON.stringify({ type: 'error', content: err }) + '\n\n');
                    res.write('data: [DONE]\n\n');
                    return res.end();
                }
                return res.json({ type: 'error', content: err });
            }

            // 记录模型使用次数
            const antModel = anthropicBody.model;
            if (antModel && req.userToken) {
                try { incrementUsage(req.userToken, antModel); } catch (e) {}
            }

            const antReqStart = Date.now();
            if (anthropicBody.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.write('data: ' + JSON.stringify({ type: 'request_body', requestBody: anthropicBody }) + '\n\n');

                logger.info(`[chat] streaming → model=${antModel} msgs=${(messages||[]).length}`);

                req.on('close', () => {
                    const dur = Date.now() - antReqStart;
                    logger.info(`[chat] stream ended (client disconnect) model=${antModel} dur=${dur}ms`);
                    if (abortController) abortController.abort();
                    if (requestId) activeControllers.delete(requestId);
                });

                const reader = upstreamResponse.body?.getReader();
                if (!reader) {
                    if (requestId) activeControllers.delete(requestId);
                    return res.status(500).json({ error: '无响应流' });
                }

                const decoder = new TextDecoder();
                let buffer = '';
                const dummyContent = { current: '' };
                const dummyReasoning = { current: '' };
                let streamUsage: any = null;
                let antAborted = false;
                let antStopReason: string | null = null;

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const d = JSON.parse(trimmed.substring(6));
                                    if (d.type === 'message_start' && d.message?.usage) {
                                        streamUsage = { ...d.message.usage };
                                    } else if (d.type === 'message_delta' && d.usage?.output_tokens !== undefined) {
                                        if (!streamUsage) streamUsage = {};
                                        streamUsage.output_tokens = d.usage.output_tokens;
                                        streamUsage.total_tokens = (streamUsage.input_tokens || 0) + d.usage.output_tokens;
                                        if (d.delta?.stop_reason) antStopReason = d.delta.stop_reason;
                                    }
                                } catch {}
                            }
                            const converted = processAnthropicStreamLine(trimmed, dummyContent, dummyReasoning);
                            if (converted) {
                                res.write(converted);
                            }
                        }
                    }
                    if (buffer.trim()) {
                        const converted = processAnthropicStreamLine(buffer.trim(), dummyContent, dummyReasoning);
                        if (converted) {
                            res.write(converted);
                        }
                    }
                    if (streamUsage) {
                        res.write('data: ' + JSON.stringify({ usage: streamUsage }) + '\n\n');
                    }
                    if (antStopReason) {
                        res.write('data: ' + JSON.stringify({ type: 'stop_reason', stop_reason: antStopReason }) + '\n\n');
                    }
                    res.write('data: [DONE]\n\n');
                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        antAborted = true;
                        logger.info(`[chat] stream aborted model=${antModel} dur=${Date.now() - antReqStart}ms`);
                    } else {
                        logger.error('Anthropic stream error: ' + e.message);
                    }
                } finally {
                    if (!antAborted) {
                        const dur = Date.now() - antReqStart;
                        const tokStr = streamUsage
                            ? `in=${streamUsage.input_tokens || '?'} out=${streamUsage.output_tokens || '?'} total=${streamUsage.total_tokens || '?'}`
                            : 'tokens=?';
                        logger.info(`[chat] stream done model=${antModel} ${tokStr} dur=${dur}ms`);
                    }
                    if (requestId) activeControllers.delete(requestId);
                    if (!res.writableEnded) {
                        res.end();
                    }
                }
            } else {
                const data: any = await upstreamResponse.json();
                const content = parseAnthropicResponse(data);
                const usage = data.usage || null;
                const dur = Date.now() - antReqStart;
                const tokStr = usage
                    ? `in=${usage.input_tokens || '?'} out=${usage.output_tokens || '?'} total=${usage.total_tokens || '?'}`
                    : 'tokens=?';
                logger.info(`[chat] done model=${antModel} ${tokStr} dur=${dur}ms`);
                logger.info('[chat] response body: ' + JSON.stringify(data));
                if (requestId) activeControllers.delete(requestId);
                res.json({ content, usage, requestBody: anthropicBody });
            }
        }
    } catch (e: any) {
        if (requestId) activeControllers.delete(requestId);
        if (abortController) abortController.abort();

        if (e.name === 'AbortError') {
            if (!res.headersSent) {
                res.status(499).json({ error: '请求已取消' });
            }
        } else {
            logger.error('request failed: ' + e.message);
            if (!res.headersSent) {
                res.status(500).json({ error: e.message });
            }
        }
    }
});

// ===== Agent 循环（后端执行，持久化） =====
const agentSessions = new Map<string, any>();

function parseAgentCommands(text: string): { tag: string; cmd: string }[] {
    const cmds: { tag: string; cmd: string }[] = [];
    // Only parse commands inside <Plugin-cmd> blocks
    const pluginCmdRe = /<Plugin-cmd>([\s\S]*?)<\/Plugin-cmd>/gi;
    let execText = '';
    let m2;
    while ((m2 = pluginCmdRe.exec(text)) !== null) {
        execText += m2[1] + '\n';
    }
    if (!execText.trim()) return cmds;
    const patterns = [
        { tag: 'shell', re: /<shell>\s*([\s\S]*?)\s*<\/shell>/gi },
        { tag: 'powershell', re: /<powershell>\s*([\s\S]*?)\s*<\/powershell>/gi },
        { tag: 'power', re: /<power>\s*([\s\S]*?)\s*<\/power>/gi },
        { tag: 'cmd', re: /<cmd>\s*([\s\S]*?)\s*<\/cmd>/gi },
        { tag: 'command', re: /<command>\s*([\s\S]*?)\s*<\/command>/gi },
    ];
    for (const p of patterns) {
        let m;
        while ((m = p.re.exec(execText)) !== null) {
            cmds.push({ tag: p.tag, cmd: m[1].trim() });
        }
    }
    return cmds;
}

async function callLLMStream(
    messages: any[], provider: string, model: string, params: any, req: any,
    onContent: (text: string) => void,
    onReasoning?: (text: string) => void
): Promise<{ content: string; reasoning: string; usage: any }> {
    const userConfig = getUserConfig(req.userToken!);
    const apiKey = getUserProviderKey(req.userToken!, provider);
    const baseUrl = getUserProviderUrl(provider);

    const agMt = (params.max_tokens !== undefined && params.max_tokens !== null && params.max_tokens !== '')
        ? Number(params.max_tokens) : undefined;
    const openaiBody: any = {
        model: model || userConfig.currentModel || 'deepseek-v4-flash',
        messages: messages.map((m: any) => {
            if (m.role === 'tool') return { role: 'user', content: m.content };
            return { role: m.role, content: m.content };
        }),
        temperature: params.temperature ?? 0.6,
        top_p: params.top_p ?? 1.0,
        stream: true,
    };
    if (agMt) openaiBody.max_tokens = agMt;

    const url = new URL(baseUrl!);
    const mod = url.protocol === 'https:' ? require('https') : require('http');
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    };

    return new Promise((resolve, reject) => {
        const httpreq = mod.request(options, (resp: any) => {
            let buffer = '';
            let fullContent = '';
            let fullReasoning = '';
            let streamUsage: any = null;
            resp.on('data', (chunk: any) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const d = line.substring(6);
                    if (d === '[DONE]') continue;
                    try {
                        const json = JSON.parse(d);
                        if (json.usage) streamUsage = json.usage;
                        const delta = json.choices?.[0]?.delta;
                        if (delta) {
                            if (delta.reasoning_content) {
                                fullReasoning += delta.reasoning_content;
                                if (onReasoning) onReasoning(delta.reasoning_content);
                            }
                            if (delta.content != null) {
                                fullContent += delta.content;
                                onContent(delta.content);
                            }
                        }
                    } catch (e) {}
                }
            });
            resp.on('end', () => resolve({ content: fullContent, reasoning: fullReasoning, usage: streamUsage }));
            resp.on('error', reject);
        });
        httpreq.on('error', reject);
        httpreq.write(JSON.stringify(openaiBody));
        httpreq.end();
    });
}

async function execCmdBackend(cmd: string, shell: string, workDir: string, sandbox?: boolean): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const port = process.env.PORT || '17923';
    try {
        const url = `http://localhost:${port}/api/plugin/CommandExecution/execute`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shell, command: cmd, timeout: 30000, workingDirectory: workDir, sandbox: sandbox !== false }),
        });
        if (res.ok) {
            const d: any = await res.json();
            return { stdout: d.stdout || '', stderr: d.stderr || '', exitCode: d.exitCode };
        }
        return { stdout: '', stderr: await res.text(), exitCode: -1 };
    } catch (e: any) {
        return { stdout: '', stderr: e.message, exitCode: -1 };
    }
}

chatRouter.post('/chat/agent', async (req: Request, res: Response) => {
    const {
        messages, provider, model, temperature, top_p, max_tokens,
        seed, frequency_penalty, presence_penalty, top_k,
        requestId: reqId, maxIterations, workingDirectory, sandbox
    } = req.body;

    const requestId = reqId || 'agent-' + Date.now().toString(36);
    logger.info(`[agent] start: provider=${provider} model=${model} iter=${maxIterations || 10}`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let agentMessages = JSON.parse(JSON.stringify((messages || []).filter((m: any) => m.role)));
    const maxIter = maxIterations || 10;
    const params = { temperature, top_p, max_tokens, seed, frequency_penalty, presence_penalty, top_k };

    const session = { messages: agentMessages, iteration: 0, active: true };
    agentSessions.set(requestId, session);

    try {
        for (let iter = 0; iter < maxIter; iter++) {
            session.iteration = iter;
            res.write('data: ' + JSON.stringify({ type: 'iter_start', iteration: iter }) + '\n\n');

            let fullContent = '';
            let fullReasoning = '';
            try {
                const result = await callLLMStream(agentMessages, provider, model, params, req,
                    (chunk) => {
                        fullContent += chunk;
                        res.write('data: ' + JSON.stringify({ type: 'content', text: chunk, iteration: iter }) + '\n\n');
                    },
                    (chunk) => {
                        fullReasoning += chunk;
                        res.write('data: ' + JSON.stringify({ type: 'reasoning', text: chunk, iteration: iter }) + '\n\n');
                    }
                );
                fullContent = result.content;
                fullReasoning = result.reasoning;
                if (result.usage) {
                    res.write('data: ' + JSON.stringify({ type: 'usage', usage: result.usage, iteration: iter }) + '\n\n');
                }
            } catch (e: any) {
                res.write('data: ' + JSON.stringify({ type: 'error', message: e.message }) + '\n\n');
                break;
            }

            agentMessages.push({ role: 'assistant', content: fullContent });
            res.write('data: ' + JSON.stringify({ type: 'content_done', iteration: iter }) + '\n\n');

            const cmds = parseAgentCommands(fullContent);
            if (cmds.length === 0) {
                res.write('data: ' + JSON.stringify({ type: 'iter_end', iteration: iter, commands: 0 }) + '\n\n');
                break;
            }

            res.write('data: ' + JSON.stringify({ type: 'tool_calls', count: cmds.length, iteration: iter }) + '\n\n');

            for (let ci = 0; ci < cmds.length; ci++) {
                const c = cmds[ci];
                const shellMap: Record<string, string> = { shell: 'shell', powershell: 'powershell', power: 'powershell', cmd: 'cmd', command: 'shell' };
                const shell = shellMap[c.tag] || 'shell';

                res.write('data: ' + JSON.stringify({ type: 'tool_start', idx: ci, cmd: c.cmd, shell }) + '\n\n');

                const result = await execCmdBackend(c.cmd, shell, workingDirectory || '', sandbox);
                const resultStr = (result.stdout || '') + (result.stderr ? '\n' + result.stderr : '') + '\nexit code: ' + result.exitCode;
                agentMessages.push({ role: 'tool', content: resultStr });

                res.write('data: ' + JSON.stringify({
                    type: 'tool_result', idx: ci, cmd: c.cmd,
                    stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode,
                }) + '\n\n');
            }

            res.write('data: ' + JSON.stringify({ type: 'iter_end', iteration: iter, commands: cmds.length }) + '\n\n');
        }
    } catch (e: any) {
        logger.error('[agent] error: ' + e.message);
        res.write('data: ' + JSON.stringify({ type: 'error', message: e.message }) + '\n\n');
    } finally {
        session.active = false;
        res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
        if (!res.writableEnded) res.end();
        setTimeout(() => agentSessions.delete(requestId), 60000);
    }
});

chatRouter.get('/chat/agent/status/:requestId', (req: Request, res: Response) => {
    const session = agentSessions.get(req.params.requestId);
    if (!session) return res.json({ active: false });
    res.json({ active: session.active, iteration: session.iteration, messageCount: session.messages.length });
});
