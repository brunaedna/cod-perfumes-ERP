export const EXTENSION_MESSAGE_SOURCE = "cod-wa-extension";
export const EXTENSION_MESSAGE_TYPE = "SALE_MESSAGES";

export function bindExtensionBridge(onMessages) {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== EXTENSION_MESSAGE_SOURCE || data.type !== EXTENSION_MESSAGE_TYPE) return;

    const messages = Array.isArray(data.messages) ? data.messages : [data.message].filter(Boolean);
    if (messages.length) onMessages(messages, data.meta || {});
  });
}

export function sendMessagesToErp(messages, meta = {}) {
  window.postMessage(
    {
      source: EXTENSION_MESSAGE_SOURCE,
      type: EXTENSION_MESSAGE_TYPE,
      messages,
      meta,
    },
    window.location.origin,
  );
}
