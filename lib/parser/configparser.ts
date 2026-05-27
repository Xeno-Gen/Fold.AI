import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(__dirname, '../../Config');

/**
 * 从 config/prompts/ 目录读取 .md 文件，按文件名排序拼接为系统提示词
 */
export function getSystemPrompt(): string {
    const promptsDir = path.join(CONFIG_DIR, 'prompts');
    if (!fs.existsSync(promptsDir)) return '';
    const files = fs.readdirSync(promptsDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    return files.map(f => {
        return fs.readFileSync(path.join(promptsDir, f), 'utf-8').trimEnd();
    }).join('\n');
}

/**
 * 从 config/Plugin/ 目录读取 .md 文件，返回键值对 { 文件名: 内容 }
 */
export function getPluginPrompts(): Record<string, string> {
    const pluginDir = path.join(CONFIG_DIR, 'Plugin');
    const guidelineDir = path.join(CONFIG_DIR, 'guidelines');
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
