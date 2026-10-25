import {
  REGION_KEYBOARD_STEP,
  adjustRegion,
  formatRegion,
  meetsMinimumSize,
  regionFromPoints,
  type NormalizedPoint,
  type NormalizedRegion
} from '../shared/region';

const getElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing region selector element: ${selector}`);
  return element;
};

const surface = getElement<HTMLElement>('#surface');
const box = getElement<HTMLElement>('#region-box');
const values = getElement<HTMLOutputElement>('#region-values');
const toolbar = getElement<HTMLElement>('#toolbar');

const arrowSteps: Partial<Record<string, { dx: number; dy: number }>> = {
  ArrowLeft: { dx: -REGION_KEYBOARD_STEP, dy: 0 },
  ArrowRight: { dx: REGION_KEYBOARD_STEP, dy: 0 },
  ArrowUp: { dx: 0, dy: -REGION_KEYBOARD_STEP },
  ArrowDown: { dx: 0, dy: REGION_KEYBOARD_STEP }
};

let draft: NormalizedRegion | null = null;
let defaultRegion: NormalizedRegion | null = null;
let drag: { start: NormalizedPoint; previous: NormalizedRegion } | null = null;

function render(): void {
  box.hidden = !draft;
  if (!draft) return;
  box.style.left = `${draft.x * 100}%`;
  box.style.top = `${draft.y * 100}%`;
  box.style.width = `${draft.width * 100}%`;
  box.style.height = `${draft.height * 100}%`;
  values.value = formatRegion(draft);
  // Keep the controls off the area being selected.
  toolbar.dataset.position = draft.y + draft.height / 2 > 0.5 ? 'top' : 'bottom';
}

function pointFrom(event: PointerEvent): NormalizedPoint {
  return { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
}

function save(): void {
  if (draft) window.regionSelector.finish({ kind: 'confirmed', region: draft });
}

function cancel(): void {
  window.regionSelector.finish({ kind: 'cancelled' });
}

function reset(): void {
  if (!defaultRegion) return;
  draft = { ...defaultRegion };
  render();
}

surface.addEventListener('pointerdown', (event) => {
  if (!draft || event.button !== 0) return;
  drag = { start: pointFrom(event), previous: draft };
  surface.setPointerCapture(event.pointerId);
});

surface.addEventListener('pointermove', (event) => {
  if (!drag) return;
  draft = regionFromPoints(drag.start, pointFrom(event));
  render();
});

surface.addEventListener('pointerup', () => {
  if (!drag) return;
  // A click or tiny drag keeps the previous rectangle instead of producing an unusable one.
  if (draft && !meetsMinimumSize(draft)) draft = drag.previous;
  drag = null;
  render();
});

surface.addEventListener('pointercancel', () => {
  if (!drag) return;
  draft = drag.previous;
  drag = null;
  render();
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) return;
  const step = arrowSteps[event.key];
  if (step && draft) {
    event.preventDefault();
    draft = adjustRegion(draft, { ...step, resize: event.shiftKey });
    render();
    return;
  }
  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      save();
      break;
    case 'Escape':
      event.preventDefault();
      cancel();
      break;
    case 'r':
    case 'R':
      event.preventDefault();
      reset();
      break;
  }
});

getElement<HTMLButtonElement>('#confirm').addEventListener('click', save);
getElement<HTMLButtonElement>('#cancel').addEventListener('click', cancel);
getElement<HTMLButtonElement>('#reset').addEventListener('click', reset);

void window.regionSelector.initial().then((init) => {
  if (!init) return;
  draft = init.region;
  defaultRegion = init.defaultRegion;
  render();
  surface.focus();
});
