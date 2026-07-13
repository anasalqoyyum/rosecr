const shortcutLabels = { play: 'Play', auto: 'Auto', overlay: 'Overlay', clear: 'Clear' };
const targetSelect = document.querySelector('#target');
const captureStatus = document.querySelector('#capture-status');
let currentState = null;

function showPage(page) {
  for (const button of document.querySelectorAll('[data-page]')) {
    button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  }
  for (const section of document.querySelectorAll('[data-section]')) {
    section.hidden = section.dataset.section !== page;
  }
}

function renderShortcuts(state) {
  const container = document.querySelector('#shortcut-fields');
  if (container.childElementCount > 0) {
    for (const input of container.querySelectorAll('input')) {
      if (document.activeElement !== input) input.value = state.shortcuts[input.dataset.action] ?? '';
      const conflict = state.shortcutConflicts[input.dataset.action];
      const output = container.querySelector(`[data-conflict="${input.dataset.action}"]`);
      output.textContent = conflict ?? '';
    }
    return;
  }

  for (const [action, label] of Object.entries(shortcutLabels)) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const labelElement = document.createElement('label');
    labelElement.htmlFor = `shortcut-${action}`;
    labelElement.textContent = label;
    const input = document.createElement('input');
    input.id = `shortcut-${action}`;
    input.dataset.action = action;
    input.placeholder = 'Disabled';
    input.value = state.shortcuts[action] ?? '';
    input.addEventListener('change', () =>
      window.rosecr.command({ type: 'set-shortcut', action, accelerator: input.value.trim() || null })
    );
    const conflict = document.createElement('output');
    conflict.className = 'field-error';
    conflict.dataset.conflict = action;
    row.append(labelElement, input, conflict);
    container.append(row);
  }
}

function render(state) {
  currentState = state;
  document.querySelector('#general-direction').value = state.direction;
  document.querySelector('#capture-scope').value = state.scope;
  document.querySelector('#overlay-visible').checked = state.overlayVisible;
  captureStatus.textContent = state.statusMessage;
  captureStatus.dataset.status = state.status;
  document.querySelector('#diagnostic-state').textContent = state.statusMessage;
  document.querySelector('#diagnostic-target').textContent = state.selectedTarget?.name ?? 'Not selected';
  document.querySelector('#diagnostic-frames').textContent = String(state.captureProbe.frameCount);
  document.querySelector('#diagnostic-latency').textContent = state.captureProbe.firstFrameLatencyMs === null
    ? '—'
    : `${state.captureProbe.firstFrameLatencyMs} ms`;
  document.querySelector('#diagnostic-size').textContent = state.captureProbe.frameSize
    ? `${state.captureProbe.frameSize.width} × ${state.captureProbe.frameSize.height}`
    : '—';
  renderShortcuts(state);
}

async function refreshTargets() {
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

for (const button of document.querySelectorAll('[data-page]')) {
  button.addEventListener('click', () => {
    showPage(button.dataset.page);
    if (button.dataset.page === 'capture') refreshTargets();
  });
}

document.querySelector('#general-direction').addEventListener('change', (event) =>
  window.rosecr.command({ type: 'set-direction', direction: event.target.value })
);
document.querySelector('#capture-scope').addEventListener('change', (event) =>
  window.rosecr.command({ type: 'set-scope', scope: event.target.value })
);
document.querySelector('#overlay-visible').addEventListener('change', (event) =>
  window.rosecr.command({ type: 'set-overlay-visible', visible: event.target.checked })
);
document.querySelector('#refresh-targets').addEventListener('click', refreshTargets);
targetSelect.addEventListener('change', () => {
  if (targetSelect.value) window.rosecr.selectTarget(targetSelect.value).catch((error) => {
    captureStatus.textContent = error.message;
    captureStatus.dataset.status = 'error';
  });
});
document.querySelector('#start-probe').addEventListener('click', () =>
  window.rosecr.startCaptureProbe().catch((error) => {
    captureStatus.textContent = error.message;
    captureStatus.dataset.status = 'error';
  })
);
document.querySelector('#stop-probe').addEventListener('click', () => window.rosecr.stopCaptureProbe());

window.rosecr.onStateChanged(render);
window.rosecr.getState().then(render);
