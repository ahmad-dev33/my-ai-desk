export function getIncomingMessage(body) {
  if (body?.event !== 'message_created') return null;
  const type = body.message_type ?? body.message?.message_type;
  if (!(type === 'incoming' || type === 0 || type === '0')) return null;
  if (body.private || body.message?.private) return null;

  const content = body.content ?? body.message?.content;
  const accountId = body.account?.id ?? body.account_id ?? body.message?.account_id;
  const conversationId = body.conversation?.id ?? body.conversation_id ?? body.message?.conversation_id;
  const inboxId = body.inbox?.id ?? body.conversation?.inbox_id ?? body.inbox_id ?? body.message?.inbox_id;
  const messageId = body.id ?? body.message?.id;
  if (!content || !accountId || !inboxId || !conversationId || !messageId) return null;
  return {
    content: String(content), accountId: String(accountId), inboxId: String(inboxId),
    conversationId: String(conversationId), messageId: String(messageId),
  };
}

