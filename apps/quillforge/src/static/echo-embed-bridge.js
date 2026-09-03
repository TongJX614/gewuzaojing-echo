(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (typeof globalThis === 'object') {
    globalThis.EchoEmbedBridge = api;
    api.createEmbedBridge({
      windowRef: globalThis,
      documentRef: globalThis.document,
    }).install();
  }
})(function () {
  'use strict';

  function createEmbedBridge(dependencies) {
    const windowRef = dependencies.windowRef;
    const documentRef = dependencies.documentRef;
    let installed = false;

    function send(type) {
      windowRef.parent.postMessage({ type }, '*');
    }

    function announceReady() {
      send('quillforge:ready');
    }

    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      send('echo:pause-request');
    }

    function onMessage(event) {
      if (event.source !== windowRef.parent) return;
      const type = event.data && event.data.type;
      if (type !== 'echo:pause' && type !== 'echo:resume') return;
      documentRef.documentElement.dataset.echoPaused =
        type === 'echo:pause' ? 'true' : 'false';
      const EventConstructor =
        documentRef.defaultView && documentRef.defaultView.CustomEvent;
      if (EventConstructor) {
        documentRef.dispatchEvent(new EventConstructor(type));
      }
    }

    function install() {
      if (installed || windowRef.parent === windowRef) return false;
      installed = true;
      windowRef.addEventListener('keydown', onKeydown, true);
      windowRef.addEventListener('message', onMessage);
      if (documentRef.readyState === 'loading') {
        documentRef.addEventListener(
          'DOMContentLoaded',
          announceReady,
          { once: true },
        );
      } else {
        announceReady();
      }
      return true;
    }

    function destroy() {
      if (!installed) return;
      installed = false;
      windowRef.removeEventListener('keydown', onKeydown, true);
      windowRef.removeEventListener('message', onMessage);
      documentRef.removeEventListener('DOMContentLoaded', announceReady);
    }

    return Object.freeze({ install, destroy });
  }

  return Object.freeze({ createEmbedBridge });
});
