import * as THREE from 'three';

// Head front in the axolotl texture atlas: columns 5-12, canvas rows 53-57. The model's UVs run bottom-up,
// so face row t (0 = forehead, 4 = chin) lives at canvas row 57 - t. The eyes sit on row 2 and wrap one
// pixel onto each side of the head (columns 4-5 and 12-13), so the repainted rectangle is one column wider
// on each side than the face itself.
const FX = 4;
const FY = 53;
const FW = 10;
const FH = 5;
const EYE_L = 4; // left eye columns 4-5, right eye 12-13 (outer column is on the side of the head)
const EYE_R = 12;

const PINK = '#ef6f8c';
const TEAR = '#6fd0ff';
const DARK = '#4a1636';
const LID = '#b04a7c';

/**
 * Paints expressions onto a copy of the model's texture, replacing the face pixels whenever the
 * quantised expression state changes. Everything else in the atlas is untouched.
 */
export class AxolotlFace {
  constructor(material) {
    const src = material.map;
    const img = src.image;
    this.canvas = document.createElement('canvas');
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.drawImage(img, 0, 0);
    this.base = this.ctx.getImageData(FX, FY, FW, FH);

    const tex = new THREE.CanvasTexture(this.canvas);
    tex.flipY = src.flipY;
    tex.colorSpace = src.colorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = src.wrapS;
    tex.wrapT = src.wrapT;
    material.map = tex;
    material.needsUpdate = true;
    this.tex = tex;
    this.key = '';
  }

  /** Paint at atlas column x and face row t (top-down), w wide and h rows tall (downwards). */
  #px(x, t, color, w = 1, h = 1) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, FY + FH - 1 - t - (h - 1), w, h);
  }

  apply(face) {
    const c = face.current;
    const blink = face.blinkFactor;
    const state = {
      openL: c.eyeOpen[0] * blink > 0.25,
      openR: c.eyeOpen[1] * blink > 0.25,
      heart: c.heart > 0.5,
      brow: c.brow > 0.4 ? 1 : c.brow < -0.4 ? -1 : 0,
      tears: c.tears > 0.4,
      sweat: c.sweat > 0.4,
      mouth: c.mouthOpen > 0.45 ? 'open' : c.mouthCurve > 0.7 ? 'smile' : c.mouthCurve < -0.3 ? 'frown' : 'none',
    };
    const key = JSON.stringify(state);
    if (key === this.key) return;
    this.key = key;
    this.#draw(state);
  }

  /** The eyes never move: the two original pixels only change colour (closed = lid tint, love = pink). */
  #eye(x, open, s) {
    if (s.heart) this.#px(x, 2, PINK, 2, 1);
    else if (!open) this.#px(x, 2, LID, 2, 1);
  }

  #draw(s) {
    this.ctx.putImageData(this.base, FX, FY);
    this.#eye(EYE_L, s.openL, s);
    this.#eye(EYE_R, s.openR, s);

    if (s.brow < 0) {
      this.#px(4, 1, DARK);
      this.#px(13, 1, DARK);
    } else if (s.brow > 0) {
      this.#px(5, 1, DARK);
      this.#px(12, 1, DARK);
    }
    if (s.tears) {
      this.#px(5, 3, TEAR);
      this.#px(12, 3, TEAR);
    }
    if (s.sweat) this.#px(12, 0, TEAR);

    switch (s.mouth) {
      case 'open':
        this.#px(8, 3, DARK, 2, 1);
        break;
      case 'smile':
        this.#px(7, 3, DARK);
        this.#px(10, 3, DARK);
        this.#px(8, 4, DARK, 2, 1);
        break;
      case 'frown':
        this.#px(7, 4, DARK);
        this.#px(10, 4, DARK);
        this.#px(8, 3, DARK, 2, 1);
        break;
    }
    this.tex.needsUpdate = true;
  }
}
