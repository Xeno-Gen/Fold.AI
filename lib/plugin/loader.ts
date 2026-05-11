import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getProviders, getUserProviderKey, getUserProviderUrl } from '../routes/providers';
import { getUserConfig, saveUserConfig } from '../user/manager';
import { logger } from '../logger';

const PLUGIN_DIR = path.join(__dirname, '../../Plugin');
const PLUGIN_DATA_DIR = path.join(__dirname, '../../data/plugin_data');

export interface PluginContext {
    pluginId: string;
    pluginDir: string;
    dataDir: string;
    manifest: any;
    logger: typeof logger;
    getUserProviderKey: (userToken: string, providerId: string) => string | null;
    getUserProviderUrl: (providerId: string) => string | null;
    getProviders: () => any[];
    getUserConfig: (userToken: string) => any;
    saveUserConfig: (userToken: string, config: any) => void;
}

export interface LoadedPlugin {
    id: string;
    manifest: any;
    router: Router;
    handlers: Record<string, (req: any, res: any) => void | Promise<void>>;
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function buildContext(pluginId: string, pluginDir: string, manifest: any): PluginContext {
    const dataDir = path.join(PLUGIN_DATA_DIR, pluginId);
    ensureDir(dataDir);

    return {
        pluginId,
        pluginDir,
        dataDir,
        manifest,
        logger,
        getUserProviderKey,
        getUserProviderUrl,
        getProviders,
        getUserConfig,
        saveUserConfig,
    };
}

function loadPluginServer(pluginId: string, pluginDir: string, manifest: any): LoadedPlugin | null {
    const serverPath = path.join(pluginDir, 'server.js');
    if (!fs.existsSync(serverPath)) {
        logger.info(`plugin ${pluginId}: no server.js, frontend-only`);
        return null;
    }

    // Clear require cache for dev mode reloading
    delete require.cache[require.resolve(serverPath)];

    let pluginModule: any;
    try {
        pluginModule = require(serverPath);
    } catch (e: any) {
        logger.error(`plugin ${pluginId}: failed to load server.js: ${e.message}`);
        return null;
    }

    const context = buildContext(pluginId, pluginDir, manifest);

    let router: Router;
    let handlers: Record<string, (req: any, res: any) => void | Promise<void>> = {};

    try {
        if (typeof pluginModule === 'function') {
            // module.exports = function(context) { return router; }
            // or: module.exports = function(context) { return { router, ...handlers }; }
            const result = pluginModule(context);
            if (result && typeof result === 'object' && 'router' in result) {
                router = result.router;
            } else if (result && typeof result === 'object' && (result as any).stack) {
                // Express Router has a .stack property
                router = result;
            } else {
                logger.error(`plugin ${pluginId}: server.js export function did not return a router or { router, ... }`);
                return null;
            }
            // Collect named handler functions
            if (result && typeof result === 'object') {
                for (const key of Object.keys(result)) {
                    if (key !== 'router' && typeof result[key] === 'function') {
                        handlers[key] = result[key];
                    }
                }
            }
        } else if (typeof pluginModule === 'object' && pluginModule !== null) {
            // module.exports = { router, init?, ... }
            if (pluginModule.router && (pluginModule.router as any).stack) {
                router = pluginModule.router;
            } else {
                logger.error(`plugin ${pluginId}: server.js export object has no router property`);
                return null;
            }
            if (typeof pluginModule.init === 'function') {
                pluginModule.init(context);
            }
            for (const key of Object.keys(pluginModule)) {
                if (key !== 'router' && key !== 'init' && typeof pluginModule[key] === 'function') {
                    handlers[key] = pluginModule[key];
                }
            }
        } else {
            logger.error(`plugin ${pluginId}: server.js must export a function or { router, ... }`);
            return null;
        }
    } catch (e: any) {
        logger.error(`plugin ${pluginId}: failed to initialize: ${e.message}`);
        return null;
    }

    logger.info(`plugin ${pluginId}: loaded (v${manifest.version || '?'})`);
    return { id: pluginId, manifest, router, handlers };
}

export function initPlugins(pluginsRouter: Router): Map<string, LoadedPlugin> {
    const loaded = new Map<string, LoadedPlugin>();

    if (!fs.existsSync(PLUGIN_DIR)) {
        logger.warn('Plugin directory not found: ' + PLUGIN_DIR);
        return loaded;
    }

    const entries = fs.readdirSync(PLUGIN_DIR, { withFileTypes: true });
    const pluginFolders = entries.filter(e => e.isDirectory());

    for (const folder of pluginFolders) {
        const manifestPath = path.join(PLUGIN_DIR, folder.name, 'plugin.json');
        if (!fs.existsSync(manifestPath)) {
            logger.warn(`plugin directory ${folder.name} has no plugin.json, skipping`);
            continue;
        }

        let manifest: any;
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        } catch {
            logger.warn(`plugin ${folder.name}: invalid plugin.json, skipping`);
            continue;
        }

        const pluginId = manifest.id || folder.name;
        if (!manifest.id) {
            logger.warn(`plugin ${folder.name}: plugin.json missing "id" field, using folder name`);
        }

        if (loaded.has(pluginId)) {
            logger.warn(`plugin ${pluginId}: duplicate id, skipping`);
            continue;
        }

        const pluginDir = path.join(PLUGIN_DIR, folder.name);
        const loadedPlugin = loadPluginServer(pluginId, pluginDir, manifest);

        if (loadedPlugin) {
            loaded.set(pluginId, loadedPlugin);
            // Mount plugin router at /plugin/:id
            pluginsRouter.use('/plugin/' + pluginId, loadedPlugin.router);
        } else {
            // Frontend-only plugin: still register it so manifest is available
            loaded.set(pluginId, {
                id: pluginId,
                manifest,
                router: Router(),
                handlers: {},
            });
        }
    }

    // Backward compat: /api/plugin/command/execute → CommandExecution plugin
    const cmdExec = loaded.get('CommandExecution');
    if (cmdExec?.handlers?.execute) {
        const executeHandler = cmdExec.handlers.execute;
        pluginsRouter.post('/plugin/command/execute', (req, res) => {
            executeHandler(req, res);
        });
        logger.info('registered backward compat route: POST /plugin/command/execute');
    }

    // Also register backward compat for detect and generate
    if (cmdExec?.handlers?.detect) {
        pluginsRouter.post('/plugin/detect', (req, res) => {
            cmdExec.handlers.detect(req, res);
        });
    }
    if (cmdExec?.handlers?.generate) {
        pluginsRouter.post('/plugin/command/generate', (req, res) => {
            cmdExec.handlers.generate(req, res);
        });
    }

    logger.info(`plugin platform: ${loaded.size} plugin(s) loaded`);
    return loaded;
}
