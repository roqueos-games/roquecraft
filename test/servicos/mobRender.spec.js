import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createEntityLayer } from '../../src/servicos/render/entities.js'
import { packMobs, unpackMobs, createMob } from '../../src/servicos/mobs.js'

/**
 * O QUE ACONTECE QUANDO A LISTA DE MOBS ENCONTRA A CENA.
 *
 * As outras duas specs olham as pontas: o modelo (geometria) e a IA (yaw). Esta
 * olha a costura, que é onde os dois defeitos visíveis moravam — a orientação
 * aplicada ao contrário e a perna parada no cliente convidado.
 *
 * Não precisa de WebGL: `createEntityLayer` só monta grafo de cena. Quem precisa
 * de pixel é o turntable.
 */

// jsdom não tem canvas 2D; o grão procedural precisa de um. Textura não é o
// assunto aqui. (No topo do módulo: os modelos nascem durante a coleta.)
{
  const ctx2d = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    measureText: () => ({ width: 80 }),
    fillText: () => {},
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    set font(_v) {},
    set fillStyle(_v) {},
    set textAlign(_v) {},
    set textBaseline(_v) {},
  }
  HTMLCanvasElement.prototype.getContext = () => ctx2d
}

const camada = () => createEntityLayer(new THREE.Scene(), { shadows: false, particles: false })

/** Para onde a frente do bicho aponta no mundo. */
function frenteDe(grupo) {
  grupo.updateMatrixWorld(true)
  return new THREE.Vector3(0, 0, 1).applyQuaternion(grupo.quaternion)
}

/** Roda `n` quadros de 1/60 s empurrando o mob na direção pedida. */
function caminhar(layer, mob, dirX, dirZ, n = 90) {
  for (let i = 0; i < n; i++) {
    mob.x += dirX * 1.2 * (1 / 60)
    mob.z += dirZ * 1.2 * (1 / 60)
    layer.syncMobs([mob], 1 / 60)
  }
}

const mobBase = (over = {}) => ({
  id: 'm1',
  type: 'pig',
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  anim: 0,
  hurtFlash: 0,
  ...over,
})

describe('roquecraft - orientação na cena', () => {
  /*
   * O TESTE DE PONTA A PONTA DO DEFEITO ORIGINAL. `yaw` é rumo (yaw 0 = +Z), o
   * modelo olha pra +Z: depois de convergir, a frente do grupo tem que apontar
   * pro mesmo lado. Antes disso dava dot = −1: o bicho inteiro andava de ré.
   */
  it.each([
    ['norte', 0, -1],
    ['sul', 0, 1],
    ['leste', 1, 0],
    ['oeste', -1, 0],
  ])('o bicho aponta pra %s quando o rumo é pra lá', (_nome, dx, dz) => {
    const l = camada()
    const yaw = Math.atan2(dx, dz)
    const m = mobBase({ yaw })
    for (let i = 0; i < 120; i++) l.syncMobs([m], 1 / 60)
    const f = frenteDe(l.mobs.get('m1').group)
    expect(f.x).toBeCloseTo(dx, 2)
    expect(f.z).toBeCloseTo(dz, 2)
    l.dispose()
  })

  /*
   * Giro interpolado. O mob remoto chega a 8 Hz; atribuir `rotation.y` fazia a
   * cabeça estalar a cada pacote. Um quadro só não pode virar o bicho inteiro.
   */
  it('vira aos poucos, não de um quadro pro outro', () => {
    const l = camada()
    const m = mobBase({ yaw: 0 })
    l.syncMobs([m], 1 / 60)
    m.yaw = Math.PI // meia-volta de uma vez
    l.syncMobs([m], 1 / 60)
    const g = l.mobs.get('m1').group
    expect(Math.abs(g.rotation.y), 'virou tudo num quadro só').toBeLessThan(Math.PI / 2)
    for (let i = 0; i < 200; i++) l.syncMobs([m], 1 / 60)
    expect(Math.abs(frenteDe(g).z), 'nunca terminou de virar').toBeCloseTo(1, 2)
    l.dispose()
  })

  it('yaw NaN não faz o bicho sumir', () => {
    const l = camada()
    const m = mobBase({ yaw: 0 })
    for (let i = 0; i < 30; i++) l.syncMobs([m], 1 / 60)
    m.yaw = NaN
    l.syncMobs([m], 1 / 60)
    expect(Number.isFinite(l.mobs.get('m1').group.rotation.y)).toBe(true)
    l.dispose()
  })
})

describe('roquecraft - o passo aparece nos dois lados da rede', () => {
  /*
   * O CASO DO CONVIDADO. `packMobs`/`unpackMobs` não levam `anim`: o cliente
   * recebia sempre 0 e via o bicho DESLIZAR de pernas paradas. Agora o passo
   * sai da velocidade observada, que existe nos dois lados.
   */
  it('mob vindo da rede (anim sempre 0) mexe as pernas ao andar', () => {
    const original = createMob('pig', 10, 64, 10, 1)
    const daRede = unpackMobs(packMobs([original]))[0]
    expect(daRede.anim, 'a rede passou a mandar anim; reveja este teste').toBe(0)

    const l = camada()
    caminhar(l, daRede, 1, 0)
    const patas = l.mobs.get(daRede.id).group.userData.andar
    const mexeu = patas.filter((p) => Math.abs(p.mesh.rotation[p.eixo]) > 0.05)
    expect(mexeu.length, 'nenhuma pata se mexeu andando').toBeGreaterThan(0)
    l.dispose()
  })

  it('bicho parado não fica pedalando no lugar', () => {
    const l = camada()
    const m = mobBase()
    for (let i = 0; i < 200; i++) l.syncMobs([m], 1 / 60)
    for (const p of l.mobs.get('m1').group.userData.andar) {
      expect(Math.abs(p.mesh.rotation[p.eixo]), 'pata mexendo com o bicho parado').toBeLessThan(
        0.02,
      )
    }
    l.dispose()
  })

  it('a galinha bate asa mesmo parada — bicho ocioso não é estátua', () => {
    const l = camada()
    const m = mobBase({ type: 'chicken' })
    for (let i = 0; i < 12; i++) l.syncMobs([m], 1 / 60)
    const asas = l.mobs.get('m1').group.userData.ocioso
    expect(asas.length).toBeGreaterThan(0)
    expect(asas.some((a) => Math.abs(a.mesh.rotation[a.eixo]) > 0.01)).toBe(true)
    l.dispose()
  })
})

describe('roquecraft - o dano fica no bicho que apanhou', () => {
  /*
   * ⚠️ `emissiveIntensity > 0` NÃO é "está aceso": `MeshStandardMaterial` nasce
   * com intensidade 1 e cor emissiva PRETA, que não emite nada. Escrito assim,
   * o teste acusava o porco vizinho de acender só por existir. Aceso é a COR.
   */
  const aceso = (g) =>
    (g.userData.pintaveis || []).some(
      (m) => m.emissiveIntensity > 0 && m.emissive.r + m.emissive.g + m.emissive.b > 0.01,
    )

  /*
   * O flash escrevia `emissive` no material do cache, compartilhado por cor:
   * bater num porco acendia TODOS os porcos do mapa.
   */
  it('acender um porco não acende o porco do lado', () => {
    const l = camada()
    const a = mobBase({ id: 'a', x: 0 })
    const b = mobBase({ id: 'b', x: 4 })
    l.syncMobs([a, b], 1 / 60)
    a.hurtFlash = 0.3
    l.syncMobs([a, b], 1 / 60)
    expect(aceso(l.mobs.get('a').group), 'quem apanhou não acendeu').toBe(true)
    expect(aceso(l.mobs.get('b').group), 'acendeu o vizinho junto').toBe(false)
    l.dispose()
  })

  /*
   * Os olhos da aranha nascem acesos de propósito — é o sinal de "isto te
   * machuca". Na primeira versão o reset do flash varria TODO material
   * registrado e a aranha ficava cega depois de apanhar uma vez. É por isso que
   * "pintável" e "liberável" são duas listas.
   */
  it('a aranha continua com os olhos acesos depois de apanhar', () => {
    const l = camada()
    const s = mobBase({ id: 's', type: 'spider' })
    l.syncMobs([s], 1 / 60)
    s.hurtFlash = 0.3
    l.syncMobs([s], 1 / 60)
    s.hurtFlash = 0
    l.syncMobs([s], 1 / 60)
    const olhos = l.mobs
      .get('s')
      .group.userData.materiais.filter((m) => !l.mobs.get('s').group.userData.pintaveis.includes(m))
    expect(olhos.length, 'a aranha não tem material de olho separado').toBeGreaterThan(0)
    for (const o of olhos) {
      expect(o.emissiveIntensity, 'olho da aranha apagou').toBeGreaterThan(1)
      expect(o.emissive.r, 'olho da aranha perdeu a cor').toBeGreaterThan(0.5)
    }
    l.dispose()
  })

  it('e apaga quando o flash acaba', () => {
    const l = camada()
    const a = mobBase({ id: 'a' })
    l.syncMobs([a], 1 / 60)
    a.hurtFlash = 0.3
    l.syncMobs([a], 1 / 60)
    a.hurtFlash = 0
    l.syncMobs([a], 1 / 60)
    expect(aceso(l.mobs.get('a').group)).toBe(false)
    l.dispose()
  })
})

describe('roquecraft - nada vaza quando o bicho some', () => {
  /*
   * Cada bicho carrega 5 a 8 cópias de material (é isso que impede o flash de
   * vazar) e só a geometria era liberada. Com 26 bichos vivos e o rodízio de
   * spawn e despawn de uma noite inteira, isso é vazamento de verdade.
   */
  it('sumir com o bicho libera os materiais dele', () => {
    const l = camada()
    const m = mobBase()
    l.syncMobs([m], 1 / 60)
    const mats = l.mobs.get('m1').group.userData.materiais
    expect(mats.length).toBeGreaterThan(0)
    const liberados = new Set()
    for (const mt of mats) mt.addEventListener('dispose', () => liberados.add(mt))
    l.syncMobs([], 1 / 60) // despawn
    expect(liberados.size, 'material ficou pra trás').toBe(mats.length)
    l.dispose()
  })

  it('mas NÃO libera a textura, que é compartilhada pelo cache', () => {
    const l = camada()
    l.syncMobs([mobBase()], 1 / 60)
    const texturas = l.mobs
      .get('m1')
      .group.userData.materiais.map((m) => m.map)
      .filter(Boolean)
    expect(texturas.length).toBeGreaterThan(0)
    const mortas = new Set()
    for (const t of texturas) t.addEventListener('dispose', () => mortas.add(t))
    l.syncMobs([], 1 / 60)
    expect(mortas.size, 'liberou textura do cache; o próximo bicho nasce sem pele').toBe(0)
    l.dispose()
  })
})

/**
 * A FLECHA NA CENA.
 *
 * ⚠️ O QUE UMA FOTO NÃO CONSEGUE JULGAR. A sonda visual põe a câmera onde o
 * jogador está, e o esqueleto mira JUSTAMENTE no jogador: a flecha vem de
 * frente e aparece como um quadradinho de 6 cm em cima da mira. Não dá pra ver
 * daí se ela está apontando pra onde voa ou de través — e "de través" lê como
 * bug de partícula, não como ameaça.
 *
 * Aqui a orientação é medida, não olhada.
 */
describe('roquecraft - a flecha aponta pra onde voa', () => {
  const flecha = (over = {}) => ({ id: 'f1', x: 0, y: 64, z: 0, vx: 0, vy: 0, vz: 10, ...over })

  /** Direção do eixo LONGO da haste, no mundo. */
  function eixoDaHaste(mesh) {
    mesh.updateMatrixWorld(true)
    return new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).normalize()
  }

  it('a haste fica alinhada com a velocidade, em qualquer direção', () => {
    const cena = new THREE.Scene()
    const layer = createEntityLayer(cena, { shadows: false, particles: false })
    for (const v of [
      { vx: 0, vy: 0, vz: 10 },
      { vx: 10, vy: 0, vz: 0 },
      { vx: -6, vy: -6, vz: 3 },
      { vx: 2, vy: 9, vz: -4 },
    ]) {
      layer.syncFlechas([flecha(v)])
      let mesh = null
      cena.traverse((o) => {
        if (o.isMesh && o.geometry?.parameters?.depth === 0.62) mesh = o
      })
      expect(mesh, 'a flecha não entrou na cena').toBeTruthy()
      const dir = new THREE.Vector3(v.vx, v.vy, v.vz).normalize()
      // dot ≈ 1 significa "a ponta aponta pra frente". Se estivesse de través
      // daria ~0, e foi assim que a caixa de item já apareceu errada aqui.
      expect(eixoDaHaste(mesh).dot(dir)).toBeCloseTo(1, 3)
    }
    layer.dispose()
  })

  it('a flecha fica na posição dela, e some quando sai da lista', () => {
    const cena = new THREE.Scene()
    const layer = createEntityLayer(cena, { shadows: false, particles: false })
    layer.syncFlechas([flecha({ x: 3, y: 70, z: -2 })])
    let mesh = null
    cena.traverse((o) => {
      if (o.isMesh && o.geometry?.parameters?.depth === 0.62) mesh = o
    })
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([3, 70, -2])

    layer.syncFlechas([])
    let sobrou = false
    cena.traverse((o) => {
      if (o.isMesh && o.geometry?.parameters?.depth === 0.62) sobrou = true
    })
    // Flecha que fica na cena depois de sumir da lista é vazamento: a noite
    // inteira de um esqueleto deixaria centenas de hastes paradas no ar.
    expect(sobrou).toBe(false)
    layer.dispose()
  })

  it('duas flechas são duas malhas, não uma', () => {
    const cena = new THREE.Scene()
    const layer = createEntityLayer(cena, { shadows: false, particles: false })
    layer.syncFlechas([flecha({ id: 'a', x: 0 }), flecha({ id: 'b', x: 5 })])
    let n = 0
    cena.traverse((o) => {
      if (o.isMesh && o.geometry?.parameters?.depth === 0.62) n++
    })
    expect(n).toBe(2)
    layer.dispose()
  })
})
