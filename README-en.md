# Fold.AI

[![Node.js](https://img.shields.io/badge/Node.js-v20--v25.9.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-orange)](#license)
[![npx](https://img.shields.io/badge/npx-11.12.1-blue?logo=npm)](https://www.npmjs.com/package/npx)

### A lightweight, portable, cross-platform AI Web GUI client
### Balancing roleplay, memory, and independent encoding — no prompt contamination
### Delivering the purest and most native model performance

## README in Different Languages
[English README](https://github.com/Xeno-Gen/Fold.AI/edit/main/README-en.md)
[简体中文 README](https://github.com/Xeno-Gen/Fold.AI)

## Implemented Plugin Types
**1. Memory (implemented in v0.2.0)** <br>
The model can autonomously choose memories to write, which will take effect across all conversations — provided you have the memory toolchain enabled rather than disabled.<br>
**2. Command Execution (implemented in v0.2.0)** <br>
The model can autonomously execute CMD commands and PowerShell commands, also compatible on Linux platforms.<br>
**3. Agent (implemented in v0.2.1)** <br>
The model autonomously chooses to append additional outputs, such as invoking follow-up calls after receiving information.<br>
**4. Legacy Execution Compression (implemented in v0.2.2)** <br>
Compresses old execution returns from historical conversations.<br>
**5. File Operations (implemented in v0.2.2)** <br>
More refined file operations.

## Installation
Currently, `Fold.ai` is not available on any package manager platform. Release versions are built as native JavaScript and can be run directly using Node.js.
```
# 1. Manually build project dependencies
cd fold
npm install
Node bin/server.js

# 2. Windows users can use `依赖安装.bat` for one-click startup
Double-click the .bat file

# 3. Linux / macOS users can use the .sh script for dependency installation and startup
Double-click the .sh file
```

## 🤝 Contributing

Issues and PRs are welcome!

## 📄 License

MIT © 2026 Fold.AI Contributors

**⭐ If you find this "20-minute project" interesting, please give it a Star!**
