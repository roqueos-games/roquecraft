import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { direcaoDoOlhar, aplicarNaCamera } from '../../src/servicos/aim.js'

// O bug: a câmera usava +sin(yaw) no X e o raio da mira usava -sin(yaw). Você
// mirava num bloco, o jogo mirava no espelhado. Olhando pro -Z (yaw 0) o erro
// some, e foi por isso que passou tanto tempo despercebido.
//
// O teste certo não é "a fórmula é essa". É a INVARIANTE: o vetor que o jogo
// usa pra mirar tem que ser o mesmo pra onde a câmera aponta. Enquanto essa
// igualdade valer, não importa qual das duas mude.
describe('mira e câmera apontam pro mesmo lugar', () => {
  const ANGULOS = []
  for (let y = -Math.PI; y <= Math.PI + 0.001; y += Math.PI / 6) {
    for (const p of [-1.2, -0.6, -0.05, 0, 0.05, 0.6, 1.2]) ANGULOS.push([y, p])
  }

  it('o vetor de mira é a direção real da câmera do three, em todo ângulo', () => {
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100)
    const alvo = new THREE.Vector3()
    for (const [yaw, pitch] of ANGULOS) {
      aplicarNaCamera(cam, yaw, pitch)
      cam.updateMatrixWorld(true)
      cam.getWorldDirection(alvo)
      const d = direcaoDoOlhar(yaw, pitch)
      const erro = Math.hypot(alvo.x - d.x, alvo.y - d.y, alvo.z - d.z)
      expect(
        erro,
        `yaw ${yaw.toFixed(2)} pitch ${pitch.toFixed(2)}: camera (${alvo.x.toFixed(3)}, ` +
          `${alvo.y.toFixed(3)}, ${alvo.z.toFixed(3)}) x mira (${d.x.toFixed(3)}, ` +
          `${d.y.toFixed(3)}, ${d.z.toFixed(3)})`,
      ).toBeLessThan(1e-6)
    }
  })

  it('a direção é unitária', () => {
    for (const [yaw, pitch] of ANGULOS) {
      const d = direcaoDoOlhar(yaw, pitch)
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
    }
  })

  // Âncoras da convenção, pra ninguém "consertar" o sinal no lugar errado.
  it('yaw 0 olha pro -Z e yaw +90° olha pro +X', () => {
    const frente = direcaoDoOlhar(0, 0)
    expect(frente.z).toBeCloseTo(-1, 6)
    expect(frente.x).toBeCloseTo(0, 6)
    const leste = direcaoDoOlhar(Math.PI / 2, 0)
    expect(leste.x, 'yaw +90 tem que ir pro +X - com o sinal trocado vai pro -X').toBeCloseTo(1, 6)
  })

  it('a câmera usa ordem YXZ (no XYZ ela rola ao olhar pra cima girando)', () => {
    const cam = new THREE.PerspectiveCamera()
    aplicarNaCamera(cam, 0.7, 0.5)
    expect(cam.rotation.order).toBe('YXZ')
  })
})
