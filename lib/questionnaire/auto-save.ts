/**
 * Debounced autosave (2s after last change) + interval autosave (30s).
 * File path: lib/questionnaire/auto-save.ts
 */

export type AutosaveController = {
  /** Call on every local change */
  touch: () => void;
  /** Flush immediately */
  flush: () => void;
  dispose: () => void;
};

/**
 * @param saveFn async persist function
 * @param debounceMs default 2000
 * @param intervalMs default 30000
 */
export type QuestionnaireAutosaveOptions = {
  onSuccess?: () => void;
};

export function createQuestionnaireAutosave(
  saveFn: () => Promise<void>,
  debounceMs = 2000,
  intervalMs = 30000,
  options?: QuestionnaireAutosaveOptions,
): AutosaveController {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let dirty = false;
  let saving = false;

  const run = async () => {
    if (!dirty || saving) return;
    saving = true;
    dirty = false;
    try {
      // TODO: REMOVE DIAGNOSTIC LOGGING
      console.log('[Autosave] Debounce fired, calling saveFn');
      await saveFn();
      // TODO: REMOVE DIAGNOSTIC LOGGING
      console.log('[Autosave] saveFn complete');
      options?.onSuccess?.();
    } finally {
      saving = false;
    }
  };

  const touch = () => {
    dirty = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void run();
    }, debounceMs);
  };

  const flush = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void run();
  };

  intervalTimer = setInterval(() => {
    void run();
  }, intervalMs);

  return {
    touch,
    flush,
    dispose: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (intervalTimer) clearInterval(intervalTimer);
    },
  };
}
