import { PIXELS_PER_UNIT } from './Stage.js';

/** Reference height in world units at scale 1 that the `petSize` setting maps to; every mob is rigged to roughly this. */
export const PET_HEIGHT = 1.25;
const PET_HALF_WIDTH = 1.1;
const PET_HALF_DEPTH = 0.75;
const FLOOR_MARGIN_PX = 8;

/** Maps between window pixels and world units on the z = 0 plane the pet lives on. */
export class ScreenSpace {
  constructor(stage) {
    this.stage = stage;
  }

  get halfHeight() {
    return this.stage.height / (2 * PIXELS_PER_UNIT);
  }

  get halfWidth() {
    return this.stage.width / (2 * PIXELS_PER_UNIT);
  }

  get pixelsPerUnit() {
    return PIXELS_PER_UNIT;
  }

  /** Height above the floor (in world units) of a window pixel row. Stable when the window grows upward. */
  heightAboveFloor(py, floorY) {
    return this.toWorldY(py) - floorY;
  }

  scaleForPixels(px) {
    return px / (PET_HEIGHT * this.pixelsPerUnit);
  }

  toWorldX(px) {
    return (px / this.stage.width - 0.5) * 2 * this.halfWidth;
  }

  toWorldY(py) {
    return (0.5 - py / this.stage.height) * 2 * this.halfHeight;
  }

  /** Floor height such that the pet's nearest (perspective-lowest) point sits just above the window bottom. */
  floorY(scale) {
    const D = this.stage.camera.position.z;
    const near = PET_HALF_DEPTH * scale;
    return (-this.halfHeight + FLOOR_MARGIN_PX / PIXELS_PER_UNIT) * ((D - near) / D);
  }

  movementRange(scale) {
    const pad = PET_HALF_WIDTH * scale;
    let min = -this.halfWidth + pad;
    let max = this.halfWidth - pad;
    if (min > max) min = max = 0;
    return [min, max];
  }
}
