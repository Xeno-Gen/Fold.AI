# Fold.AI


[![Node.js](https://img.shields.io/badge/Node.js-v20--v25.9.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-orange)](#license)

# A lightweight, portable, cross-platform AI Web GUI client
## Balancing roleplay, memory, and independent encoding, with no prompt contamination

## README in Different Languages
[English README](https://github.com/Xeno-Gen/Fold.AI/edit/main/README-en.md)
[简体中文 README](https://github.com/Xeno-Gen/Fold.AI)

## Implemented Plugin Types
**1. Memory (implemented in v0.2.0)** <br>
The model can autonomously choose memories to write. These memories take effect across all conversations, provided you have the memory toolchain enabled rather than disabled.<br>
**2. Command Execution (implemented in v0.2.0)** <br>
The model can autonomously execute Cmd commands and PowerShell commands, with compatibility on Linux platforms as well.<br>
**3. Agent (implemented in v0.2.1)** <br>
The model autonomously chooses to append additional output, such as making follow-up calls after obtaining information.<br>
**4. Legacy Execution Compression (implemented in v0.2.2)** <br>
Compresses the return values of old executions from the conversation history.<br>
**5. File Operations (implemented in v0.2.2)** <br>
More refined file operations.

## Installation
Currently, `Fold.ai` is not available on any package manager platform. The release builds have been constructed as native JavaScript and can be run directly using Node.js.
```
#1. Build project dependencies manually
cd fold
npm install
Node bin/server.js

#2. Windows users can use `Dependency_Install.bat` for one-click startup
Double-click the .bat file

#3. Linux / macOS users can use the .sh script for dependency installation and startup
Double-click the .sh file
```

## 🤝 Contributing

Issues and PRs are welcome!

## 📄 License

MIT © 2026 Fold.AI Contributors

**⭐ If this "20-minute creation" caught your interest, please give it a Star!**
