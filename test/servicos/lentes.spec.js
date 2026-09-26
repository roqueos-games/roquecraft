import { describe, it, expect } from 'vitest'
import {
  BORRAO_DO_GIRO_SHADER,
  BORRAO_MAXIMO,
  DESFOQUE_CHEIO_EM,
  DESFOQUE_DE_PROFUNDIDADE_SHADER,
  FOCO_ATE,
  GIRO_CHEIO,
  GIRO_MINIMO,
  TAU_BORRAO,
  alvoDoBorrao,
  desfoqueEm,
  direcaoDoBorrao,
  giroDoOlhar,
  passoDoBorrao,
} from '../../src/servicos/render/lentes.js'
import { QUALITY } from '../../src/servicos/render/engine.js'

//
// AS LENTES — pedido do founder em 15/09/2026.
//
// ⚠️ O QUE ELE PEDIU EM PARTE JÁ EXISTIA, e medir antes evitou construir de
// novo: o FOV de corrida está em `camera.js` desde sempre (+7,5%, entrando em
// 0,16 s) e a névoa de distância também (60 a 200 blocos). O que faltava era o
// desfoque de profundidade e o borrão ao virar.
//
// ⚠️ E O SHADER NÃO TEM TESTE — ele só roda na GPU e só se julga por foto. O que
// se afirma aqui é a REGRA: quando borrar, quanto, para que lado, e em que
// perfis o efeito existe. Sem isso, "liguei o efeito" viraria a evidência de que
// ele funciona, que é o tipo de prova que este repositório não aceita.
//
describe('as lentes', () => {
  it('as duas regras respondem (prova de vida)', () => {
    expect(alvoDoBorrao(GIRO_CHEIO)).toBe(1)
    expect(desfoqueEm(DESFOQUE_CHEIO_EM)).toBe(1)
  })

  // ── O BORRÃO AO VIRAR ─────────────────────────────────────────────────────

  it('mão parada não borra — e é o que separa efeito de sujeira', () => {
    // Sem o limiar, o tremor de um mouse apoiado na mesa já borra a tela e o
    // jogador vê uma imagem suja sem saber por quê.
    expect(alvoDoBorrao(0)).toBe(0)
    expect(alvoDoBorrao(GIRO_MINIMO)).toBe(0)
    expect(alvoDoBorrao(GIRO_MINIMO * 0.99)).toBe(0)
    expect(alvoDoBorrao(GIRO_MINIMO + 0.01)).toBeGreaterThan(0)
  })

  it('o borrão cresce com o giro e para no teto', () => {
    const meio = alvoDoBorrao((GIRO_MINIMO + GIRO_CHEIO) / 2)
    expect(meio).toBeGreaterThan(0.4)
    expect(meio).toBeLessThan(0.6)
    expect(alvoDoBorrao(GIRO_CHEIO * 4)).toBe(1)
  })

  it('giro inválido não vira borrão', () => {
    for (const v of [NaN, Infinity, -5, undefined]) expect(alvoDoBorrao(v)).toBe(0)
  })

  it('⚠️ a volta do yaw não vira um pico de borrão', () => {
    // O yaw dá volta: passar de 359° para 1° é um delta de +2°, não de −358°.
    // Sem normalizar, uma volta completa de mira produz um borrão cheio que some
    // no quadro seguinte — e o jogador vê um flash sem causa.
    const pequeno = giroDoOlhar(0.02, 0, 1 / 60)
    // ⚠️ OS DOIS SENTIDOS. A primeira versão deste teste só usava o delta
    // negativo, e um mutante que apagou o laço do lado POSITIVO sobreviveu —
    // metade da guarda estava sem afirmação nenhuma.
    expect(giroDoOlhar(0.02 - Math.PI * 2, 0, 1 / 60), 'volta para trás').toBeCloseTo(pequeno, 6)
    expect(giroDoOlhar(Math.PI * 2 - 0.02, 0, 1 / 60), 'volta para frente').toBeCloseTo(pequeno, 6)
  })

  it('a velocidade angular soma yaw e pitch', () => {
    const so = giroDoOlhar(0.1, 0, 0.1)
    const ambos = giroDoOlhar(0.1, 0.1, 0.1)
    expect(ambos).toBeGreaterThan(so)
    expect(giroDoOlhar(0.1, 0, 0)).toBe(0)
  })

  it('⚠️ a mola suaviza: o borrão não liga e desliga num quadro', () => {
    // A velocidade angular de um quadro é ruidosa (um mouse entrega passos
    // irregulares). Sem a mola, o efeito pisca e lê como defeito de render.
    const dt = 1 / 60
    let v = 0
    v = passoDoBorrao(v, 1, dt)
    expect(v, 'chegou ao alvo num quadro só').toBeLessThan(0.45)
    for (let i = 0; i < 30; i++) v = passoDoBorrao(v, 1, dt)
    expect(v).toBeGreaterThan(0.95)
  })

  it('a mola desce tão suave quanto sobe', () => {
    let v = 1
    for (let i = 0; i < 3; i++) v = passoDoBorrao(v, 0, 1 / 60)
    expect(v).toBeGreaterThan(0.1)
    expect(v).toBeLessThan(0.9)
  })

  it('dt zero não trava nem estoura a mola', () => {
    expect(passoDoBorrao(0.3, 1, 0)).toBe(1)
    expect(Number.isFinite(passoDoBorrao(0.3, 1, 1 / 60, 0))).toBe(true)
  })

  it('⚠️ o kernel colhe PARA ONDE A IMAGEM ANDA', () => {
    // ⚠️ ESTE TESTE JÁ AFIRMOU O CONTRÁRIO, com um comentário convincente: "a
    // imagem arrasta contra o olhar". A frase é verdadeira e a conclusão era
    // falsa — o que anda contra o olhar é a imagem, e o kernel colhe na direção
    // dela, porque um quadro borrado é a MÉDIA da exposição: `∫ agora(p + m·s)`.
    // Ver a dedução inteira em `direcaoDoBorrao`. O sinal em si é aferido com o
    // jogo rodando por `qa-roquecraft-lentes.mjs`, contra o movimento MEDIDO de
    // um ponto fixo do mundo — aqui fica só a forma da função.
    //
    // Os dois eixos, e o vertical com sinal OPOSTO: a UV da tela cresce para
    // cima e o `pitch` cresce para cima também, mas o `v` do projetor da sonda
    // cresce para baixo, e foi essa troca que escondeu o erro.
    expect(direcaoDoBorrao(1, 0).x).toBeGreaterThan(0)
    expect(direcaoDoBorrao(-1, 0).x).toBeLessThan(0)
    expect(direcaoDoBorrao(0, 1).y).toBeLessThan(0)
    expect(direcaoDoBorrao(0, -1).y).toBeGreaterThan(0)
    const d = direcaoDoBorrao(3, 4)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6)
    expect(direcaoDoBorrao(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('o arrasto máximo é discreto — 1,6% da tela, não um rastro de fantasma', () => {
    expect(BORRAO_MAXIMO).toBeLessThan(0.03)
    expect(BORRAO_MAXIMO).toBeGreaterThan(0.005)
    expect(TAU_BORRAO).toBeLessThan(0.2)
  })

  // ── O DESFOQUE DE PROFUNDIDADE ────────────────────────────────────────────

  it('o que está ao alcance da mão fica NÍTIDO', () => {
    for (const d of [0, 1, 10, FOCO_ATE]) expect(desfoqueEm(d), `${d} blocos`).toBe(0)
  })

  it('⚠️ a curva é quadrática: o meio-campo continua legível', () => {
    // Com rampa linear, a 60 blocos — onde o jogador ainda reconhece um aldeão —
    // o desfoque já entrega 26%. A quadrática entrega 7% e guarda o efeito para
    // o fundo, que é o que a palavra "profundidade" promete.
    const linear = (60 - FOCO_ATE) / (DESFOQUE_CHEIO_EM - FOCO_ATE)
    expect(desfoqueEm(60)).toBeLessThan(linear / 3)
    expect(desfoqueEm(60)).toBeGreaterThan(0)
  })

  it('o desfoque cresce com a distância e para no fim', () => {
    expect(desfoqueEm(80)).toBeGreaterThan(desfoqueEm(50))
    expect(desfoqueEm(DESFOQUE_CHEIO_EM)).toBe(1)
    expect(desfoqueEm(DESFOQUE_CHEIO_EM * 10)).toBe(1)
  })

  it('distância inválida não desfoca', () => {
    for (const v of [NaN, undefined, -3]) expect(desfoqueEm(v)).toBe(0)
  })

  // ── ONDE O EFEITO EXISTE ──────────────────────────────────────────────────

  it('⚠️ as lentes ficam FORA do celular — decisão do founder, não omissão', () => {
    // O perfil do iPhone dele é o `medium`, e ali `bloom`, `godRays` e `ssao`
    // já estão em `false` de propósito. "Verde no desktop não é verde no
    // iPhone" derrubou este jogo uma vez.
    expect(QUALITY.ultra.lentes).toBe(true)
    expect(QUALITY.high.lentes).toBe(true)
    expect(QUALITY.medium.lentes, 'as lentes vazaram para o celular').toBe(false)
    expect(QUALITY.low.lentes).toBe(false)
  })

  it('o perfil que NÃO tem lentes também não tem os outros passes de shader', () => {
    // Se um dia `medium` ganhar bloom, esta linha cai junto e alguém relê a
    // decisão inteira em vez de só a metade que mudou.
    for (const perfil of ['medium', 'low']) {
      expect(QUALITY[perfil].bloom, perfil).toBe(false)
      expect(QUALITY[perfil].godRays, perfil).toBe(false)
      expect(QUALITY[perfil].ssao, perfil).toBe(false)
    }
  })

  // ── OS SHADERS, COMO DADO ─────────────────────────────────────────────────

  it('os dois shaders declaram EXATAMENTE os uniformes que o engine escreve', () => {
    // ⚠️ A LISTA INTEIRA, e não `arrayContaining`. A catraca de asserção fraca
    // pegou isto: conter os seis não impede um sétimo uniforme entrar sem
    // ninguém escrever nele, que é um shader lendo lixo em silêncio.
    expect(Object.keys(BORRAO_DO_GIRO_SHADER.uniforms).sort()).toEqual([
      'tDiffuse',
      'uDirecao',
      'uForca',
    ])
    expect(Object.keys(DESFOQUE_DE_PROFUNDIDADE_SHADER.uniforms).sort()).toEqual([
      'tDepth',
      'tDiffuse',
      'uAspecto',
      'uCheioEm',
      'uFar',
      'uFocoAte',
      'uNear',
      'uRaio',
    ])
  })

  it('⚠️ o desfoque lê a PROFUNDIDADE, e não a névoa', () => {
    // A névoa seria mais barata e estaria errada de duas formas: ela muda com a
    // hora do dia (de madrugada sobe), então o foco mudaria sozinho à noite; e
    // ela não existe debaixo d'água nem no Nether.
    const f = DESFOQUE_DE_PROFUNDIDADE_SHADER.fragmentShader
    expect(f).toContain('tDepth')
    expect(f).toContain('perspectiveDepthToViewZ')
    expect(f).not.toMatch(/\bfog/i)
  })

  it('os dois shaders saem cedo quando não há o que fazer', () => {
    // Passe que percorre a tela inteira para não mudar nada é custo puro.
    expect(BORRAO_DO_GIRO_SHADER.fragmentShader).toMatch(/uForca <= [\d.]+\) \{ gl_FragColor/)
    expect(DESFOQUE_DE_PROFUNDIDADE_SHADER.fragmentShader).toMatch(
      /uRaio <= 0\.0\) \{ gl_FragColor/,
    )
  })
})
