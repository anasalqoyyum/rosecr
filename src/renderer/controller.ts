type ControllerState = import('../main/control-state').ControlState;
type ControllerCommand = import('../shared/contracts').ControlCommand;

(() => {
  const getElement = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing controller element: ${selector}`);
    return element;
  };

  const elements = {
    play: getElement<HTMLButtonElement>('#play'),
    status: getElement<HTMLInputElement>('#status'),
    direction: getElement<HTMLSelectElement>('#direction'),
    overlay: getElement<HTMLButtonElement>('#overlay'),
    auto: getElement<HTMLButtonElement>('#auto'),
    scope: getElement<HTMLSelectElement>('#scope'),
    clear: getElement<HTMLButtonElement>('#clear'),
    settings: getElement<HTMLButtonElement>('#settings')
  };

  function render(state: ControllerState): void {
    elements.status.value = state.statusMessage;
    elements.status.dataset.status = state.status;
    elements.direction.value = state.direction;
    elements.scope.value = state.scope;
    elements.overlay.setAttribute('aria-pressed', String(state.overlayVisible));
    elements.auto.setAttribute('aria-pressed', String(state.autoEnabled));
    elements.auto.textContent = state.autoEnabled ? 'Auto on' : 'Auto';
    elements.play.disabled = state.status === 'error';
  }

  async function send(command: ControllerCommand): Promise<void> {
    try {
      render(await window.rosecr.command(command));
    } catch (error) {
      elements.status.value = error instanceof Error ? error.message : String(error);
      elements.status.dataset.status = 'error';
    }
  }

  elements.play.addEventListener('click', () => void send({ type: 'play' }));
  elements.auto.addEventListener('click', () => void send({ type: 'set-auto', enabled: elements.auto.getAttribute('aria-pressed') !== 'true' }));
  elements.overlay.addEventListener('click', () => void send({ type: 'set-overlay-visible', visible: elements.overlay.getAttribute('aria-pressed') !== 'true' }));
  elements.clear.addEventListener('click', () => void send({ type: 'clear-overlays' }));
  elements.settings.addEventListener('click', () => void send({ type: 'open-settings' }));
  elements.direction.addEventListener('change', () => void send({ type: 'set-direction', direction: elements.direction.value as ControllerState['direction'] }));
  elements.scope.addEventListener('change', () => void send({ type: 'set-scope', scope: elements.scope.value as ControllerState['scope'] }));

  window.rosecr.onStateChanged(render);
  void window.rosecr.getState().then(render);
})();
