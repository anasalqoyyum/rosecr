type SettingsState = import('../main/control-state').ControlState;
type SettingsShortcutAction = import('../shared/contracts').ShortcutAction;
type SettingsCaptureTarget = import('../main/control-state').CaptureTarget;
type SettingsGameTarget = import('../main/control-state').GameTargetState;
type SettingsRegion = import('../shared/region').NormalizedRegion;

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
  const targetStatus = getElement<HTMLElement>('#target-status');
  const targetCandidates = getElement<HTMLElement>('#target-candidates');
  const selectRegionButton = getElement<HTMLButtonElement>('#select-region');
  let currentState: SettingsState | null = null;

  const describeRegion = (region: SettingsRegion): string =>
    `x ${region.x.toFixed(2)} · y ${region.y.toFixed(2)} · w ${region.width.toFixed(2)} · h ${region.height.toFixed(2)}`;

  const describeWindow = (title: string, executableName: string): string =>
    executableName ? `${title} (${executableName})` : title;

  function showCaptureError(error: unknown): void {
    captureStatus.textContent = error instanceof Error ? error.message : String(error);
    captureStatus.dataset.status = 'error';
  }

  function chooseTarget(id: string): void {
    void window.rosecr.selectTarget(id).catch(showCaptureError);
  }

  function renderTarget(target: SettingsGameTarget): void {
    const summary = getElement<HTMLElement>('#target-summary');
    let candidates: SettingsCaptureTarget[] = [];
    switch (target.kind) {
      case 'unselected':
        summary.textContent = 'Choose the game window to capture.';
        delete targetStatus.dataset.status;
        break;
      case 'attached':
        summary.textContent = `Saved game: ${describeWindow(target.window.name, target.window.executableName)}. It stays saved through restarts and errors.`;
        targetStatus.dataset.status = 'running';
        break;
      case 'detached':
        summary.textContent = `Saved game: ${describeWindow(target.saved.title, target.saved.executableName)}. The window is not open; Rosecr reconnects when it returns.`;
        targetStatus.dataset.status = 'waiting';
        break;
      case 'ambiguous':
        summary.textContent = `${target.candidates.length} open windows match ${describeWindow(target.saved.title, target.saved.executableName)}. Choose the one to capture. Your region is kept.`;
        targetStatus.dataset.status = 'waiting';
        candidates = target.candidates;
        break;
      default: {
        const unhandled: never = target;
        throw new Error(`Unknown game target state: ${JSON.stringify(unhandled)}`);
      }
    }
    targetCandidates.hidden = candidates.length === 0;
    targetCandidates.replaceChildren(...candidates.map((candidate) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${candidate.name} · PID ${candidate.processId}`;
      button.addEventListener('click', () => chooseTarget(candidate.id));
      return button;
    }));
  }

  function renderRegion(state: SettingsState): void {
    const previewBox = getElement<HTMLElement>('#region-preview-box');
    const region = state.region;
    getElement<HTMLElement>('#region-summary').textContent = region
      ? `${describeRegion(region)} of the game client area.`
      : 'No region saved. Draw one over the game window.';
    previewBox.hidden = !region;
    if (region) {
      previewBox.style.left = `${region.x * 100}%`;
      previewBox.style.top = `${region.y * 100}%`;
      previewBox.style.width = `${region.width * 100}%`;
      previewBox.style.height = `${region.height * 100}%`;
    }
    selectRegionButton.textContent = region ? 'Reselect' : 'Select region';
    selectRegionButton.disabled = state.gameTarget.kind === 'unselected';
  }

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
    const target = state.gameTarget;
    getElement<HTMLElement>('#diagnostic-target').textContent =
      target.kind === 'unselected' ? 'Not selected'
        : target.kind === 'attached' ? target.window.name
          : `${target.saved.title} (not connected)`;
    getElement<HTMLElement>('#diagnostic-region').textContent = state.region ? describeRegion(state.region) : 'Not saved';
    renderTarget(target);
    renderRegion(state);
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
      if (currentState?.gameTarget.kind === 'attached') targetSelect.value = currentState.gameTarget.window.id;
      captureStatus.textContent = targets.length ? 'Choose a window to run the M0 capture probe.' : 'No capturable windows found.';
    } catch (error) {
      showCaptureError(error);
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
    if (targetSelect.value) chooseTarget(targetSelect.value);
  });
  selectRegionButton.addEventListener('click', () => {
    captureStatus.textContent = 'Draw the region over the game window. Enter saves, Esc cancels.';
    delete captureStatus.dataset.status;
    void window.rosecr.selectRegion().catch(showCaptureError);
  });
  getElement<HTMLButtonElement>('#start-probe').addEventListener('click', () => {
    void window.rosecr.startCaptureProbe().catch(showCaptureError);
  });
  getElement<HTMLButtonElement>('#stop-probe').addEventListener('click', () => void window.rosecr.stopCaptureProbe());

  window.rosecr.onStateChanged(render);
  void window.rosecr.getState().then(render);
})();
