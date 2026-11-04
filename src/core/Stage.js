import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CAMERA_FOV = 28;
/** CSS pixels per world unit on the z = 0 plane; kept constant so the window can change height without the bee changing size. */
export const PIXELS_PER_UNIT = 100;

export class Stage {
  constructor(container, { maxPixelRatio = 2 } = {}) {
    this.container = container;
    this.maxPixelRatio = maxPixelRatio;
    this.autoQuality = true;
    this.fps = 60;
    this.qFrames = 0;
    this.qStart = performance.now();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
    this.camera.lookAt(0, 0, 0);

    this.#createFloor();
    this.#createLights();

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  #createLights() {
    this.lightRig = new THREE.Group();
    this.scene.add(this.lightRig);

    this.focus = new THREE.Object3D();
    this.lightRig.add(this.focus);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3.5, 6, 6);
    key.target = this.focus;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    this.lightRig.add(key);

    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.4);
    fill.position.set(5, 2, 4);
    fill.target = this.focus;
    this.lightRig.add(fill);

    const rimL = new THREE.DirectionalLight(0x9fe8ff, 1.6);
    rimL.position.set(-5, 3, -5);
    rimL.target = this.focus;
    const rimR = new THREE.DirectionalLight(0x9fe8ff, 1.3);
    rimR.position.set(5, 4, -5);
    rimR.target = this.focus;
    this.lightRig.add(rimL, rimR);

    this.lights = { key, fill, rimL, rimR };
    this.setFocus(0, 0, 1);
  }

  #createFloor() {
    const material = new THREE.ShadowMaterial({ opacity: 0.28, transparent: true });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), material);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  /** Contact shadow fades out as the pet gets further from the floor (0 = none, 1 = full). */
  setShadowStrength(k) {
    this.floor.material.opacity = 0.28 * Math.min(1, Math.max(0, k));
  }

  setFocus(x, floorY, scale) {
    this.lightRig.position.set(x, floorY, 0);
    this.focus.position.set(0, 1.2 * scale, 0);
    this.floor.position.y = floorY;
    if (scale !== this.focusScale) {
      this.focusScale = scale;
      const cam = this.lights.key.shadow.camera;
      const r = 2.2 * scale;
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.updateProjectionMatrix();
    }
  }

  get width() {
    return this.container.clientWidth || window.innerWidth;
  }

  get height() {
    return this.container.clientHeight || window.innerHeight;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, this.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    const halfHeight = this.height / (2 * PIXELS_PER_UNIT);
    this.camera.position.set(0, 0, halfHeight / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));
    this.camera.updateProjectionMatrix();
  }

  #adaptQuality() {
    this.qFrames++;
    const now = performance.now();
    const elapsed = (now - this.qStart) / 1000;
    if (elapsed < 3) return;
    this.fps = this.qFrames / elapsed;
    this.qFrames = 0;
    this.qStart = now;
    if (!this.autoQuality || document.visibilityState !== 'visible') return;
    if (this.fps < 50 && this.maxPixelRatio > 1) {
      this.maxPixelRatio = Math.max(1, this.maxPixelRatio - 0.25);
      this.resize();
    }
  }

  render() {
    this.#adaptQuality();
    this.renderer.render(this.scene, this.camera);
  }
}
