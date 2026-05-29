import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(__dirname, '../../Config');

function getLangBase(lang?: string): string {
    if (lang === 'en') {
        const enDir = path.join(CONFIG_DIR, 'En');
        if (fs.existsSync(enDir)) return enDir;
    }
    // Default to Chinese
    const zhDir = path.join(CONFIG_DIR, 'Zh');
    if (fs.existsSync(zhDir)) return zhDir;
    return CONFIG_DIR;
}

/**
 * 从 config/Zh/prompts/ 或 config/En/prompts/ 目录读取 .md 文件，按文件名排序拼接
 * @param lang 语言代码：'zh' 或 'en'，默认 'zh'
 */
export function getSystemPrompt(lang?: string): string {
    const promptsDir = path.join(getLangBase(lang), 'prompts');
    if (!fs.existsSync(promptsDir)) return '';
    const files = fs.readdirSync(promptsDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    return files.map(f => {
        return fs.readFileSync(path.join(promptsDir, f), 'utf-8').trimEnd();
    }).join('\n');
}

/**
 * 从 config/Zh|En/Plugin/、config/Zh|En/guidelines/ 目录读取 .md 文件
 * @param lang 语言代码：'zh' 或 'en'，默认 'zh'
 */
export function getPluginPrompts(lang?: string): Record<string, string> {
    const baseDir = getLangBase(lang);
    const pluginDir = path.join(baseDir, 'Plugin');
    const guidelineDir = path.join(baseDir, 'guidelines');
    const result: Record<string, string> = {};
    if (fs.existsSync(pluginDir)) {
        for (const f of fs.readdirSync(pluginDir).filter(f => f.endsWith('.md'))) {
            result[f.replace(/\.md$/, '')] = fs.readFileSync(path.join(pluginDir, f), 'utf-8').trimEnd();
        }
    }
    if (fs.existsSync(guidelineDir)) {
        for (const f of fs.readdirSync(guidelineDir).filter(f => f.endsWith('.md'))) {
            result[f.replace(/\.md$/, '')] = fs.readFileSync(path.join(guidelineDir, f), 'utf-8').trimEnd();
        }
    }
    return result;
}