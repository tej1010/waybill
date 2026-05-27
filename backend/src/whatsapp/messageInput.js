export function extractMessageInput(message) {
  if (message.type === "text" && message.text?.body) {
    return { input: message.text.body.trim(), kind: "text" };
  }

  if (message.type === "interactive" && message.interactive) {
    const interactive = message.interactive;
    if (interactive.type === "button_reply" && interactive.button_reply?.id) {
      return {
        input: interactive.button_reply.id,
        kind: "button",
        title: interactive.button_reply.title,
      };
    }
    if (interactive.type === "list_reply" && interactive.list_reply?.id) {
      return {
        input: interactive.list_reply.id,
        kind: "list",
        title: interactive.list_reply.title,
      };
    }
  }

  return { input: null, kind: "unknown" };
}
