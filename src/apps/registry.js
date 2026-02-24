/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           NoVoice App Registry — Developer API           ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║                                                          ║
 * ║  HOW TO PUBLISH AN APP                                   ║
 * ║  ─────────────────────────────────────────────────────   ║
 * ║                                                          ║
 * ║  1. Create a folder:  src/apps/<your-app-id>/            ║
 * ║                                                          ║
 * ║  2. Create your main component:                          ║
 * ║        src/apps/<your-app-id>/index.jsx                  ║
 * ║                                                          ║
 * ║     Your component receives NO required props.           ║
 * ║     It fills the entire app content area.                ║
 * ║     Use Tailwind (nv-* tokens) for consistent styling.  ║
 * ║                                                          ║
 * ║  3. Register it below in APP_REGISTRY.                   ║
 * ║                                                          ║
 * ║  4. Done — it instantly appears in the App Store!        ║
 * ║                                                          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║                                                          ║
 * ║  AppDefinition fields                                    ║
 * ║  ─────────────────────────────────────────────────────   ║
 * ║                                                          ║
 * ║  id              string     Unique slug, e.g. "pomodoro" ║
 * ║  name            string     Display name                 ║
 * ║  description     string     One-liner for the store card ║
 * ║  longDescription string?    Markdown-ish full description║
 * ║  icon            string     Emoji, e.g. "🍅"             ║
 * ║  iconColor       string     Hex accent, e.g. "#FF3B30"   ║
 * ║  version         string     Semver, e.g. "1.0.0"         ║
 * ║  author          string     Developer name / handle      ║
 * ║  tags            string[]   Categories for filtering     ║
 * ║  defaultPinned   boolean    Pre-installed for all users? ║
 * ║  component       Component  React component (the app UI) ║
 * ║                                                          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ── Built-in app imports ─────────────────────────────────────────────────────
import NotesApp from './notes/index.jsx';

// ── App Registry ─────────────────────────────────────────────────────────────

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   description: string,
 *   longDescription?: string,
 *   icon: string,
 *   iconColor: string,
 *   version: string,
 *   author: string,
 *   tags: string[],
 *   defaultPinned: boolean,
 *   component: import('react').ComponentType,
 * }>}
 */
export const APP_REGISTRY = [
  // ── Built-in apps ────────────────────────────────────────────────────────
  {
    id: 'notes',
    name: 'Notes',
    description: 'Write and save notes — always available, synced locally.',
    longDescription: 'A clean, fast notepad. Create, pin, search, and delete notes. All notes are saved locally on your device.',
    icon: '📝',
    iconColor: '#FFD60A',
    version: '1.0.0',
    author: 'NoVoice',
    tags: ['productivity', 'utility'],
    defaultPinned: true,
    component: NotesApp,
  },

  // ── Add your apps here ───────────────────────────────────────────────────
  //
  // {
  //   id: 'pomodoro',
  //   name: 'Pomodoro',
  //   description: 'Focus timer with break intervals',
  //   longDescription: 'Stay productive with the Pomodoro technique. 25-min focus sessions, 5-min breaks.',
  //   icon: '🍅',
  //   iconColor: '#FF3B30',
  //   version: '1.0.0',
  //   author: 'YourName',
  //   tags: ['productivity', 'timer'],
  //   defaultPinned: false,
  //   component: PomodoroApp,
  // },
  //
  // ─────────────────────────────────────────────────────────────────────────
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the app definition for a given id, or null if not found.
 * @param {string} id
 * @returns {typeof APP_REGISTRY[0] | null}
 */
export function getAppById(id) {
  return APP_REGISTRY.find((app) => app.id === id) ?? null;
}

/**
 * Returns all app ids that should be pinned by default for new users.
 * @returns {string[]}
 */
export function getDefaultPinnedIds() {
  return APP_REGISTRY.filter((app) => app.defaultPinned).map((app) => app.id);
}

/**
 * Returns all unique tags across all registered apps.
 * @returns {string[]}
 */
export function getAllTags() {
  return [...new Set(APP_REGISTRY.flatMap((app) => app.tags ?? []))];
}
