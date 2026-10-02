import { escapeForInlineScript } from "./cmi";

/**
 * A same-document SCORM RTE shim (SCORM 1.2 window.API and/or 2004 window.API_1484_11), injected
 * into the launch file's HTML so findAPI() succeeds immediately with no frame traversal. Commit
 * and Terminate/Finish relay the current CMI state to the real top page via postMessage, since the
 * launch file runs inside a sandboxed iframe (allow-scripts, no allow-same-origin) that cannot
 * reach window.parent directly.
 */
export function buildScormShim(options: { version: "1.2" | "2004"; seedCmi: Record<string, string> }): string {
  const seed = escapeForInlineScript(options.seedCmi);
  const version = options.version;
  return `<script>(function(){
var CMI = ${seed};
function commit(status){
  try { window.parent.postMessage({ source: "modern-lms-scorm", status: status, cmi: CMI }, "*"); } catch (e) {}
}
var api = {
  Get: function(k){ return Object.prototype.hasOwnProperty.call(CMI, k) ? String(CMI[k]) : ""; },
  Set: function(k, v){ CMI[k] = String(v); return "true"; },
};
${
  version === "1.2"
    ? `window.API = {
  LMSInitialize: function(){ return "true"; },
  LMSFinish: function(){ commit("finish"); return "true"; },
  LMSGetValue: function(k){ return api.Get(k); },
  LMSSetValue: function(k, v){ return api.Set(k, v); },
  LMSCommit: function(){ commit("commit"); return "true"; },
  LMSGetLastError: function(){ return "0"; },
  LMSGetErrorString: function(){ return "No error"; },
  LMSGetDiagnostic: function(){ return ""; },
};`
    : `window.API_1484_11 = {
  Initialize: function(){ return "true"; },
  Terminate: function(){ commit("finish"); return "true"; },
  GetValue: function(k){ return api.Get(k); },
  SetValue: function(k, v){ return api.Set(k, v); },
  Commit: function(){ commit("commit"); return "true"; },
  GetLastError: function(){ return "0"; },
  GetErrorString: function(){ return "No error"; },
  GetDiagnostic: function(){ return ""; },
};`
}
window.addEventListener("beforeunload", function(){ commit("finish"); });
})();</script>`;
}

/** Inserts the shim right after <head> (or at the very start of the document as a fallback). */
export function injectShim(html: string, shim: string): string {
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = headMatch.index! + headMatch[0].length;
    return html.slice(0, idx) + shim + html.slice(idx);
  }
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const idx = htmlMatch.index! + htmlMatch[0].length;
    return html.slice(0, idx) + shim + html.slice(idx);
  }
  return shim + html;
}
