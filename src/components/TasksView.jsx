import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListTodo,
  Plus,
  ChevronDown,
  GripVertical,
  Check,
  Trash2,
  Pencil,
  UsersRound,
  Shield,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';

function moveArrayItem(list, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [...list];
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function buildLists(categories, items) {
  const lists = {};
  categories.forEach((category) => {
    lists[category.id] = items
      .filter((item) => item.category_id === category.id)
      .sort((a, b) => a.position - b.position || new Date(a.created_at) - new Date(b.created_at));
  });
  return lists;
}

function flattenLists(categories, lists) {
  const flat = [];
  categories.forEach((category) => {
    (lists[category.id] || []).forEach((item, index) => {
      flat.push({ ...item, category_id: category.id, position: index });
    });
  });
  return flat;
}

export default function TasksView({ channel, onToggleMembers, showMembers }) {
  const { activeServerApi } = useApp();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [permissions, setPermissions] = useState({ can_edit: false, is_owner: false });

  const [collapsedCategories, setCollapsedCategories] = useState(new Set());

  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [renamingCategoryId, setRenamingCategoryId] = useState(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState('');

  const [taskDrafts, setTaskDrafts] = useState({}); // categoryId -> { open, title, description }
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDescription, setEditingTaskDescription] = useState('');

  const [dragCategoryId, setDragCategoryId] = useState(null);
  const [dragTask, setDragTask] = useState(null); // { id, fromCategoryId }

  const [showEditors, setShowEditors] = useState(false);
  const [editorMembers, setEditorMembers] = useState([]);
  const [editorIds, setEditorIds] = useState(new Set());
  const [loadingEditors, setLoadingEditors] = useState(false);

  const canEdit = permissions?.can_edit;
  const isOwner = permissions?.is_owner;

  const loadBoard = useCallback(async () => {
    try {
      const data = await activeServerApi.getTasks(channel.id);
      setCategories((data.categories || []).sort((a, b) => a.position - b.position));
      setItems(data.items || []);
      setPermissions(data.permissions || { can_edit: false, is_owner: false });
      setEditorIds(new Set((data.editors || []).map((editor) => editor.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeServerApi, channel.id]);

  useEffect(() => {
    setLoading(true);
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    socket?.emit('channel:subscribe', { channelId: channel.id });
    const handler = ({ channelId }) => {
      if (channelId === channel.id) loadBoard();
    };
    socket?.on('channel:updated', handler);

    return () => {
      socket?.off('channel:updated', handler);
      socket?.emit('channel:unsubscribe', { channelId: channel.id });
    };
  }, [socket, channel.id, loadBoard]);

  const lists = useMemo(() => buildLists(categories, items), [categories, items]);

  const persistCategoryOrder = useCallback(
    async (nextCategories) => {
      setSaving(true);
      try {
        await activeServerApi.reorderTaskCategories(
          channel.id,
          nextCategories.map((category, index) => ({ id: category.id, position: index }))
        );
      } catch (err) {
        console.error(err);
        await loadBoard();
      } finally {
        setSaving(false);
      }
    },
    [activeServerApi, channel.id, loadBoard]
  );

  const persistItemOrder = useCallback(
    async (nextItems) => {
      setSaving(true);
      try {
        await activeServerApi.reorderTaskItems(
          channel.id,
          nextItems.map((item) => ({
            id: item.id,
            category_id: item.category_id,
            position: item.position,
          }))
        );
      } catch (err) {
        console.error(err);
        await loadBoard();
      } finally {
        setSaving(false);
      }
    },
    [activeServerApi, channel.id, loadBoard]
  );

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setSaving(true);
    try {
      await activeServerApi.createTaskCategory(channel.id, newCategoryName.trim());
      setNewCategoryName('');
      setShowCreateCategory(false);
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleRenameCategory = async (categoryId) => {
    if (!renamingCategoryName.trim()) {
      setRenamingCategoryId(null);
      setRenamingCategoryName('');
      return;
    }

    setSaving(true);
    try {
      await activeServerApi.updateTaskCategory(channel.id, categoryId, renamingCategoryName.trim());
      setRenamingCategoryId(null);
      setRenamingCategoryName('');
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    setSaving(true);
    try {
      await activeServerApi.deleteTaskCategory(channel.id, categoryId);
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openTaskDraft = (categoryId) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] || {}), open: true, title: prev[categoryId]?.title || '', description: prev[categoryId]?.description || '' },
    }));
  };

  const closeTaskDraft = (categoryId) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [categoryId]: { open: false, title: '', description: '' },
    }));
  };

  const setTaskDraftField = (categoryId, field, value) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] || { open: true, title: '', description: '' }),
        [field]: value,
      },
    }));
  };

  const handleCreateTask = async (categoryId) => {
    const draft = taskDrafts[categoryId];
    if (!draft?.title?.trim()) return;

    setSaving(true);
    try {
      await activeServerApi.createTaskItem(channel.id, {
        category_id: categoryId,
        title: draft.title.trim(),
        description: draft.description?.trim() || '',
      });
      closeTaskDraft(categoryId);
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditTask = (item) => {
    setEditingTaskId(item.id);
    setEditingTaskTitle(item.title);
    setEditingTaskDescription(item.description || '');
  };

  const handleSaveTaskEdit = async (itemId) => {
    if (!editingTaskTitle.trim()) return;

    setSaving(true);
    try {
      await activeServerApi.updateTaskItem(channel.id, itemId, {
        title: editingTaskTitle.trim(),
        description: editingTaskDescription.trim(),
      });
      setEditingTaskId(null);
      setEditingTaskTitle('');
      setEditingTaskDescription('');
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (itemId) => {
    setSaving(true);
    try {
      await activeServerApi.deleteTaskItem(channel.id, itemId);
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteTask = async (itemId) => {
    setSaving(true);
    try {
      await activeServerApi.completeTaskItem(channel.id, itemId);
      await loadBoard();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoryCollapsed = (categoryId) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleCategoryDragStart = (categoryId) => {
    setDragCategoryId(categoryId);
  };

  const handleCategoryDrop = async (targetCategoryId) => {
    if (!dragCategoryId || dragCategoryId === targetCategoryId) {
      setDragCategoryId(null);
      return;
    }

    const fromIndex = categories.findIndex((category) => category.id === dragCategoryId);
    const toIndex = categories.findIndex((category) => category.id === targetCategoryId);
    if (fromIndex < 0 || toIndex < 0) {
      setDragCategoryId(null);
      return;
    }

    const nextCategories = moveArrayItem(categories, fromIndex, toIndex)
      .map((category, index) => ({ ...category, position: index }));

    setCategories(nextCategories);
    setDragCategoryId(null);
    await persistCategoryOrder(nextCategories);
  };

  const handleTaskDragStart = (itemId, fromCategoryId) => {
    setDragTask({ id: itemId, fromCategoryId });
  };

  const moveDraggedTask = useCallback(
    async (targetCategoryId, targetTaskId = null) => {
      if (!dragTask) return;

      const nextLists = buildLists(categories, items);
      const sourceList = nextLists[dragTask.fromCategoryId] || [];
      const draggedIndex = sourceList.findIndex((task) => task.id === dragTask.id);
      if (draggedIndex < 0) {
        setDragTask(null);
        return;
      }

      const [draggedItem] = sourceList.splice(draggedIndex, 1);
      const destinationList = nextLists[targetCategoryId] || [];
      if (!nextLists[targetCategoryId]) {
        nextLists[targetCategoryId] = destinationList;
      }

      const insertIndex = targetTaskId
        ? destinationList.findIndex((task) => task.id === targetTaskId)
        : destinationList.length;

      destinationList.splice(insertIndex >= 0 ? insertIndex : destinationList.length, 0, {
        ...draggedItem,
        category_id: targetCategoryId,
      });

      const nextItems = flattenLists(categories, nextLists);
      setItems(nextItems);
      setDragTask(null);
      await persistItemOrder(nextItems);
    },
    [dragTask, categories, items, persistItemOrder]
  );

  const openEditorsPanel = async () => {
    setShowEditors((prev) => !prev);
    if (showEditors) return;

    setLoadingEditors(true);
    try {
      const data = await activeServerApi.getTaskEditors(channel.id);
      setEditorMembers(data.members || []);
      setEditorIds(new Set(data.editorIds || []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEditors(false);
    }
  };

  const toggleEditor = async (userId) => {
    const next = new Set(editorIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setEditorIds(next);

    try {
      await activeServerApi.updateTaskEditors(channel.id, [...next]);
      await loadBoard();
    } catch (err) {
      console.error(err);
      await loadBoard();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-nv-content min-w-0">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.05] shrink-0 gap-2">
        <ListTodo size={16} className="text-nv-text-tertiary shrink-0" />
        <span className="text-sm font-semibold text-nv-text-primary truncate flex-1">{channel.name}</span>

        {saving && <Loader2 size={14} className="animate-spin text-nv-accent shrink-0" />}

        {canEdit && (
          <button
            onClick={() => setShowCreateCategory((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
          >
            <Plus size={12} />
            Category
          </button>
        )}

        {isOwner && (
          <button
            onClick={openEditorsPanel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
          >
            <Shield size={12} />
            Editors
          </button>
        )}

        {onToggleMembers && (
          <button
            onClick={onToggleMembers}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              showMembers
                ? 'bg-white/10 text-nv-text-primary'
                : 'text-nv-text-tertiary hover:bg-white/5 hover:text-nv-text-secondary'
            }`}
            title="Toggle member list"
          >
            <UsersRound size={15} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showCreateCategory && canEdit && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreateCategory}
            className="overflow-hidden border-b border-white/[0.05]"
          >
            <div className="px-4 py-3 flex items-center gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="nv-input py-2"
                autoFocus
              />
              <button type="submit" className="nv-button-primary">Create</button>
              <button type="button" className="nv-button-ghost" onClick={() => setShowCreateCategory(false)}>Cancel</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditors && isOwner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-white/[0.05]"
          >
            <div className="px-4 py-3 bg-nv-surface/10">
              {loadingEditors ? (
                <div className="flex items-center gap-2 text-xs text-nv-text-tertiary">
                  <Loader2 size={12} className="animate-spin" />
                  Loading editors...
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {editorMembers.map((member) => {
                    const active = editorIds.has(member.id);
                    return (
                      <button
                        key={member.id}
                        onClick={() => toggleEditor(member.id)}
                        className={`px-2 py-1 rounded-md text-xs border transition-all ${
                          active
                            ? 'border-nv-accent/40 bg-nv-accent/10 text-nv-accent'
                            : 'border-white/[0.08] bg-white/[0.03] text-nv-text-secondary hover:text-nv-text-primary'
                        }`}
                      >
                        {member.display_name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!canEdit && (
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-nv-text-tertiary">
            You can view tasks, but only users with task edit permission can modify this board.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 rounded-full border-2 border-nv-accent border-t-transparent animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-sm text-nv-text-tertiary text-center py-12">No categories yet.</div>
        ) : (
          categories.map((category) => {
            const categoryItems = lists[category.id] || [];
            const isCollapsed = collapsedCategories.has(category.id);
            const draft = taskDrafts[category.id] || { open: false, title: '', description: '' };

            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
                onDragOver={(e) => {
                  if (!canEdit || !dragTask) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!canEdit || !dragTask) return;
                  e.preventDefault();
                  moveDraggedTask(category.id, null);
                }}
              >
                <div
                  className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2 group"
                  draggable={canEdit}
                  onDragStart={() => canEdit && handleCategoryDragStart(category.id)}
                  onDragEnd={() => setDragCategoryId(null)}
                  onDragOver={(e) => {
                    if (!canEdit || !dragCategoryId) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!canEdit || !dragCategoryId) return;
                    e.preventDefault();
                    handleCategoryDrop(category.id);
                  }}
                >
                  {canEdit && <GripVertical size={12} className="text-nv-text-tertiary opacity-0 group-hover:opacity-70" />}
                  <button onClick={() => toggleCategoryCollapsed(category.id)} className="text-nv-text-tertiary hover:text-nv-text-secondary">
                    <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                  </button>

                  {renamingCategoryId === category.id ? (
                    <input
                      value={renamingCategoryName}
                      onChange={(e) => setRenamingCategoryName(e.target.value)}
                      onBlur={() => handleRenameCategory(category.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(category.id);
                        if (e.key === 'Escape') {
                          setRenamingCategoryId(null);
                          setRenamingCategoryName('');
                        }
                      }}
                      className="flex-1 bg-white/[0.06] border border-white/[0.12] rounded-md px-2 py-1 text-sm text-nv-text-primary outline-none"
                      autoFocus
                    />
                  ) : (
                    <button
                      onDoubleClick={() => {
                        if (!canEdit) return;
                        setRenamingCategoryId(category.id);
                        setRenamingCategoryName(category.name);
                      }}
                      className="text-sm font-semibold text-nv-text-primary flex-1 text-left"
                    >
                      {category.name}
                    </button>
                  )}

                  <span className="text-[10px] text-nv-text-tertiary px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                    {categoryItems.length}
                  </span>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openTaskDraft(category.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]"
                        title="Add task"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10"
                        title="Delete category"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {draft.open && canEdit && (
                        <div className="p-3 border-b border-white/[0.05] bg-black/10 space-y-2">
                          <input
                            value={draft.title}
                            onChange={(e) => setTaskDraftField(category.id, 'title', e.target.value)}
                            placeholder="Task title"
                            className="nv-input py-2"
                          />
                          <textarea
                            value={draft.description}
                            onChange={(e) => setTaskDraftField(category.id, 'description', e.target.value)}
                            placeholder="Task description"
                            rows={2}
                            className="nv-input py-2 resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" className="nv-button-ghost" onClick={() => closeTaskDraft(category.id)}>Cancel</button>
                            <button type="button" className="nv-button-primary" onClick={() => handleCreateTask(category.id)}>Add</button>
                          </div>
                        </div>
                      )}

                      <div className="p-2 space-y-2">
                        {categoryItems.map((item) => (
                          <div
                            key={item.id}
                            draggable={canEdit}
                            onDragStart={() => canEdit && handleTaskDragStart(item.id, category.id)}
                            onDragEnd={() => setDragTask(null)}
                            onDragOver={(e) => {
                              if (!canEdit || !dragTask) return;
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              if (!canEdit || !dragTask) return;
                              e.preventDefault();
                              moveDraggedTask(category.id, item.id);
                            }}
                            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                          >
                            {editingTaskId === item.id ? (
                              <div className="space-y-2">
                                <input
                                  value={editingTaskTitle}
                                  onChange={(e) => setEditingTaskTitle(e.target.value)}
                                  className="nv-input py-2"
                                  autoFocus
                                />
                                <textarea
                                  value={editingTaskDescription}
                                  onChange={(e) => setEditingTaskDescription(e.target.value)}
                                  rows={2}
                                  className="nv-input py-2 resize-none"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="nv-button-ghost"
                                    onClick={() => {
                                      setEditingTaskId(null);
                                      setEditingTaskTitle('');
                                      setEditingTaskDescription('');
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button type="button" className="nv-button-primary" onClick={() => handleSaveTaskEdit(item.id)}>
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2.5">
                                {canEdit && <GripVertical size={12} className="text-nv-text-tertiary mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-nv-text-primary break-words">{item.title}</p>
                                  {item.description && (
                                    <p className="text-xs text-nv-text-secondary mt-1 whitespace-pre-wrap break-words">{item.description}</p>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleCompleteTask(item.id)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-accent hover:bg-nv-accent/10"
                                      title="Mark complete and move"
                                    >
                                      <Check size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleStartEditTask(item)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06]"
                                      title="Edit"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTask(item.id)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-nv-text-tertiary hover:text-nv-danger hover:bg-nv-danger/10"
                                      title="Delete"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {categoryItems.length === 0 && (
                          <div className="px-3 py-3 text-xs text-nv-text-tertiary italic">No tasks in this category.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
