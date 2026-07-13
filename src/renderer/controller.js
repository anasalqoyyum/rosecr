const elements = {
  play: document.querySelector('#play'),
  status: document.querySelector('#status'),
  direction: document.querySelector('#direction'),
  overlay: document.querySelector('#overlay'),
  auto: document.querySelector('#auto'),
  scope: document.querySelector('#scope'),
  clear: document.querySelector('#clear'),
  settings: document.querySelector('#settings')
};

function render(state) {
  elements.status.value = state.statusMessage;
  elements.status.dataset.status = state.status;
  elements.direction.value = state.direction;
  elements.scope.value = state.scope;
  elements.overlay.setAttribute('aria-pressed', String(state.overlayVisible));
  elements.auto.setAttribute('aria-pressed', String(state.autoEnabled));
  elements.auto.textContent = state.autoEnabled ? 'Auto on' : 'Auto';
  elements.play.disabled = state.status === 'error';
}

async function send(command) {
  try {
    render(await window.rosecr.command(command));
  } catch (error) {
    elements.status.value = error instanceof Error ? error.message : String(error);
    elements.status.dataset.status = 'error';
  }
}

elements.play.addEventListener('click', () => send({ type: 'play' }));
elements.auto.addEventListener('click', () =>
  send({ type: 'set-auto', enabled: elements.auto.getAttribute('aria-pressed') !== 'true' })
);
elements.overlay.addEventListener('click', () =>
  send({ type: 'set-overlay-visible', visible: elements.overlay.getAttribute('aria-pressed') !== 'true' })
);
elements.clear.addEventListener('click', () => send({ type: 'clear-overlays' }));
elements.settings.addEventListener('click', () => send({ type: 'open-settings' }));
elements.direction.addEventListener('change', () => send({ type: 'set-direction', direction: elements.direction.value }));
elements.scope.addEventListener('change', () => send({ type: 'set-scope', scope: elements.scope.value }));

window.rosecr.onStateChanged(render);
window.rosecr.getState().then(render);
