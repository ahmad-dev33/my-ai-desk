const richTextToText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const inline = value.every((node) => node && typeof node === 'object' && ('text' in node || node.type === 'hardBreak'));
    return value.map(richTextToText).filter(Boolean).join(inline ? '' : '\n');
  }
  if (typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (value.type === 'hardBreak') return '\n';
  if (value.children) return richTextToText(value.children);
  if (value.content) return richTextToText(value.content);
  if (value.richText) return richTextToText(value.richText);
  return '';
};

export const extractTypebotReplies = (payload) => (payload.messages || [])
  .map((message) => {
    const content = message?.content ?? message;
    return richTextToText(content?.richText ?? content?.plainText ?? content?.text ?? content).trim();
  })
  .filter(Boolean);
