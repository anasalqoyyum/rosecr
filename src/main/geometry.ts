import type { Point, Rectangle } from 'electron';

export interface PhysicalClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function physicalClientRectToDip(
  physical: PhysicalClientRect,
  screenToDipPoint: (point: Point) => Point
): Rectangle {
  const topLeft = screenToDipPoint({ x: physical.left, y: physical.top });
  const bottomRight = screenToDipPoint({ x: physical.right, y: physical.bottom });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y)
  };
}

export function markerBounds(bounds: Pick<Rectangle, 'width' | 'height'>): Rectangle {
  const size = Math.max(20, Math.min(72, Math.round(Math.min(bounds.width, bounds.height) * 0.08)));
  return { x: Math.round(bounds.width * 0.08), y: Math.round(bounds.height * 0.1), width: size, height: size };
}
