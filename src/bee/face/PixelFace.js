import * as THREE from 'three';

// Face rectangle in the bee texture atlas: columns 10-16, canvas rows 47-53.
// The model's UVs run bottom-up, so face row t (0 = forehead) lives at canvas row 53 - t.
const FX = 10;
const FY = 47;
const EYE_L = 10; // left eye columns 10-11, right eye 15-16; eye block is face rows 3-5
const EYE_R = 15;

const PINK = '#ef6f8c';
const PINK_LIGHT = '#ffd0db';
const BLUSH = '#e8905a';
const TEAR = '#6fd0ff';
const RED = '#d8302a';
const RED_LIGHT = '#ff8a6b';
const DARK = '#1e1a16';

const q = (v, steps = 4) => Math.round(v * steps) / steps;

/**
 * Paints expressions onto a copy of the model's texture, replacing the face pixels whenever the
 * quantised expression state changes. Everything else in the atlas is untouched.
 */
export class PixelFace {
  constructor(material) {
    const src = material.map;
    const img = src.image;
    this.canvas = document.createElement('canvas');
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.drawImage(img, 0, 0);
    this.base = this.ctx.getImageData(FX, FY, 7, 7);
    this.yellow = this.#sample(13, 49);
    this.teal = this.#sample(11, 50);

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

  #sample(x, y) {
    const d = this.ctx.getImageData(x, y, 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  }

  /** Paint at face column x and face row t (top-down), w wide and h rows tall (downwards). */
  #px(x, t, color, w = 1, h = 1) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, 53 - t - (h - 1), w, h);
  }

  apply(face) {
    const c = face.current;
    const blink = face.blinkFactor;
    const state = {
      openL: q(Math.min(1, c.eyeOpen[0] * blink)),
      openR: q(Math.min(1, c.eyeOpen[1] * blink)),
      happy: c.happy > 0.5,
      squeeze: c.squeeze > 0.5,
      heart: c.heart > 0.5,
      brow: c.brow > 0.4 ? 1 : c.brow < -0.4 ? -1 : 0,
      blush: c.blush > 0.4,
      tears: c.tears > 0.4,
      sweat: c.sweat > 0.4,
      mouth: c.mouthOpen > 0.45 ? 'open' : c.mouthCurve > 0.7 ? 'smile' : c.mouthCurve < -0.3 ? 'frown' : c.cat > 0.5 ? 'cat' : 'none',
      angry: c.brow > 0.6 && c.mouthCurve < 0,
    };
    const key = JSON.stringify(state);
    if (key === this.key) return;
    this.key = key;
    this.#draw(state);
  }

  #eye(x, open, s) {
    const inner = x === EYE_L ? 1 : 0; // column offset (0/1) nearest the face centre
    const outer = 1 - inner;
    const teal = s.angry ? RED : this.teal;
    const light = s.angry ? RED_LIGHT : '#bff4f6';
    this.#px(x, 3, this.yellow, 2, 3); // clear the eye block (rows 3-5)
    if (s.heart) {
      this.#px(x, 3, PINK, 2, 2);
      this.#px(x + outer, 3, PINK_LIGHT);
      return;
    }
    if (s.happy || s.squeeze) {
      this.#px(x, 3, DARK, 2, 1);
      this.#px(x + outer, 4, DARK);
      return;
    }
    if (open <= 0.25) {
      this.#px(x, 5, DARK, 2, 1);
      return;
    }
    if (open <= 0.6) {
      this.#px(x, 4, DARK, 2, 2);
      this.#px(x + inner, 4, teal);
      return;
    }
    // Pupil stays put (as in the original texture): inner column, top of the eye block.
    this.#px(x, 3, DARK, 2, 3);
    this.#px(x + inner, 3, teal);
    this.#px(x + inner, 4, light);
  }

  #draw(s) {
    this.ctx.putImageData(this.base, FX, FY);
    this.#eye(EYE_L, s.openL, s);
    this.#eye(EYE_R, s.openR, s);

    if (s.brow < 0) {
      this.#px(11, 2, DARK);
      this.#px(15, 2, DARK);
    } else if (s.brow > 0) {
      this.#px(10, 2, DARK);
      this.#px(16, 2, DARK);
    }
    if (s.blush) {
      this.#px(10, 6, BLUSH);
      this.#px(16, 6, BLUSH);
    }
    if (s.tears) {
      this.#px(11, 6, TEAR);
      this.#px(15, 6, TEAR);
    }
    if (s.sweat) this.#px(16, 1, TEAR);

    switch (s.mouth) {
      case 'open':
        this.#px(13, 5, DARK, 1, 2);
        break;
      case 'smile':
        this.#px(12, 5, DARK);
        this.#px(14, 5, DARK);
        this.#px(13, 6, DARK);
        break;
      case 'frown':
        this.#px(12, 6, DARK);
        this.#px(14, 6, DARK);
        this.#px(13, 5, DARK);
        break;
      case 'cat':
        this.#px(12, 5, DARK);
        this.#px(14, 5, DARK);
        this.#px(13, 6, DARK);
        this.#px(13, 4, DARK);
        break;
    }
    this.tex.needsUpdate = true;
  }
}
