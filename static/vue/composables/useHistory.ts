import { chats, chatTitles, chatTokens, currentChat } from '../state';
import { useI18n } from './useI18n';

const { t } = useI18n();

export function useHistory() {
  async function loadChatsFromBackend(embeddedToken?: string) {
    try {
      const r = await fetch('/api/chats');
      if (!r.ok) return;
      const chatList = await r.json();
      if (!Array.isArray(chatList) || chatList.length === 0) return;

      const newChats: any[][] = [];
      const newTitles: string[] = [];
      const newTokens: string[] = [];

      for (const c of chatList) {
        newTitles.push(c.title || '');
        newTokens.push(c.token || '');
        try {
          const msgR = await fetch('/api/chat/' + c.id);
          if (msgR.ok) {
            const chatData = await msgR.json();
            newChats.push(chatData.messages || []);
          } else {
            newChats.push([]);
          }
        } catch {
          newChats.push([]);
        }
      }

      chats.value = newChats;
      chatTitles.value = newTitles;
      chatTokens.value = newTokens;

      if (embeddedToken) {
        const idx = newTokens.indexOf(embeddedToken);
        if (idx >= 0) currentChat.value = idx;
      }
    } catch (e) {
      console.error('Failed to load chats', e);
    }
  }

  async function saveChatToBackend(chatId?: number) {
    const id = chatId ?? currentChat.value;
    if (id < 0 || id >= chats.value.length) return;
    try {
      await fetch('/api/chat/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chatTitles.value[id] || '',
          messages: chats.value[id] || [],
          token: chatTokens.value[id] || '',
        }),
      });
    } catch (e) {
      console.error('Failed to save chat', e);
    }
  }

  async function newChatOnServer(): Promise<{ id: number; token: string } | null> {
    try {
      const r = await fetch('/api/chats', { method: 'POST' });
      if (r.ok) {
        return await r.json();
      }
    } catch {}
    return null;
  }

  async function deleteChatFromBackend(id: number) {
    try {
      await fetch('/api/chat/' + id, { method: 'DELETE' });
    } catch {}
  }

  return { loadChatsFromBackend, saveChatToBackend, newChatOnServer, deleteChatFromBackend };
}
