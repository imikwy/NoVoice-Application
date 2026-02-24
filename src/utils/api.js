// ── Server URL resolution ────────────────────────────────────────────────────
// Central server URL is fixed at build time via VITE_SERVER_URL (.env.production).
// Own/local servers use createServerClient() with their own URL.

export function getServerUrl() {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  return (envUrl || 'http://localhost:3001').replace(/\/$/, '');
}

// One-time cleanup: remove old localStorage override that could break central connection
localStorage.removeItem('nv_server_url');

// ── Base API client ──────────────────────────────────────────────────────────

class ApiClient {
  constructor(baseServerUrl = null) {
    this._baseServerUrl = baseServerUrl; // null = use dynamic getServerUrl()
    this.token = localStorage.getItem('nv_token');
  }

  get serverBase() {
    return this._baseServerUrl ?? getServerUrl();
  }

  get baseUrl() {
    return `${this.serverBase}/api`;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('nv_token', token);
    } else {
      localStorage.removeItem('nv_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(username, email, password, displayName) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, displayName }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // ── Friends ───────────────────────────────────────────────────────────────

  async getFriends() {
    return this.request('/friends');
  }

  async getPendingRequests() {
    return this.request('/friends/pending');
  }

  async addFriend(username) {
    return this.request('/friends/add', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async acceptFriend(requestId) {
    return this.request(`/friends/accept/${requestId}`, { method: 'POST' });
  }

  async removeFriend(friendId) {
    return this.request(`/friends/${friendId}`, { method: 'DELETE' });
  }

  // DMs are relay-only — GET returns empty (no stored history)
  async getDMs(friendId, before) {
    const query = before ? `?before=${before}` : '';
    return this.request(`/friends/dm/${friendId}${query}`);
  }

  // ── Servers (central directory) ───────────────────────────────────────────

  async getServers() {
    return this.request('/servers');
  }

  async createServer(name, server_type = 'novoice', server_url = null) {
    return this.request('/servers', {
      method: 'POST',
      body: JSON.stringify({ name, server_type, server_url }),
    });
  }

  async joinServer(inviteCode) {
    return this.request('/servers/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async getServer(serverId) {
    return this.request(`/servers/${serverId}`);
  }

  async deleteServer(serverId) {
    return this.request(`/servers/${serverId}`, { method: 'DELETE' });
  }

  async leaveServer(serverId) {
    return this.request(`/servers/${serverId}/leave`, { method: 'POST' });
  }

  async updateServer(serverId, data) {
    return this.request(`/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createChannel(serverId, name, type, categoryId = null) {
    return this.request(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type, category_id: categoryId }),
    });
  }

  async updateChannel(serverId, channelId, data) {
    return this.request(`/servers/${serverId}/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteChannel(serverId, channelId) {
    return this.request(`/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' });
  }

  async createCategory(serverId, name) {
    return this.request(`/servers/${serverId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateCategory(serverId, categoryId, name) {
    return this.request(`/servers/${serverId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async deleteCategory(serverId, categoryId) {
    return this.request(`/servers/${serverId}/categories/${categoryId}`, { method: 'DELETE' });
  }

  async reorderItems(serverId, data) {
    return this.request(`/servers/${serverId}/reorder`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async getMessages(channelId, before) {
    const query = before ? `?before=${before}` : '';
    return this.request(`/messages/${channelId}${query}`);
  }

  async sendMessage(channelId, content) {
    return this.request(`/messages/${channelId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async getVoiceIceConfig() {
    return this.request('/voice/ice');
  }

  // ── Rules (block-based) ───────────────────────────────────────────────────

  async getRuleBlocks(channelId) {
    return this.request(`/channel-content/rules/${channelId}`);
  }

  async addRuleBlock(channelId, data) {
    return this.request(`/channel-content/rules/${channelId}/blocks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRuleBlock(channelId, blockId, content) {
    return this.request(`/channel-content/rules/${channelId}/blocks/${blockId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteRuleBlock(channelId, blockId) {
    return this.request(`/channel-content/rules/${channelId}/blocks/${blockId}`, { method: 'DELETE' });
  }

  async reorderRuleBlocks(channelId, blocks) {
    return this.request(`/channel-content/rules/${channelId}/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ blocks }),
    });
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  async getCalendarEvents(channelId) {
    return this.request(`/channel-content/calendar/${channelId}`);
  }

  async createCalendarEvent(channelId, data) {
    return this.request(`/channel-content/calendar/${channelId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCalendarEvent(channelId, eventId) {
    return this.request(`/channel-content/calendar/${channelId}/${eventId}`, { method: 'DELETE' });
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async getAnnouncements(channelId) {
    return this.request(`/channel-content/announcements/${channelId}`);
  }

  async createAnnouncement(channelId, data) {
    return this.request(`/channel-content/announcements/${channelId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAnnouncement(channelId, announcementId, data) {
    return this.request(`/channel-content/announcements/${channelId}/${announcementId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAnnouncement(channelId, announcementId) {
    return this.request(`/channel-content/announcements/${channelId}/${announcementId}`, { method: 'DELETE' });
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async getTasks(channelId) {
    return this.request(`/channel-content/tasks/${channelId}`);
  }

  async getTaskEditors(channelId) {
    return this.request(`/channel-content/tasks/${channelId}/editors`);
  }

  async updateTaskEditors(channelId, userIds) {
    return this.request(`/channel-content/tasks/${channelId}/editors`, {
      method: 'PUT',
      body: JSON.stringify({ userIds }),
    });
  }

  async createTaskCategory(channelId, name) {
    return this.request(`/channel-content/tasks/${channelId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateTaskCategory(channelId, categoryId, name) {
    return this.request(`/channel-content/tasks/${channelId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async deleteTaskCategory(channelId, categoryId) {
    return this.request(`/channel-content/tasks/${channelId}/categories/${categoryId}`, {
      method: 'DELETE',
    });
  }

  async reorderTaskCategories(channelId, categories) {
    return this.request(`/channel-content/tasks/${channelId}/categories/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ categories }),
    });
  }

  async createTaskItem(channelId, data) {
    return this.request(`/channel-content/tasks/${channelId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaskItem(channelId, itemId, data) {
    return this.request(`/channel-content/tasks/${channelId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async completeTaskItem(channelId, itemId) {
    return this.request(`/channel-content/tasks/${channelId}/items/${itemId}/complete`, {
      method: 'POST',
    });
  }

  async deleteTaskItem(channelId, itemId) {
    return this.request(`/channel-content/tasks/${channelId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async reorderTaskItems(channelId, items) {
    return this.request(`/channel-content/tasks/${channelId}/items/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    });
  }

  // Compatibility wrappers
  async createTask(channelId, data) {
    return this.createTaskItem(channelId, data);
  }

  async updateTask(channelId, taskId, data) {
    return this.updateTaskItem(channelId, taskId, data);
  }

  async deleteTask(channelId, taskId) {
    return this.deleteTaskItem(channelId, taskId);
  }

  async importTasksFromAI(type, content, mimeType) {
    return this.request('/ai/import-tasks', {
      method: 'POST',
      body: JSON.stringify({ type, content, mimeType }),
    });
  }

  async importTasksBulk(channelId, categories) {
    return this.request(`/channel-content/tasks/${channelId}/import`, {
      method: 'POST',
      body: JSON.stringify({ categories }),
    });
  }

  // ── Forum ──────────────────────────────────────────────────────────────────

  async getForumPosts(channelId) {
    return this.request(`/channel-content/forum/${channelId}`);
  }

  async createForumPost(channelId, data) {
    return this.request(`/channel-content/forum/${channelId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getForumPost(channelId, postId) {
    return this.request(`/channel-content/forum/${channelId}/${postId}`);
  }

  async createForumReply(channelId, postId, content) {
    return this.request(`/channel-content/forum/${channelId}/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async deleteForumPost(channelId, postId) {
    return this.request(`/channel-content/forum/${channelId}/${postId}`, { method: 'DELETE' });
  }

  async deleteForumReply(channelId, postId, replyId) {
    return this.request(`/channel-content/forum/${channelId}/${postId}/replies/${replyId}`, { method: 'DELETE' });
  }

  logout() {
    this.setToken(null);
  }
}

// ── Singleton for central server ─────────────────────────────────────────────

export const api = new ApiClient();
export default api;

// ── Per-server API client for own/local servers ───────────────────────────────
// Creates an isolated client that connects to a specific server URL.
// The central JWT token is reused — the remote server validates it against
// CENTRAL_AUTH_URL (token introspection) or a shared JWT_SECRET.

export function createServerClient(serverUrl) {
  const client = new ApiClient(serverUrl.replace(/\/$/, ''));
  // Inherit the current auth token
  client.token = localStorage.getItem('nv_token');
  return client;
}

// Returns the right API client for a given server object
export function getApiForServer(server) {
  if (server?.server_url && (server.server_type === 'own' || server.server_type === 'local')) {
    return createServerClient(server.server_url);
  }
  return api;
}

// Test connectivity to a server URL — returns { ok, latencyMs, name }
export async function testServerConnection(serverUrl) {
  const start = Date.now();
  try {
    const url = serverUrl.replace(/\/$/, '');
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return { ok: response.ok, latencyMs: Date.now() - start, name: data.name || 'NoVoice Server' };
  } catch {
    return { ok: false, latencyMs: null, name: null };
  }
}
