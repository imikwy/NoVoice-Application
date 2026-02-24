import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  FileText,
  Image as ImageIcon,
  FileDown,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  ListTodo,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// ── Phase: 'input' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

const INPUT_TYPES = [
  { id: 'text',  label: 'Text',  Icon: FileText,  desc: 'Paste any list, notes or plain text' },
  { id: 'image', label: 'Image', Icon: ImageIcon, desc: 'Screenshot or photo of a todo list' },
  { id: 'pdf',   label: 'PDF',   Icon: FileDown,  desc: 'A PDF document with tasks' },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result = "data:mime/type;base64,XXXX" — strip the prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TaskImportModal({ channelId, onClose, onImported }) {
  const { activeServerApi } = useApp();

  const [phase, setPhase] = useState('input'); // input | parsing | preview | importing | done | error
  const [inputType, setInputType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null); // File object
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [parsedData, setParsedData] = useState(null); // { categories: [...] }
  const [errorMsg, setErrorMsg] = useState('');

  const imageInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const dropRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((f) => {
    if (!f) return;
    const isImage = f.type.startsWith('image/');
    const isPdf = f.type === 'application/pdf';
    if (!isImage && !isPdf) return;

    setFile(f);
    if (isImage) {
      setFilePreviewUrl(URL.createObjectURL(f));
    } else {
      setFilePreviewUrl(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  // ── Parse ──────────────────────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    setPhase('parsing');
    setErrorMsg('');
    try {
      let type, content, mimeType;
      if (inputType === 'text') {
        type = 'text';
        content = textContent.trim();
        if (!content) throw new Error('Please enter some text first.');
      } else {
        if (!file) throw new Error('Please select a file first.');
        type = inputType;
        mimeType = file.type;
        content = await fileToBase64(file);
      }

      const result = await activeServerApi.importTasksFromAI(type, content, mimeType);

      if (!result?.categories?.length) {
        throw new Error('No tasks found in your content. Try with a more detailed list.');
      }

      setParsedData(result);
      setPhase('preview');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setPhase('error');
    }
  }, [inputType, textContent, file, activeServerApi]);

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!parsedData?.categories) return;
    setPhase('importing');
    try {
      await activeServerApi.importTasksBulk(channelId, parsedData.categories);
      setPhase('done');
      setTimeout(() => {
        onImported?.();
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Import failed. Please try again.');
      setPhase('error');
    }
  }, [parsedData, activeServerApi, channelId, onImported, onClose]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const totalTasks = parsedData?.categories?.reduce((n, c) => n + (c.tasks?.length ?? 0), 0) ?? 0;
  const totalCats  = parsedData?.categories?.length ?? 0;

  const isLoading = phase === 'parsing' || phase === 'importing';

  const canParse =
    phase === 'input' &&
    (inputType === 'text' ? textContent.trim().length > 0 : file !== null);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-3xl border border-white/[0.08] shadow-2xl overflow-hidden"
        style={{ background: 'rgba(20,20,20,0.98)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-nv-accent/15 border border-nv-accent/25 flex items-center justify-center">
              <Sparkles size={13} className="text-nv-accent" />
            </div>
            <span className="text-sm font-semibold text-nv-text-primary">AI Import</span>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-nv-text-tertiary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="p-5 space-y-4">
          <AnimatePresence mode="wait">

            {/* ── Input phase ─────────────────────────────────────────────── */}
            {phase === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Type selector */}
                <div className="flex gap-2">
                  {INPUT_TYPES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => { setInputType(id); setFile(null); setFilePreviewUrl(null); setTextContent(''); }}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs transition-all ${
                        inputType === id
                          ? 'border-nv-accent/40 bg-nv-accent/10 text-nv-accent'
                          : 'border-white/[0.07] bg-white/[0.02] text-nv-text-secondary hover:border-white/[0.12] hover:text-nv-text-primary'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Input area */}
                <AnimatePresence mode="wait">
                  {inputType === 'text' && (
                    <motion.div key="text-input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Paste your todo list, notes, or any text with tasks…"
                        className="w-full h-32 bg-white/[0.04] border border-white/[0.07] rounded-2xl px-3.5 py-3 text-sm text-nv-text-primary placeholder-nv-text-tertiary resize-none focus:outline-none focus:border-nv-accent/40 transition-colors leading-relaxed"
                        autoFocus
                      />
                    </motion.div>
                  )}

                  {(inputType === 'image' || inputType === 'pdf') && (
                    <motion.div key="file-input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div
                        ref={dropRef}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => inputType === 'image' ? imageInputRef.current?.click() : pdfInputRef.current?.click()}
                        className={`relative h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                          dragging
                            ? 'border-nv-accent/60 bg-nv-accent/10'
                            : file
                            ? 'border-nv-accent/30 bg-nv-accent/[0.07]'
                            : 'border-white/[0.1] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04]'
                        }`}
                      >
                        {file ? (
                          <>
                            {filePreviewUrl ? (
                              <img src={filePreviewUrl} alt="" className="max-h-20 max-w-full rounded-xl object-contain" />
                            ) : (
                              <div className="flex items-center gap-2">
                                <FileDown size={18} className="text-nv-accent" />
                                <span className="text-xs text-nv-accent font-medium truncate max-w-[220px]">{file.name}</span>
                              </div>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setFile(null); setFilePreviewUrl(null); }}
                              className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/60 hover:text-white"
                            >
                              <X size={9} />
                            </button>
                          </>
                        ) : (
                          <>
                            <Upload size={18} className="text-nv-text-tertiary" />
                            <span className="text-xs text-nv-text-tertiary">
                              {inputType === 'image' ? 'Drop image or click to browse' : 'Drop PDF or click to browse'}
                            </span>
                          </>
                        )}
                      </div>
                      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])} />
                      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])} />
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[11px] text-nv-text-tertiary text-center leading-relaxed">
                  {INPUT_TYPES.find(t => t.id === inputType)?.desc}
                </p>
              </motion.div>
            )}

            {/* ── Parsing / Importing ──────────────────────────────────────── */}
            {(phase === 'parsing' || phase === 'importing') && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                >
                  <Loader2 size={28} className="text-nv-accent" />
                </motion.div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-nv-text-primary font-medium">
                    {phase === 'parsing' ? 'AI is analyzing your content…' : 'Importing tasks…'}
                  </p>
                  <p className="text-xs text-nv-text-tertiary">
                    {phase === 'parsing' ? 'This usually takes a few seconds' : 'Creating categories and tasks'}
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Preview ──────────────────────────────────────────────────── */}
            {phase === 'preview' && parsedData && (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-xs text-nv-text-secondary">
                  <Sparkles size={11} className="text-nv-accent" />
                  <span>Found <span className="text-nv-text-primary font-medium">{totalCats} {totalCats === 1 ? 'category' : 'categories'}</span> with <span className="text-nv-text-primary font-medium">{totalTasks} tasks</span></span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5 nv-scrollbar">
                  {parsedData.categories.map((cat, ci) => (
                    <div key={ci} className="rounded-2xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.05]">
                        <ListTodo size={12} className="text-nv-accent shrink-0" />
                        <span className="text-xs font-semibold text-nv-text-primary">{cat.name}</span>
                        <span className="ml-auto text-[10px] text-nv-text-tertiary">{cat.tasks?.length ?? 0}</span>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {(cat.tasks || []).map((task, ti) => (
                          <div key={ti} className="flex items-start gap-2.5 px-3.5 py-2">
                            <ChevronRight size={11} className="text-nv-text-tertiary mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-nv-text-primary leading-snug">{task.title}</p>
                              {task.description && (
                                <p className="text-[10px] text-nv-text-tertiary mt-0.5 leading-snug">{task.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Done ─────────────────────────────────────────────────────── */}
            {phase === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-3 py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="w-12 h-12 rounded-2xl bg-nv-accent/15 border border-nv-accent/30 flex items-center justify-center"
                >
                  <Check size={20} className="text-nv-accent" />
                </motion.div>
                <p className="text-sm text-nv-text-primary font-medium">Imported successfully</p>
              </motion.div>
            )}

            {/* ── Error ────────────────────────────────────────────────────── */}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-6 text-center"
              >
                <AlertCircle size={24} className="text-nv-danger" />
                <p className="text-sm text-nv-text-primary font-medium">Something went wrong</p>
                <p className="text-xs text-nv-text-tertiary max-w-[280px] leading-relaxed">{errorMsg}</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {(phase === 'input' || phase === 'preview' || phase === 'error') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-end gap-2 px-5 pb-5"
            >
              {phase === 'error' && (
                <button
                  onClick={() => setPhase('input')}
                  className="px-4 py-2 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                >
                  Try again
                </button>
              )}

              {phase === 'input' && (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleParse}
                    disabled={!canParse}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-all font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={11} />
                    Analyze with AI
                  </motion.button>
                </>
              )}

              {phase === 'preview' && (
                <>
                  <button
                    onClick={() => setPhase('input')}
                    className="px-4 py-2 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                  >
                    Back
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleImport}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-nv-accent/20 text-nv-accent hover:bg-nv-accent/30 transition-all font-medium"
                  >
                    <Check size={11} />
                    Import {totalTasks} tasks
                  </motion.button>
                </>
              )}

              {phase === 'error' && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs text-nv-text-secondary hover:text-nv-text-primary hover:bg-white/[0.06] transition-all"
                >
                  Close
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
