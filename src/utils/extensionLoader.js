/**
 * NoVoice Extension Loader
 *
 * Dynamically loads community app bundles that have been downloaded to userData.
 *
 * Bundle format expected from developers:
 *   Built with Vite lib mode, IIFE format, name: 'NoVoiceApp'.
 *   React is externalized (window.React). The bundle's default export is the
 *   React component. After execution, it is available as window.NoVoiceApp.
 *
 *   Example vite.config.js for a developer's app:
 *   ─────────────────────────────────────────────
 *   export default defineConfig({
 *     build: {
 *       lib: {
 *         entry: 'src/App.jsx',
 *         name: 'NoVoiceApp',
 *         formats: ['iife'],
 *         fileName: () => 'app.bundle.js',
 *       },
 *       rollupOptions: {
 *         external: ['react'],
 *         output: { globals: { react: 'React' } },
 *       },
 *     },
 *   });
 *   ─────────────────────────────────────────────
 *
 * The NoVoice API is injected as window.NoVoice before the bundle runs,
 * providing namespaced localStorage and other utilities.
 */

import React from 'react';

// Make React globally available so IIFE bundles can reference window.React
if (typeof window !== 'undefined' && !window.React) {
  window.React = React;
}

/**
 * Build the NoVoice API object exposed to extension bundles.
 * All storage keys are namespaced to the app so extensions never collide.
 */
function buildNoVoiceApi(appId) {
  const prefix = `nv_ext_${appId}_`;
  return {
    // Storage: namespaced localStorage (JSON serialized)
    storage: {
      get(key) {
        try { return JSON.parse(localStorage.getItem(prefix + key)); } catch { return null; }
      },
      set(key, value) {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      },
      remove(key) {
        localStorage.removeItem(prefix + key);
      },
    },
  };
}

/**
 * Dynamically load an installed extension's React component.
 * Reads the bundle from userData via IPC, executes it, returns the component.
 *
 * The component is NOT cached here — callers should cache it themselves.
 *
 * @param {string} appId
 * @returns {Promise<React.ComponentType>}
 */
export async function loadExtensionComponent(appId) {
  if (!window.electronAPI?.extensions) {
    throw new Error('Extension loading is only available in the Electron app.');
  }

  const code = await window.electronAPI.extensions.readBundle({ id: appId });

  // Inject the NoVoice API before executing the bundle
  window.NoVoice = buildNoVoiceApi(appId);

  // Ensure React is on window (bundles reference window.React)
  window.React = React;

  return new Promise((resolve, reject) => {
    try {
      const script = document.createElement('script');
      script.textContent = code;
      document.head.appendChild(script);
      document.head.removeChild(script);
    } catch (err) {
      return reject(new Error(`Failed to execute extension "${appId}": ${err.message}`));
    }

    // After IIFE execution, window.NoVoiceApp holds the exported component
    const exported = window.NoVoiceApp;
    delete window.NoVoiceApp;

    if (!exported) {
      return reject(
        new Error(
          `Extension "${appId}" bundle did not export a component. ` +
          'Make sure vite.config.js uses lib.name = "NoVoiceApp".'
        )
      );
    }

    // Support both bare function export and { default: Component }
    const component = typeof exported === 'function'
      ? exported
      : (exported.default ?? null);

    if (!component) {
      return reject(new Error(`Extension "${appId}" export is not a React component.`));
    }

    resolve(component);
  });
}
