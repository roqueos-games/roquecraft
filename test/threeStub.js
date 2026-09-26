// Shared headless Three.js stub for the native-game component specs (VOLT /
// UNDA / EKO). It accepts the full attribute + sprite + line + mesh plumbing
// the games use without ever touching a real WebGL context. Consumed via:
//   vi.mock('three', async () => (await import('.../threeStub.js')).makeThreeStub())
export function makeThreeStub() {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x
      this.y = y
      this.z = z
    }
    set(x, y, z) {
      this.x = x
      this.y = y
      this.z = z
      return this
    }
    setScalar(s) {
      return this.set(s, s, s)
    }
    copy(v) {
      return this.set(v.x, v.y, v.z)
    }
    // Aritmetica de verdade: sem ela, todo spec que exercita decisao baseada em
    // DISTANCIA (spawn longe do jogador, alcance de deteccao, raio de coleta)
    // fica sem como afirmar nada, e a suite so consegue testar plumbing.
    add(v) {
      return this.set(this.x + v.x, this.y + v.y, this.z + v.z)
    }
    sub(v) {
      return this.set(this.x - v.x, this.y - v.y, this.z - v.z)
    }
    addVectors(a, b) {
      return this.set(a.x + b.x, a.y + b.y, a.z + b.z)
    }
    subVectors(a, b) {
      return this.set(a.x - b.x, a.y - b.y, a.z - b.z)
    }
    multiplyScalar(s) {
      return this.set(this.x * s, this.y * s, this.z * s)
    }
    length() {
      return Math.hypot(this.x, this.y, this.z)
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z
    }
    normalize() {
      const n = this.length() || 1
      return this.multiplyScalar(1 / n)
    }
    distanceTo(v) {
      return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z)
    }
    distanceToSquared(v) {
      const dx = this.x - v.x
      const dy = this.y - v.y
      const dz = this.z - v.z
      return dx * dx + dy * dy + dz * dz
    }
    clone() {
      return new Vec3(this.x, this.y, this.z)
    }
  }
  class Color {
    constructor() {
      this.r = 1
      this.g = 1
      this.b = 1
    }
    setScalar() {
      return this
    }
    set() {
      return this
    }
    setHex() {
      return this
    }
    setRGB() {
      return this
    }
    copy() {
      return this
    }
    lerp() {
      return this
    }
  }
  class Object3D {
    constructor() {
      this.children = []
      this.position = new Vec3()
      this.scale = new Vec3()
      this.rotation = new Vec3()
      this.visible = true
      this.userData = {}
      this.material = { opacity: 1, rotation: 0, dispose() {} }
    }
    add(...i) {
      this.children.push(...i)
    }
    remove(x) {
      this.children = this.children.filter((c) => c !== x)
    }
  }
  class Attr {
    constructor(array, itemSize) {
      this.array = array
      this.itemSize = itemSize
      this.needsUpdate = false
    }
  }
  class Geometry {
    constructor() {
      this.attributes = {}
    }
    setAttribute(n, a) {
      this.attributes[n] = a
      return this
    }
    setDrawRange() {}
    rotateX() {
      return this
    }
    rotateY() {
      return this
    }
    translate() {
      return this
    }
    dispose() {}
  }
  class PlaneGeometry extends Geometry {
    constructor(w = 1, h = 1, sx = 1, sy = 1) {
      super()
      const n = (sx + 1) * (sy + 1)
      this.attributes.position = new Attr(new Float32Array(n * 3), 3)
    }
  }
  class Material {
    constructor(opts = {}) {
      Object.assign(this, opts)
      this.opacity = opts.opacity ?? 1
      this.rotation = 0
      this.color = new Color()
    }
    clone() {
      return new Material(this)
    }
    dispose() {}
  }
  class Camera extends Object3D {
    updateProjectionMatrix() {}
    lookAt() {}
  }
  class Renderer {
    constructor() {
      this.domElement = document.createElement('canvas')
      this.domElement.width = 640
      this.domElement.height = 480
      this.shadowMap = { enabled: false, type: 0 }
    }
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  }
  class Shape {
    moveTo() {
      return this
    }
    lineTo() {
      return this
    }
    bezierCurveTo() {
      return this
    }
    quadraticCurveTo() {
      return this
    }
    closePath() {
      return this
    }
  }
  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x
      this.y = y
    }
    set(x, y) {
      this.x = x
      this.y = y
      return this
    }
  }
  class ShadowLight extends Object3D {
    constructor() {
      super()
      this.castShadow = false
      this.shadow = {
        mapSize: new Vec2(),
        camera: { left: 0, right: 0, top: 0, bottom: 0, far: 0 },
        bias: 0,
      }
    }
  }
  class CanvasTexture {
    constructor() {
      this.wrapS = 0
      this.wrapT = 0
      this.colorSpace = 'srgb'
      this.repeat = new Vec2()
    }
    dispose() {}
  }
  // A minimal curve: keeps its control points; getPoints returns them.
  class CatmullRomCurve3 {
    constructor(points = []) {
      this.points = points
    }
    getPoints() {
      return this.points
    }
  }
  class Plane {
    constructor() {}
  }
  // additive: lets the racer's sky/sea shader + fog + bbox code actually RUN headless
  // (previously undefined → guarded off), so specs exercise those paths.
  class ShaderMaterial extends Material {
    constructor(o = {}) {
      super(o)
      this.uniforms = o.uniforms || {}
    }
  }
  class FogExp2 {
    constructor(color, density) {
      this.color = new Color()
      this.density = density ?? 0
    }
  }
  class Box3 {
    constructor() {
      this.min = new Vec3()
      this.max = new Vec3()
    }
    setFromObject() {
      return this
    }
    getSize(v) {
      return v || new Vec3()
    }
    getCenter(v) {
      return v || new Vec3()
    }
  }
  class Raycaster {
    constructor() {
      this.ray = {
        intersectPlane(_plane, target) {
          // Deterministic: map to a fixed pond point so gameplay math resolves
          target.set(2, 0, 1)
          return target
        },
      }
    }
    setFromCamera() {}
    intersectObjects() {
      return []
    }
    intersectObject() {
      return []
    }
  }
  const Points = class extends Object3D {
    constructor(geo, mat) {
      super()
      this.geometry = geo
      this.material = mat
    }
  }
  return {
    Scene: Object3D,
    Group: Object3D,
    Object3D,
    Points,
    Sprite: class extends Object3D {
      constructor(mat) {
        super()
        this.material = mat
      }
    },
    Line: class extends Object3D {
      constructor(geo, mat) {
        super()
        this.geometry = geo
        this.material = mat
      }
    },
    Mesh: class extends Object3D {
      constructor(geo, mat) {
        super()
        this.geometry = geo
        this.material = mat
      }
    },
    BufferGeometry: Geometry,
    PlaneGeometry,
    BoxGeometry: class extends Geometry {},
    SphereGeometry: class extends Geometry {},
    CylinderGeometry: class extends Geometry {},
    ConeGeometry: class extends Geometry {},
    TubeGeometry: class extends Geometry {},
    IcosahedronGeometry: class extends Geometry {},
    RingGeometry: class extends Geometry {},
    CircleGeometry: class extends Geometry {},
    TorusGeometry: class extends Geometry {},
    LatheGeometry: class extends Geometry {
      constructor(points) {
        super()
        this.points = points
      }
    },
    ExtrudeGeometry: class extends Geometry {
      constructor(shape) {
        super()
        this.shape = shape
      }
    },
    Shape,
    EdgesGeometry: class extends Geometry {
      constructor() {
        super()
      }
    },
    BufferAttribute: Attr,
    PointsMaterial: Material,
    SpriteMaterial: Material,
    LineBasicMaterial: Material,
    MeshBasicMaterial: Material,
    MeshStandardMaterial: Material,
    // Helpers matemáticos usados pelos services (createSky usa degToRad).
    MathUtils: { degToRad: (d) => (d * Math.PI) / 180, radToDeg: (r) => (r * 180) / Math.PI },
    // TextureLoader stub: alguns services (AmmoPickup/WeaponSystem/LevelManager)
    // instanciam no escopo do módulo; load() devolve uma textura fake usável.
    TextureLoader: class {
      load(_url, onLoad) {
        const tex = { wrapS: 0, wrapT: 0, colorSpace: 0, repeat: { set() {} }, dispose() {} }
        if (typeof onLoad === 'function') onLoad(tex)
        return tex
      }
    },
    MeshLambertMaterial: Material,
    MeshPhongMaterial: Material,
    MeshPhysicalMaterial: Material,
    ShadowMaterial: Material,
    LineSegments: class extends Object3D {
      constructor(geo, mat) {
        super()
        this.geometry = geo
        this.material = mat
      }
    },
    AmbientLight: class extends Object3D {},
    DirectionalLight: ShadowLight,
    PointLight: class extends Object3D {},
    HemisphereLight: class extends Object3D {},
    Fog: class {
      constructor() {}
    },
    OrthographicCamera: Camera,
    PerspectiveCamera: Camera,
    Color,
    Vector3: Vec3,
    Vector2: Vec2,
    ShaderMaterial,
    FogExp2,
    Box3,
    BackSide: 1,
    Plane,
    Raycaster,
    WebGLRenderer: Renderer,
    CanvasTexture,
    CatmullRomCurve3,
    AdditiveBlending: 1,
    NormalBlending: 0,
    DoubleSide: 2,
    FrontSide: 0,
    RepeatWrapping: 1000,
    PCFSoftShadowMap: 2,
    SRGBColorSpace: 'srgb',
  }
}
