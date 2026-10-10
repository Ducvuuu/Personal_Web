let enginePromise;
function loadScript(filename) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(filename, window.location.href).href;
    script.onload = resolve;
    script.onerror = () =>
      reject(
        new Error(
          `Could not load ${filename}. Check your connection and reload.`,
        ),
      );
    document.body.appendChild(script);
  });
}
export function mountReaderEngine() {
  // React mounts the controls once. The existing engines own the EPUB iframe and
  // their DOM state, avoiding React rerenders during pagination and RSVP playback.
  if (!enginePromise) {
    enginePromise = loadScript("reader.js").then(() => loadScript("rsvp.js"));
    window.readerReactReady = enginePromise;
  }
  return enginePromise;
}
