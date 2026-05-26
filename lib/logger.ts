const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let level = LEVELS.INFO;
const MAX_LINE = 300;
let expanded = false;

try {
    const readline = require('readline');
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf-8');
        readline.emitKeypressEvents(process.stdin);
        process.stdin.on('keypress', (_ch: string, key: any) => {
            if (key && key.name === 'f1') {
                expanded = !expanded;
                const status = expanded ? 'EX' : 'TR';
                console.log('\n[TERM] line mode: ' + status + ' (' + MAX_LINE + ' chars)');
            }
        });
        process.on('exit', () => { try { process.stdin.setRawMode(false); } catch (e) {} });
    }
} catch (e) {}

function ts(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function truncate(msg: string): string {
    if (!expanded && msg.length > MAX_LINE) {
        return msg.substring(0, MAX_LINE - 3) + '...';
    }
    return msg;
}

function formatAndLog(levelTag: string, consoleFn: (...args: any[]) => void, msg: string) {
    const full = '[' + ts() + '] [' + levelTag + '] ' + msg;
    const display = truncate(full);
    consoleFn(display);
}

export const logger = {
    info: (msg: string) => { if (level <= LEVELS.INFO) formatAndLog('INFO', console.log, msg); },
    warn: (msg: string) => { if (level <= LEVELS.WARN) formatAndLog('WARN', console.warn, msg); },
    error: (msg: string) => { if (level <= LEVELS.ERROR) formatAndLog('ERROR', console.error, msg); },
    debug: (msg: string) => { if (level <= LEVELS.DEBUG) formatAndLog('DEBUG', console.log, msg); },
    setLevel: (l: keyof typeof LEVELS) => { level = LEVELS[l]; }
};
