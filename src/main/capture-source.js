/** @param {string} sourceId */
function parseWindowSourceId(sourceId) {
  const match = /^window:(\d+):(0|1)$/.exec(sourceId);
  if (!match) return null;
  return { nativeHandle: match[1], ownedByCurrentProcess: match[2] === '1' };
}

/** @param {{ id: string }} source @param {Set<string>} ownedHandles */
function isRosecrSource(source, ownedHandles) {
  const parsed = parseWindowSourceId(source.id);
  return parsed?.ownedByCurrentProcess === true || (parsed ? ownedHandles.has(parsed.nativeHandle) : false);
}

/** @param {{ id: string, name: string, thumbnail?: { isEmpty: () => boolean, toDataURL: () => string }, appIcon?: { isEmpty: () => boolean, toDataURL: () => string } | null }[]} sources @param {Set<string>} ownedHandles @param {Set<string>} [ownedNames] */
function publicCaptureTargets(sources, ownedHandles, ownedNames = new Set()) {
  return sources
    .filter((source) => !isRosecrSource(source, ownedHandles) && !ownedNames.has(source.name))
    .map((source) => {
      const parsed = parseWindowSourceId(source.id);
      return {
        id: source.id,
        name: source.name,
        nativeHandle: parsed?.nativeHandle ?? '',
        thumbnailDataUrl: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
        iconDataUrl: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null
      };
    });
}

/** @param {{ handle: string, title: string, processId: number }[]} windows @param {number} ownProcessId */
function nativeWindowsToCaptureTargets(windows, ownProcessId) {
  return windows
    .filter((window) => window.processId !== ownProcessId)
    .map((window) => ({
      id: `window:${window.handle}:0`,
      name: window.title,
      nativeHandle: window.handle,
      thumbnailDataUrl: null,
      iconDataUrl: null
    }));
}

module.exports = { isRosecrSource, nativeWindowsToCaptureTargets, parseWindowSourceId, publicCaptureTargets };
