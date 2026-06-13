import { Router, Request, Response } from 'express';
import { getUserConfig, saveUserConfig, getDefaultSystemPrompt } from '../user/manager';
import { getSystemPrompt, getPluginPrompts } from '../parser/configparser';
import { systemVersion } from './chat';
import path from 'path';
import fs from 'fs';

export const configRouter = Router();
let globalDefaultParams: any = {};

export function setDefaultParams(params: any) {
    globalDefaultParams = { ...params };
}

// 默认工作目录：使用 process.cwd()（用户实际的工作目录）
export function getDefaultWorkDir(): string {
    return process.cwd();
}

// 粗略估算 token 数（中英文混合估算）
function estimateTokens(text: string): number {
    if (!text) return 0;
    let tokens = 0;
    for (const char of text) {
        // 中文字符范围
        if (/[一-鿿㐀-䶿豈-﫿]/.test(char)) {
            tokens += 0.6;
        } else {
            tokens += 0.25; // 英文字符约 0.25 tokens (4字符=1 token)
        }
    }
    return Math.ceil(tokens);
}

configRouter.get('/config', (req: Request, res: Response) => {
    const userConfig = getUserConfig(req.userToken!);
    const keysStatus: Record<string, boolean> = {};
    for (const [provider, keys] of Object.entries(userConfig.providerKeys)) {
        keysStatus[provider] = Array.isArray(keys) && keys.length > 0;
    }
    const promptLang = userConfig.promptLang || 'zh';
    const baseSystemPrompt = getSystemPrompt(promptLang);
    res.json({
        defaultParams: userConfig.defaultParams,
        currentProvider: userConfig.currentProvider,
        currentModel: userConfig.currentModel,
        customPort: userConfig.customPort,
        providerKeys: keysStatus,
        systemPrompt: userConfig.systemPrompt || '',
        chatFormat: userConfig.chatFormat || '',
        pureMode: userConfig.pureMode || false,
        systemVersion: systemVersion,
        baseSystemPrompt: baseSystemPrompt,
        baseSystemTokenCount: estimateTokens(baseSystemPrompt),
        pluginPrompts: getPluginPrompts(promptLang),
        workDir: getDefaultWorkDir(),
        promptLang: promptLang,
    });
});

configRouter.post('/config', (req: Request, res: Response) => {
    const { defaultParams, currentProvider, currentModel, customPort, systemPrompt, chatFormat, pureMode, promptLang } = req.body;
    const userConfig = getUserConfig(req.userToken!);
    if (defaultParams) {
        userConfig.defaultParams = { ...userConfig.defaultParams, ...defaultParams };
    }
    if (currentProvider !== undefined) userConfig.currentProvider = currentProvider;
    if (currentModel !== undefined) userConfig.currentModel = currentModel;
    if (customPort !== undefined) userConfig.customPort = customPort;
    if (systemPrompt !== undefined) userConfig.systemPrompt = systemPrompt;
    if (chatFormat !== undefined) userConfig.chatFormat = chatFormat;
    if (pureMode !== undefined) userConfig.pureMode = pureMode;
    if (promptLang !== undefined) userConfig.promptLang = promptLang;
    saveUserConfig(req.userToken!, userConfig);
    res.json({ success: true });
});

// 提供思考模式配置文件（.md 格式）
configRouter.get('/config/:file', (req: Request, res: Response) => {
    const fileName = req.params.file;
    // Only allow specific files for security
    if (fileName !== 'DeepThink.md' && fileName !== 'Medit.md') {
        return res.status(404).json({ error: '未找到配置文件' });
    }
    const configDir = path.join(__dirname, '../../config');
    const filePath = path.join(configDir, fileName);
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '配置文件不存在' });
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        // Return as JSON with the content in a "think" field for compatibility
        res.json({ think: content });
    } catch (e) {
        res.status(500).json({ error: '读取配置文件失败' });
    }
});