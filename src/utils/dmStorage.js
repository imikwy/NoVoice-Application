/**
 * Local DM history — persists conversations to localStorage.
 * Keys are sorted so the key is the same regardless of who is sender/receiver.
 * Stores the last MAX_MESSAGES messages per conversation to limit storage usage.
 */

const PREFIX = 'nv_dm_';
const MAX_MESSAGES = 500;

function storageKey(id1, id2) {
  const [a, b] = [String(id1), String(id2)].sort();
  return `${PREFIX}${a}_${b}`;
}

export function loadConversation(myId, friendId) {
  try {
    const raw = localStorage.getItem(storageKey(myId, friendId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function appendMessage(myId, friendId, message) {
  try {
    const existing = loadConversation(myId, friendId);
    if (existing.some((m) => m.id === message.id)) return; // deduplicate
    const updated = [...existing, message].slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(myId, friendId), JSON.stringify(updated));
  } catch {
    // localStorage full — fail silently
  }
}
