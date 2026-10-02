/** Reserved path the SCORM route answers with buildHostFrame (never a package file: not in file_paths). */
export const HOST_FRAME_PATH = "__lms_frame.html";

/**
 * The page SCORM drivers expect to find the API in: most (e.g. Rustici's scormdriver, used by
 * Storyline) follow the ADL search and look in window.parent, never in their own window. It holds
 * the shim and loads the launch file in a child frame; commits from a shim injected into the child
 * (for drivers that do check their own window) are relayed up too, so both reach the player.
 */
export function buildHostFrame(options: { shim: string; launchPath: string }): string {
  const src = options.launchPath.split("/").map(encodeURIComponent).join("/");
  return `<!doctype html><html><head><meta charset="utf-8">${options.shim}
<style>html,body{margin:0;height:100%;overflow:hidden;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style>
</head><body><iframe id="sco" src="${src}" allow="autoplay; fullscreen" title="Course content"></iframe>
<script>(function(){
var sco = document.getElementById("sco");
window.addEventListener("message", function(e){
  if (e.source === sco.contentWindow && e.data && e.data.source === "modern-lms-scorm") {
    try { window.parent.postMessage(e.data, "*"); } catch (err) {}
  }
});
})();</script></body></html>`;
}
