/**
 * Convert a physical-pixel client rectangle into Electron DIP bounds by converting both corners.
 * @param {{ left: number, top: number, right: number, bottom: number }} physical
 * @param {(point: Electron.Point) => Electron.Point} screenToDipPoint
 */
function physicalClientRectToDip(physical, screenToDipPoint) {
  const topLeft = screenToDipPoint({ x: physical.left, y: physical.top });
  const bottomRight = screenToDipPoint({ x: physical.right, y: physical.bottom });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y)
  };
}

/** @param {{ width: number, height: number }} bounds */
function markerBounds(bounds) {
  const size = Math.max(20, Math.min(72, Math.round(Math.min(bounds.width, bounds.height) * 0.08)));
  return { x: Math.round(bounds.width * 0.08), y: Math.round(bounds.height * 0.1), width: size, height: size };
}

module.exports = { markerBounds, physicalClientRectToDip };
