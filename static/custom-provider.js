"use strict";
var CustomProvider = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // fold/static/custom-provider.ts
  var custom_provider_exports = {};
  __export(custom_provider_exports, {
    deleteCustomProvider: () => deleteCustomProvider,
    getCustomProviderSectionHtml: () => getCustomProviderSectionHtml,
    initCustomProviders: () => initCustomProviders,
    showConfirmDialog: () => showConfirmDialog,
    showCustomProviderForm: () => showCustomProviderForm,
    wrapFileOperations: () => wrapFileOperations
  });
  var CUSTOM_PROVIDERS_KEY = "fold_custom_providers";
  function getCustomProviders() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_PROVIDERS_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveCustomProviders(list) {
    localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(list));
    saveSettingsToLocal();
  }
  function getCustomProviderSectionHtml() {
    const customs = getCustomProviders();
    var titleBar = '<div class="section-title" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;"><span>\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546</span><button id="addCustomProviderBtn" style="border:none;background:transparent;color:#1a6bc0;cursor:pointer;font-size:12px;font-family:inherit;">+ \u65B0\u589E</button></div>';
    if (!customs.length) {
      return '<div id="customProvSection">' + titleBar + '<div style="font-size:13px;color:#999;padding:6px 0;">\u6682\u65E0\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546</div></div>';
    }
    var h = '<div id="customProvSection">' + titleBar + '<div class="provider-grid">';
    customs.forEach(function(cp) {
      h += '<div class="provider-card" data-id="' + cp.id + '" style="position:relative;"><button class="del-custom-provider" data-id="' + cp.id + '" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,0.08);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;line-height:1;padding:0;z-index:1;" title="\u5220\u9664">\xD7</button><div class="prov-icon">' + (cp.icon ? '<img src="' + cp.icon + '">' : cp.name.charAt(0)) + '</div><div class="provider-name">' + escapeHtml(cp.name) + "</div></div>";
    });
    h += "</div></div>";
    return h;
  }
  function showConfirmDialog(message) {
    return new Promise((resolve) => {
      const existing = document.querySelector(".custom-confirm-overlay");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.className = "custom-confirm-overlay";
      overlay.innerHTML = '<div class="custom-confirm-dialog"><div class="custom-confirm-message">' + message + '</div><div class="custom-confirm-actions"><button class="custom-confirm-btn cancel">\u53D6\u6D88</button><button class="custom-confirm-btn confirm">\u786E\u5B9A</button></div></div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("active"));
      overlay.querySelector(".confirm")?.addEventListener("click", () => {
        overlay.classList.remove("active");
        setTimeout(() => {
          overlay.remove();
          resolve(true);
        }, 200);
      });
      overlay.querySelector(".cancel")?.addEventListener("click", () => {
        overlay.classList.remove("active");
        setTimeout(() => {
          overlay.remove();
          resolve(false);
        }, 200);
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.classList.remove("active");
          setTimeout(() => {
            overlay.remove();
            resolve(false);
          }, 200);
        }
      });
    });
  }
  function showCustomProviderForm() {
    const existing = document.querySelector(".custom-provider-form-wrapper");
    if (existing) existing.remove();
    const wrapper = document.createElement("div");
    wrapper.className = "custom-provider-form-wrapper";
    wrapper.innerHTML = '<div class="custom-provider-form-container"><div class="custom-provider-form-header"><h2>\u65B0\u589E\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546</h2><button class="custom-provider-form-close">\u2715</button></div><div class="custom-provider-form-body"><div class="cpf-field"><label>\u63D0\u4F9B\u5546\u540D\u79F0</label><input type="text" id="cpfName" placeholder="\u4F8B\u5982: MyAI" class="cpf-input"></div><div class="cpf-field"><label>\u804A\u5929 URL</label><input type="text" id="cpfUrl" placeholder="https://api.example.com/v1/chat/completions" class="cpf-input"></div><div class="cpf-field"><label>\u6A21\u578B\u5217\u8868 URL</label><input type="text" id="cpfModelsUrl" placeholder="https://api.example.com/v1/models" class="cpf-input"></div><div class="cpf-field"><label>\u56FE\u6807 URL</label><input type="text" id="cpfIcon" value="https://registry.npmmirror.com/@lobehub/icons-static-svg/1.79.0/files/icons/deepseek.svg" class="cpf-input"></div><div class="cpf-field"><label>API \u683C\u5F0F</label><select id="cpfFormat" class="cpf-input" style="appearance:auto;cursor:pointer;"><option value="OpenAI">OpenAI</option><option value="Anthropic">Anthropic</option></select></div><button id="cpfConfirmBtn" class="cpf-confirm-btn">\u786E\u8BA4\u6DFB\u52A0</button></div></div>';
    document.body.appendChild(wrapper);
    requestAnimationFrame(() => wrapper.classList.add("active"));
    const close = () => {
      wrapper.classList.remove("active");
      setTimeout(() => {
        wrapper.remove();
      }, 300);
    };
    wrapper.querySelector(".custom-provider-form-close")?.addEventListener("click", close);
    document.getElementById("cpfConfirmBtn")?.addEventListener("click", () => {
      const name = document.getElementById("cpfName").value.trim();
      const url = document.getElementById("cpfUrl").value.trim();
      const modelsUrl = document.getElementById("cpfModelsUrl").value.trim();
      const icon = document.getElementById("cpfIcon").value.trim();
      const format = document.getElementById("cpfFormat").value;
      if (!name || !url) {
        showToast("\u63D0\u4F9B\u5546\u540D\u79F0\u548C\u804A\u5929 URL \u4E3A\u5FC5\u586B");
        return;
      }
      const id = "custom_" + name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const list = getCustomProviders();
      if (list.find((p) => p.id === id)) {
        showToast("\u8BE5\u540D\u79F0\u5DF2\u5B58\u5728");
        return;
      }
      list.push({ id, name, url, modelsUrl, icon, chatFormat: format });
      saveCustomProviders(list);
      showToast("\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546\u5DF2\u6DFB\u52A0");
      close();
      setTimeout(() => {
        var ov = document.getElementById("drawerOverlay");
        if (ov && ov.classList.contains("active")) {
          var od = window.openDrawer;
          if (od) setTimeout(od, 100);
        }
      }, 300);
    });
  }
  async function deleteCustomProvider(id) {
    const confirmed = await showConfirmDialog("\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546\u5417\uFF1F");
    if (!confirmed) return;
    const list = getCustomProviders().filter((p) => p.id !== id);
    saveCustomProviders(list);
    const openDrawer = window.openDrawer;
    if (openDrawer) openDrawer();
    showToast("\u5DF2\u5220\u9664");
  }
  function initCustomProviders() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest(".del-custom-provider")) {
        const btn = target.closest(".del-custom-provider");
        deleteCustomProvider(btn.dataset.id || "");
      }
      if (target.id === "addCustomProviderBtn") {
        showCustomProviderForm();
      }
    });
  }
  function wrapFileOperations() {
    const origFetch = window.fetch;
    document.addEventListener("click", async (e) => {
      const target = e.target;
      if (target.closest("[data-wd-delete]")) {
        e.preventDefault();
        const path = target.closest("[data-wd-delete]").dataset.wdDelete || "";
        const ok = await showConfirmDialog("\u786E\u5B9A\u5220\u9664 " + path + " \uFF1F");
        if (ok) {
          fetch("/api/files/delete?file=" + encodeURIComponent(path), { method: "DELETE" }).then((r) => {
            if (r.ok) {
              showToast("\u5DF2\u5220\u9664");
              window.loadDirectoryForTab?.("/");
            } else showToast("\u5220\u9664\u5931\u8D25");
          }).catch(() => showToast("\u5220\u9664\u5931\u8D25"));
        }
      }
    });
  }
  window.showCustomProviderForm = showCustomProviderForm;
  window.showConfirmDialog = showConfirmDialog;
  return __toCommonJS(custom_provider_exports);
})();
