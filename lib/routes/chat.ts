import { Router, Request, Response } from 'express';
import { getUserConfig } from '../user/manager';
import { getUserProviderKey, getUserProviderUrl } from './providers';

export const chatRouter = Router();

chatRouter.post('/chat', async (req: Request, res: Response) => {
    try {
        const { messages, provider, model, temperature, top_p, max_tokens, seed, frequency_penalty, presence_penalty, top_k, stop, stream } = req.body;
        const userConfig = getUserConfig(req.userToken!);

        let apiKey: string | null = null;
        let baseUrl: string | null = null;

        if (provider) {
            apiKey = getUserProviderKey(req.userToken!, provider);
            baseUrl = getUserProviderUrl(provider);
            if (!apiKey || !baseUrl) {
                return res.status(400).json({ error: '提供商未配置或密钥缺失' });
            }
        } else {
            return res.status(400).json({ error: '未选择模型提供商' });
        }

        const params = userConfig.defaultParams;
        // 构建消息数组，若存在系统提示词则添加
        const finalMessages = [...(messages || [])];
        if (userConfig.systemPrompt) {
            finalMessages.unshift({ role: "system", content: userConfig.systemPrompt });
        }

        const requestBody: any = {
            model: model || userConfig.currentModel || 'deepseek-v4-flash',
            messages: finalMessages,
            temperature: temperature ?? params.temperature,
            top_p: top_p ?? params.top_p,
            max_tokens: max_tokens ?? params.max_tokens,
            stream: stream ?? false,
        };
        if (seed !== null && seed !== undefined) requestBody.seed = seed;
        else if (params.seed !== null) requestBody.seed = params.seed;
        if (frequency_penalty !== undefined) requestBody.frequency_penalty = frequency_penalty;
        else requestBody.frequency_penalty = params.frequency_penalty;
        if (presence_penalty !== undefined) requestBody.presence_penalty = presence_penalty;
        else requestBody.presence_penalty = params.presence_penalty;
        if (top_k !== null && top_k !== undefined) requestBody.top_k = top_k;
        else if (params.top_k !== null) requestBody.top_k = params.top_k;
        if (stop) requestBody.stop = stop;

        const upstreamResponse = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!upstreamResponse.ok) {
            const err = await upstreamResponse.text();
            return res.status(upstreamResponse.status).json({ error: err });
        }

        if (requestBody.stream) {
            // 流式传输
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = upstreamResponse.body?.getReader();
            if (!reader) return res.status(500).json({ error: '无响应流' });
            const decoder = new TextDecoder();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(decoder.decode(value, { stream: true }));
                }
            } catch (e) {
                console.error('流传输中断', e);
            } finally {
                res.end();
            }
        } else {
            const data = await upstreamResponse.json();
            const content = data.choices?.[0]?.message?.content || '';
            res.json({ content });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});