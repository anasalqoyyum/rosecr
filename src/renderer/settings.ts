type SettingsState = import('../main/control-state').ControlState;
type SettingsShortcutAction = import('../shared/contracts').ShortcutAction;

(() => {
  const shortcutLabels: Record<SettingsShortcutAction, string> = {
    play: 'Play', auto: 'Auto', overlay: 'Overlay', clear: 'Clear'
  };

  const getElement = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing settings element: ${selector}`);
    return element;
  };

  const targetSelect = getElement<HTMLSelectElement>('#target');
  const captureStatus = getElement<HTMLElement>('#capture-status');
  const shortcutFields = getElement<HTMLElement>('#shortcut-fields');
  let currentState: SettingsState | null = null;

  function showPage(page: string | undefined): void {
    if (!page) return;
    for (const button of document.querySelectorAll<HTMLElement>('[data-page]')) {
      button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
    }
    for (const section of document.querySelectorAll<HTMLElement>('[data-section]')) {
      section.hidden = section.dataset.section !== page;
    }
  }

  function renderShortcuts(state: SettingsState): void {
    if (shortcutFields.childElementCount > 0) {
      for (const input of shortcutFields.querySelectorAll<HTMLInputElement>('input')) {
        const action = input.dataset.action as SettingsShortcutAction;
        if (document.activeElement !== input) input.value = state.shortcuts[action] ?? '';
        const output = shortcutFields.querySelector<HTMLOutputElement>(`[data-conflict="${action}"]`);
        if (output) output.textContent = state.shortcutConflicts[action] ?? '';
      }
      return;
    }

    for (const action of Object.keys(shortcutLabels) as SettingsShortcutAction[]) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      const labelElement = document.createElement('label');
      labelElement.htmlFor = `shortcut-${action}`;
      labelElement.textContent = shortcutLabels[action];
      const input = document.createElement('input');
      input.id = `shortcut-${action}`;
      input.dataset.action = action;
      input.placeholder = 'Disabled';
      input.value = state.shortcuts[action] ?? '';
      input.addEventListener('change', () => void window.rosecr.command({ type: 'set-shortcut', action, accelerator: input.value.trim() || null }));
      const conflict = document.createElement('output');
      conflict.className = 'field-error';
      conflict.dataset.conflict = action;
      conflict.textContent = state.shortcutConflicts[action] ?? '';
      row.append(labelElement, input, conflict);
      shortcutFields.append(row);
    }
  }

  function render(state: SettingsState): void {
    currentState = state;
    getElement<HTMLSelectElement>('#general-direction').value = state.direction;
    getElement<HTMLSelectElement>('#capture-scope').value = state.scope;
    getElement<HTMLInputElement>('#overlay-visible').checked = state.overlayVisible;
    captureStatus.textContent = state.statusMessage;
    captureStatus.dataset.status = state.status;
    getElement<HTMLElement>('#diagnostic-state').textContent = state.statusMessage;
    getElement<HTMLElement>('#diagnostic-target').textContent = state.selectedTarget?.name ?? 'Not selected';
    getElement<HTMLElement>('#diagnostic-frames').textContent = String(state.captureProbe.frameCount);
    getElement<HTMLElement>('#diagnostic-latency').textContent = state.captureProbe.firstFrameLatencyMs === null
      ? '—' : `${state.captureProbe.firstFrameLatencyMs} ms`;
    getElement<HTMLElement>('#diagnostic-size').textContent = state.captureProbe.frameSize
      ? `${state.captureProbe.frameSize.width} × ${state.captureProbe.frameSize.height}` : '—';
    renderShortcuts(state);
  }

  async function refreshTargets(): Promise<void> {
    captureStatus.textContent = 'Reading capturable windows…';
    try {
      const targets = await window.rosecr.listTargets();
      targetSelect.replaceChildren(new Option('Choose a window', ''));
      for (const target of targets) targetSelect.add(new Option(target.name, target.id));
      if (currentState?.selectedTarget) targetSelect.value = currentState.selectedTarget.id;
      captureStatus.textContent = targets.length ? 'Choose a window to run the M0 capture probe.' : 'No capturable windows found.';
    } catch (error) {
      captureStatus.textContent = error instanceof Error ? error.message : String(error);
      captureStatus.dataset.status = 'error';
    }
  }

  for (const button of document.querySelectorAll<HTMLElement>('[data-page]')) {
    button.addEventListener('click', () => {
      showPage(button.dataset.page);
      if (button.dataset.page === 'capture') void refreshTargets();
    });
  }

  getElement<HTMLSelectElement>('#general-direction').addEventListener('change', (event) => {
    const direction = (event.currentTarget as HTMLSelectElement).value as SettingsState['direction'];
    void window.rosecr.command({ type: 'set-direction', direction });
  });
  getElement<HTMLSelectElement>('#capture-scope').addEventListener('change', (event) => {
    const scope = (event.currentTarget as HTMLSelectElement).value as SettingsState['scope'];
    void window.rosecr.command({ type: 'set-scope', scope });
  });
  getElement<HTMLInputElement>('#overlay-visible').addEventListener('change', (event) => {
    void window.rosecr.command({ type: 'set-overlay-visible', visible: (event.currentTarget as HTMLInputElement).checked });
  });
  getElement<HTMLButtonElement>('#refresh-targets').addEventListener('click', () => void refreshTargets());
  targetSelect.addEventListener('change', () => {
    if (!targetSelect.value) return;
    void window.rosecr.selectTarget(targetSelect.value).catch((error: unknown) => {
      captureStatus.textContent = error instanceof Error ? error.message : String(error);
      captureStatus.dataset.status = 'error';
    });
  });
  getElement<HTMLButtonElement>('#start-probe').addEventListener('click', () => {
    void window.rosecr.startCaptureProbe().catch((error: unknown) => {
      captureStatus.textContent = error instanceof Error ? error.message : String(error);
      captureStatus.dataset.status = 'error';
    });
  });
  getElement<HTMLButtonElement>('#stop-probe').addEventListener('click', () => void window.rosecr.stopCaptureProbe());

  window.rosecr.onStateChanged(render);
  void window.rosecr.getState().then(render);
})();
