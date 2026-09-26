import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RAIO_SOL,
  RAIO_LUA,
  RAIO_PLANETA,
  ALTURA_CUMULO,
  ALTURA_CIRRO,
} from '../../src/servicos/render/sky.js'

// GUARDAS DO CÉU.
//
// Todas nasceram de um defeito medido em 23/08/2026, e cada uma existe pra que
// aquele defeito específico não volte calado. Nenhuma delas testa "está
// bonito" — isso é olho e sonda de pixel (`scripts/qa-roquecraft-ceu.mjs`).
// Aqui só entra o que dá pra afirmar sem GPU.

const RAIZ = resolve(__dirname, '../..')
const ler = (p) => readFileSync(resolve(RAIZ, p), 'utf8')

// SEM COMENTÁRIOS, pras guardas de ausência.
//
// Na primeira versão deste arquivo quatro testes falharam porque os
// comentários que EXPLICAM cada conserto citam o código removido —
// "era `depthTest: false`", "era `clamp(uv, 0.0, 1.0)`". A guarda estava
// funcionando: ela achou o texto. Só que achou a prosa. Guarda de ausência tem
// que olhar código; guarda de presença pode olhar o arquivo inteiro.
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const SKY = ler('src/servicos/render/sky.js')
const ENGINE = ler('src/servicos/render/engine.js')
const SKY_CODIGO = semComentarios(SKY)
const ENGINE_CODIGO = semComentarios(ENGINE)

const grausDiametro = (meioAngulo) => (meioAngulo * 2 * 180) / Math.PI

describe('céu do RoqueCraft — tamanho angular do sol e da lua', () => {
  // O sol REAL mede 0,533° e a lua 0,518°: quase idênticos, que é por isso que
  // eclipse total existe. A versão anterior tinha sol de 3,6° e lua de 2,7° —
  // sete vezes o real, e o sol 33% maior que a lua. É a assinatura de céu
  // procedural amador, e some no primeiro olhar comparativo.
  it('desenha sol e lua praticamente do mesmo tamanho', () => {
    const razao = RAIO_SOL / RAIO_LUA
    // no céu real a razão é 1,029
    expect(razao).toBeGreaterThan(1.0)
    expect(razao).toBeLessThan(1.06)
  })

  it('mantém os dois discos entre uma e três vezes o diâmetro real', () => {
    for (const [nome, raio, real] of [
      ['sol', RAIO_SOL, 0.533],
      ['lua', RAIO_LUA, 0.518],
    ]) {
      const d = grausDiametro(raio)
      expect(d, nome).toBeGreaterThan(real)
      expect(d, nome).toBeLessThan(real * 3)
    }
  })

  it('usa as constantes exportadas dentro do shader, sem número solto', () => {
    // Se alguém trocar o valor no GLSL e esquecer o JS (ou vice-versa), o teste
    // acima passa e o céu muda. A interpolação é o que mantém uma fonte só.
    expect(SKY).toContain('const float RAIO_SOL = ${RAIO_SOL.toFixed(6)}')
    expect(SKY).toContain('const float RAIO_LUA = ${RAIO_LUA.toFixed(6)}')
  })
})

describe('céu do RoqueCraft — nuvens sem geometria', () => {
  // O DEFEITO: as nuvens viviam num PlaneGeometry e o shader lia
  // `vP = position.xz`. Num PlaneGeometry os vértices estão no plano XY, então
  // position.z é ZERO em todos — o ruído variava numa direção só e, na escala
  // usada, o céu visível inteiro cabia em menos de um período. Resultado
  // medido: nenhuma nuvem em nenhuma foto de QA.
  it('não cria PlaneGeometry nenhum', () => {
    expect(SKY_CODIGO).not.toContain('PlaneGeometry')
  })

  it('não lê position.xz em lugar nenhum', () => {
    expect(SKY_CODIGO).not.toMatch(/position\.xz/)
  })

  it('projeta a nuvem por interseção com casca esférica', () => {
    expect(SKY).toContain('float casca(vec3 d, float r)')
    expect(SKY).toContain('casca(d, R_PLANETA + H_CUMULO)')
  })

  it('põe as duas camadas acima do mundo e abaixo do horizonte de nuvem', () => {
    expect(ALTURA_CUMULO).toBeGreaterThan(180) // acima de qualquer montanha
    expect(ALTURA_CIRRO).toBeGreaterThan(ALTURA_CUMULO)
    // O horizonte de nuvem fecha em sqrt(2*R*h). Ele tem que cair MUITO além
    // da distância de renderização (12 chunks = 192 blocos), senão o jogador vê
    // a borda da camada.
    const horizonte = Math.sqrt(2 * RAIO_PLANETA * ALTURA_CUMULO)
    expect(horizonte).toBeGreaterThan(1000)
  })

  it('usa ruído de GRADIENTE com deriva por oitava, não ruído de valor', () => {
    // Ruído de valor tem lóbulos alinhados aos eixos; sem deriva, o campo
    // inteiro desliza como um carimbo só quando o vento anda.
    expect(SKY).toContain('float gnoise(vec2 p)')
    expect(SKY).toMatch(/p = p \* 2\.0\d \+ deriva/)
  })

  it('tem o par Beer-powder e a fase de Henyey-Greenstein', () => {
    expect(SKY).toContain('float beer = exp(')
    expect(SKY).toContain('float powder = 1.0 - beer * beer;')
    expect(SKY).toMatch(/prata = clamp\(0\.5 \/ pow\(1\.5 - cosSol/)
  })
})

describe('céu do RoqueCraft — estrelas', () => {
  // O DEFEITO: `vec3 g = floor(d * 340.0)` é um reticulado CARTESIANO, e a
  // esfera não o corta por igual — a célula encolhe 5,2x na direção dos cantos
  // do cubo. Pior: cada estrela era a célula INTEIRA, então saíam quadrados e
  // triângulos alinhados ao eixo em vez de pontos.
  it('não sorteia estrela numa grade cartesiana de direção', () => {
    expect(SKY_CODIGO).not.toMatch(/floor\(d \* \d+\.\d+\)/)
  })

  it('usa parametrização esférica de área igual', () => {
    // (azimute, sen(elevação)): a área de cada célula é a mesma em esferorradiano.
    expect(SKY).toContain('vec2 su = vec2(atan(d.z, d.x) / PI2 + 0.5, d.y * 0.5 + 0.5);')
  })

  it('mede o raio da estrela em radianos e antialiasa pelo pixel', () => {
    expect(SKY).toContain('float disco = smoothstep(raio + aa, max(0.0, raio - aa), ang);')
    expect(SKY).toContain('float aa = max(uPixelAng, 0.00002);')
  })

  it('escurece a estrela sub-pixel em vez de encolher', () => {
    // Feature menor que um pixel que só encolhe pisca entre existir e não
    // existir conforme a câmera anda — e o bloom transforma isso em vaga-lume.
    expect(SKY).toContain('float sub = clamp(raio / aa, 0.12, 1.0);')
  })

  it('distribui magnitude e aplica extinção junto ao horizonte', () => {
    expect(SKY).toContain('float mag = pow(fract(s * 91.7), 3.0);')
    expect(SKY).toContain('float ext = smoothstep(-0.03, 0.26, h);')
  })

  it('usa hash sem seno', () => {
    // O rand() de seno do three devolve valores diferentes entre GPUs.
    expect(SKY).toContain('vec3(0.1031, 0.1030, 0.0973)')
    expect(SKY_CODIGO).not.toMatch(/fract\(sin\(/)
  })
})

describe('céu do RoqueCraft — acabamento', () => {
  it('dithera depois do tonemap e do espaço de cor', () => {
    const iTone = SKY.indexOf('tonemapping_fragment')
    const iCor = SKY.indexOf('colorspace_fragment')
    const iDither = SKY.indexOf('ign(gl_FragCoord.xy)')
    expect(iTone).toBeGreaterThan(0)
    expect(iDither).toBeGreaterThan(iCor)
    expect(iCor).toBeGreaterThan(iTone)
  })

  it('desenha a cúpula por último, com teste de profundidade', () => {
    // Com `depthTest: false` a cúpula sombreava todo pixel da tela e o terreno
    // pintava por cima. Com até 10 oitavas de ruído por pixel isso é meio
    // quadro jogado fora.
    expect(SKY).toContain('depthFunc: THREE.LessEqualDepth')
    expect(SKY_CODIGO).not.toContain('depthTest: false')
    expect(SKY).toContain('gl_Position.z = gl_Position.w')
  })
})

describe('céu do RoqueCraft — raios de sol', () => {
  // O DEFEITO: a marcha radial usava `clamp(uv, 0.0, 1.0)`. Ao passar da borda
  // ela reamostrava o MESMO texel dezenas de vezes, somando uma barra de luz
  // colada na borda do quadro apontando pra um sol que não está lá.
  it('para a marcha ao sair do quadro em vez de grudar na borda', () => {
    expect(ENGINE_CODIGO).not.toContain('clamp(uv, 0.0, 1.0)')
    expect(ENGINE).toContain('if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;')
  })

  it('exige o sol DENTRO do quadro, não só à frente da câmera', () => {
    // O teste antigo aceitava até 87° fora do eixo; o sol sai do quadro em ~50°.
    expect(ENGINE_CODIGO).not.toContain('camera.getWorldDirection(_lookDir)) < 0.05')
    expect(ENGINE).toContain('const fora = Math.max(Math.abs(_screen.x), Math.abs(_screen.y))')
  })

  it('suaviza o joelho do limiar do bloom', () => {
    // O padrão do UnrealBloomPass é 0.01 — degrau na prática, e todo pixel que
    // oscile em volta do limiar vira vaga-lume.
    expect(ENGINE).toContain('bloomPass.highPassUniforms.smoothWidth.value = 0.22')
  })
})
