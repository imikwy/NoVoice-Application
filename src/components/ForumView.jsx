import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessagesSquare, ArrowLeft, Plus, Send, Trash2, MessageCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import UserAvatar from './UserAvatar';

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ForumView({ channel, serverId }) {
  const { activeServerApi, serverDetails } = useApp();
  const { user } = useAuth();
  const { socket } = useSocket();

  const server = serverDetails[serverId]?.server;
  const isOwner = server?.owner_id === user?.id;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePost, setActivePost] = useState(null); // { post, replies }
  const [postLoading, setPostLoading] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  const repliesEndRef = useRef(null);

  const loadPosts = useCallback(async () => {
    try {
      const data = await activeServerApi.getForumPosts(channel.id);
      setPosts(data.posts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeServerApi, channel.id]);

  const loadPost = useCallback(async (postId) => {
    setPostLoading(true);
    try {
      const data = await activeServerApi.getForumPost(channel.id, postId);
      setActivePost(data);
    } catch (err) {
      console.error(err);
    }
    setPostLoading(false);
  }, [activeServerApi, channel.id]);

  useEffect(() => {
    setLoading(true);
    loadPosts();
    setActivePost(null);
  }, [loadPosts]);

  useEffect(() => {
    socket?.emit('channel:subscribe', { channelId: channel.id });
    const handler = ({ channelId }) => {
      if (channelId !== channel.id) return;
      loadPosts();
      if (activePost?.post?.id) loadPost(activePost.post.id);
    };
    socket?.on('channel:updated', handler);
    return () => {
      socket?.off('channel:updated', handler);
      socket?.emit('channel:unsubscribe', { channelId: channel.id });
    };
  }, [socket, channel.id, loadPosts, loadPost, activePost?.post?.id]);

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activePost?.replies]);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    try {
      await activeServerApi.createForumPost(channel.id, {
        title: newTitle.trim(),
        content: newContent.trim(),
      });
      setNewTitle('');
      setNewContent('');
      setShowNewPost(false);
      await loadPosts();
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const handleDeletePost = async (postId) => {
    try {
      await activeServerApi.deleteForumPost(channel.id, postId);
      setActivePost(null);
      await loadPosts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim() || !activePost) return;
    setReplying(true);
    try {
      await activeServerApi.createForumReply(channel.id, activePost.post.id, replyContent.trim());
      setReplyContent('');
      await loadPost(activePost.post.id);
    } catch (err) {
      console.error(err);
    }
    setReplying(false);
  };

  const handleDeleteReply = async (replyId) => {
    try {
      await activeServerApi.deleteForumReply(channel.id, activePost.post.id, replyId);
      await loadPost(activePost.post.id);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Post detail view ──
  if (activePost) {
    const { post, replies } = activePost;
    const canDeletePost = isOwner || post.author_id === user?.id;
    return (
      <div className="flex-1 flex flex-col bg-nv-content min-w-0">
        <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
          <button
            onClick={() => setActivePost(null)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all shrink-0"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">{post.title}</span>
          {canDeletePost && (
            <button
              onClick={() => handleDeletePost(post.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {postLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              {/* Original post */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <UserAvatar user={post} size="sm" />
                  <div>
                    <span className="text-sm font-medium text-nv-text-primary">{post.display_name}</span>
                    <span className="text-[11px] text-nv-text-tertiary ml-2">@{post.username}</span>
                  </div>
                  <span className="ml-auto text-[11px] text-nv-text-tertiary">{formatTime(post.created_at)}</span>
                </div>
                <p className="text-sm text-nv-text-primary/90 leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>

              {/* Replies */}
              {replies.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-nv-text-tertiary px-1 mb-2">
                    {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                  </p>
                  <div className="space-y-2 pl-4 border-l border-white/[0.06]">
                    {replies.map((reply) => {
                      const canDelete = isOwner || reply.author_id === user?.id;
                      return (
                        <motion.div
                          key={reply.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group flex gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-all"
                        >
                          <UserAvatar user={reply} size="xs" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium text-nv-text-primary">{reply.display_name}</span>
                              <span className="text-[10px] text-nv-text-tertiary">{formatTime(reply.created_at)}</span>
                            </div>
                            <p className="text-sm text-nv-text-primary/80 mt-0.5 leading-relaxed">{reply.content}</p>
                          </div>
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteReply(reply.id)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0 self-start"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div ref={repliesEndRef} />
            </>
          )}
        </div>

        {/* Reply input */}
        <form onSubmit={handleReply} className="border-t border-white/[0.05] p-3 flex gap-2">
          <input
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            className="flex-1 nv-input py-2"
          />
          <motion.button
            type="submit"
            disabled={replying || !replyContent.trim()}
            whileTap={{ scale: 0.97 }}
            className="nv-button-primary disabled:opacity-40 flex items-center gap-1.5 px-3"
          >
            {replying ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Reply
          </motion.button>
        </form>
      </div>
    );
  }

  // ── Posts list view ──
  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
        <MessagesSquare size={16} className="text-nv-text-tertiary shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">{channel.name}</span>
        <button
          onClick={() => setShowNewPost((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
        >
          {showNewPost ? <X size={12} /> : <Plus size={12} />}
          {showNewPost ? 'Cancel' : 'New Post'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* New post form */}
        <AnimatePresence>
          {showNewPost && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleCreatePost}
              className="overflow-hidden mb-4"
            >
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-nv-text-primary">New Post</h3>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Post title"
                  className="nv-input"
                  autoFocus
                  required
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write your post..."
                  rows={4}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none outline-none focus:border-nv-accent/40 transition-colors"
                  required
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNewPost(false)} className="nv-button-ghost">Cancel</button>
                  <motion.button
                    type="submit"
                    disabled={submitting || !newTitle.trim() || !newContent.trim()}
                    whileTap={{ scale: 0.97 }}
                    className="nv-button-primary disabled:opacity-40"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : 'Post'}
                  </motion.button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-nv-surface/30 flex items-center justify-center mb-4">
              <MessagesSquare size={28} className="text-nv-text-tertiary" />
            </div>
            <h3 className="text-base font-semibold text-nv-text-primary mb-1">No posts yet</h3>
            <p className="text-sm text-nv-text-secondary">Be the first to start a discussion.</p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <motion.button
                key={post.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => loadPost(post.id)}
                className="w-full text-left px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all group"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar user={post} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-nv-text-primary truncate group-hover:text-white transition-colors">
                      {post.title}
                    </p>
                    <p className="text-xs text-nv-text-tertiary mt-0.5 truncate">{post.content}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-nv-text-tertiary">
                        @{post.username} · {formatTime(post.created_at)}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-nv-text-tertiary">
                        <MessageCircle size={10} />
                        {post.reply_count}
                      </span>
                    </div>
                  </div>
                  {(isOwner || post.author_id === user?.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10 transition-all shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
