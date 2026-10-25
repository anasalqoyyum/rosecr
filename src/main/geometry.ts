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

