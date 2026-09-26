import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import {
  createVoxelMaterials,
  geometryFromBuffers,
} from '../../src/servicos/render/voxelMaterial.js'

// Armadilha que mordeu TRES vezes em 19/08/2026: uma CRASE dentro de um
// comentario do GLSL fecha o template literal. O resultado nao e erro de
// sintaxe - vira `templateA.z` seguido de outro template (chamada com tag), que
// so explode em RUNTIME, no import do chunk, como
// "TypeError: <o shader inteiro> is not a function". No app isso aparece como
// "a janela do jogo nao abre", e o motivo fica escondido no payload de um
// vite:preloadError.
//
// A primeira versao deste teste procurava os templates com /crase[^crase]*crase/ -
// por construcao o corpo NUNCA continha crase, entao o teste passava sempre. A
// checagem correta e: do marcador de abertura ate a linha que e so uma crase
// (a convencao do arquivo), nenhuma crase pode aparecer.
const RENDER_DIR = resolve(__dirname, '../../src/servicos/render')

function glslBlocks(src) {
  const lines = src.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('/* glsl */ ')) continue
    if (!lines[i].trimEnd().endsWith(String.fromCharCode(96))) continue
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      // terminador: a crase sozinha, ou seguida de , ; ) - as tres formas que
      // o repo usa (const, propriedade de objeto, argumento).
      if (/^[,;)]*$/.test(lines[j].trim().replace(String.fromCharCode(96), ''))) {
        if (lines[j].includes(String.fromCharCode(96))) {
          end = j
          break
        }
      }
    }
    blocks.push({ line: i + 1, end, body: end < 0 ? '' : lines.slice(i + 1, end).join('\n') })
  }
  return blocks
}

describe('shaders do RoqueCraft', () => {
  const files = readdirSync(RENDER_DIR).filter((f) => f.endsWith('.js'))

  it('encontra os modulos de render', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('todo bloco /* glsl */ fecha numa linha que e so crase', () => {
    let total = 0
    for (const f of files) {
      for (const b of glslBlocks(readFileSync(resolve(RENDER_DIR, f), 'utf8'))) {
        total++
        expect(b.end, f + ':' + b.line + ' bloco GLSL sem terminador na convencao').toBeGreaterThan(
          0,
        )
      }
    }
    expect(total).toBeGreaterThan(5)
  })

  it('nenhum bloco de GLSL contem crase (fecharia a string calado)', () => {
    for (const f of files) {
      for (const b of glslBlocks(readFileSync(resolve(RENDER_DIR, f), 'utf8'))) {
        expect(
          b.body.includes(String.fromCharCode(96)),
          f + ':' + b.line + ' crase dentro do GLSL fecha a string',
        ).toBe(false)
      }
    }
  })

  it('todo bloco de GLSL e balanceado em chaves e parenteses', () => {
    for (const f of files) {
      for (const b of glslBlocks(readFileSync(resolve(RENDER_DIR, f), 'utf8'))) {
        const count = (re) => (b.body.match(re) || []).length
        expect(count(/{/g), f + ':' + b.line + ' chaves desbalanceadas').toBe(count(/}/g))
        expect(count(/\(/g), f + ':' + b.line + ' parenteses desbalanceados').toBe(count(/\)/g))
      }
    }
  })

  // A prova de fogo: se qualquer template quebrar (crase, ASI, virgula faltando),
  // o import la em cima ja falha e este arquivo fica vermelho antes do QA visual.
  describe('enxerto no MeshStandardMaterial', () => {
    const fakeTex = () => ({
      albedo: new THREE.Texture(),
      normal: new THREE.Texture(),
      mer: new THREE.Texture(),
      layerOf: { water: 7 },
    })

    const INCLUDES = [
      '#include <common>',
      '#include <map_fragment>',
      '#include <normal_fragment_maps>',
      '#include <roughnessmap_fragment>',
      '#include <emissivemap_fragment>',
    ]

    const compile = (mat) => {
      const shader = {
        uniforms: {},
        vertexShader: INCLUDES[0] + '\n#include <begin_vertex>\n',
        fragmentShader: INCLUDES.join('\n') + '\n',
      }
      mat.onBeforeCompile(shader)
      return shader
    }

    it('substitui todos os includes de que o material depende', () => {
      const { opaque, cutout, transparent, shared } = createVoxelMaterials(fakeTex(), {
        quality: 'high',
      })
      expect(shared.uWaterLayer.value).toBe(7)
      for (const mat of [opaque, cutout, transparent]) {
        const s = compile(mat)
        expect(s.fragmentShader).not.toContain('#include <map_fragment>')
        expect(s.fragmentShader).not.toContain('#include <roughnessmap_fragment>')
        expect(s.fragmentShader).toContain('uAlbedo')
        expect(s.fragmentShader).toContain('gWaterN')
        expect(s.fragmentShader).toContain('totalEmissiveRadiance')
        expect(s.vertexShader).toContain('aLayer')
        expect(s.uniforms.uSkyTint).toBe(shared.uSkyTint)
      }
    })

    // Adicionar um uniforme ao objeto `shared` NAO o declara no GLSL: sao dois
    // lugares. Esquecer o segundo da "ERROR: 'uSunDir' : undeclared identifier"
    // em tempo de LINK, no navegador, e o sintoma e o mundo inteiro sumir - o
    // material nao compila e nada desenha. Custou uma rodada de build+QA em
    // 2026-08-20. Esta checagem e estatica e roda em milissegundos.
    it('todo uniforme lido pelo GLSL esta declarado no mesmo estagio', () => {
      const { opaque, shared } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const s = compile(opaque)
      for (const [estagio, src] of [
        ['vertex', s.vertexShader],
        ['fragment', s.fragmentShader],
      ]) {
        for (const nome of Object.keys(shared)) {
          // o three declara os dele; so cobramos os NOSSOS, e so onde sao usados
          if (!new RegExp(`\\b${nome}\\b`).test(src)) continue
          // `[...]` no fim cobre uniforme de ARRAY (`uniform vec4 uOndas[8];`),
          // que a versão anterior do padrão não reconhecia como declaração — e
          // um array não declarado quebra o link igualzinho a um escalar.
          const declarado = new RegExp(`uniform\\s+\\w+\\s+${nome}\\s*(\\[[^\\]]*\\])?\\s*;`).test(
            src,
          )
          expect(declarado, `${nome} e usado no ${estagio} sem estar declarado la`).toBe(true)
        }
      }
    })

    it('nenhum bloco GLSL tem crase dentro (isso corta o shader ao meio)', () => {
      // ⚠️ Esta guarda existe porque o mesmo erro quebrou o build TRÊS vezes:
      // 2026-08-20 no voxelMaterial, 2026-08-21 no gen-sitemap, 2026-08-22 aqui
      // de novo — sempre uma crase de markdown num comentário técnico dentro do
      // template literal. O JavaScript encerra a string ali, o resto do GLSL
      // vira código, e o erro que aparece é "Expected a semicolon" numa linha
      // que não tem nada de errado. Nada no editor avisa.
      //
      // O teste é estático de propósito: ler o ARQUIVO, não o shader compilado.
      // Depois de compilado o estrago já aconteceu.
      const fonte = readFileSync(
        resolve(__dirname, '../../src/servicos/render/voxelMaterial.js'),
        'utf8',
      )
      const linhas = fonte.split('\n')
      const culpadas = []
      let dentro = false
      linhas.forEach((ln, i) => {
        if (!dentro) {
          if (/\/\* glsl \*\/ `\s*$/.test(ln)) dentro = true
          return
        }
        if (ln.trim() === '`') {
          dentro = false
          return
        }
        if (ln.includes('`')) culpadas.push(`${i + 1}: ${ln.trim().slice(0, 72)}`)
      })
      expect(dentro, 'sobrou um bloco GLSL sem fechar — a varredura desalinhou').toBe(false)
      expect(
        culpadas,
        'crase dentro de bloco GLSL: o template literal encerra ali e o shader é cortado',
      ).toEqual([])
    })

    it('o fragment resultante e balanceado (nada de string cortada no meio)', () => {
      const { opaque } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const s = compile(opaque)
      for (const src of [s.vertexShader, s.fragmentShader]) {
        const count = (re) => (src.match(re) || []).length
        expect(count(/{/g)).toBe(count(/}/g))
        expect(count(/\(/g)).toBe(count(/\)/g))
      }
    })

    it('a agua nunca faz swizzle .z num vec2 (isso derrubava o material inteiro)', () => {
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const frag = compile(transparent).fragmentShader
      // acha toda variavel declarada como vec2 e garante que ninguem le .z nela
      const vec2s = [...frag.matchAll(/\bvec2\s+(\w+)\s*=/g)].map((m) => m[1])
      expect(vec2s.length).toBeGreaterThan(0)
      for (const v of vec2s) {
        expect(new RegExp(`\\b${v}\\.[xy]*z`).test(frag), `${v}.z num vec2`).toBe(false)
      }
    })

    it('a onda da agua e a MESMA no vertice e no fragmento', () => {
      // Se o vertice desloca com uma funcao e o fragmento ilumina com outra, o
      // brilho anda separado do relevo e a agua vira decalque animado.
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const s = compile(transparent)
      // `rcOndaCompleta` é a única fonte de altura E gradiente da onda ambiente.
      // Os dois estágios têm que chamá-la: o vértice pra subir a lâmina, o
      // fragmento pra montar a normal do MESMO campo.
      expect(s.vertexShader).toContain('rcOndaCompleta')
      expect(s.fragmentShader).toContain('rcOndaCompleta')
      // e o vertice realmente MOVE o topo da agua
      expect(s.vertexShader).toMatch(/transformed\.y \+= rcAltura/)
      // a ondulação do jogador entra nos dois lados também, senão o anel sobe
      // na geometria e não aparece na luz
      expect(s.vertexShader).toContain('rcOndulacao')
      expect(s.fragmentShader).toContain('rcOndulacao')
    })

    it('a normal da agua vem do gradiente ANALITICO, nao de diferenca finita', () => {
      // Diferença finita custa três avaliações do campo de onda por pixel — é
      // onde Photon gasta o dinheiro dele. A nossa onda devolve altura e
      // gradiente na mesma passada; se alguém voltar a amostrar vizinhos, o
      // custo por pixel triplica sem ninguém perceber.
      //
      // ⚠️ O RECORTE FOI CORRIGIDO, NÃO AFROUXADO. Ele ia do início do ramo da
      // água até o FIM do fragmento, e portanto varria também o ramo da
      // CÁUSTICA, que vem depois e é outro assunto (ele roda no leito, com
      // `!gIsWater`). Quando a cáustica passou a derivar da onda de verdade, o
      // contador subiu para 4 e o teste reprovou — mas o que ele existe para
      // proteger, que é a normal da SUPERFÍCIE sair do gradiente analítico,
      // continuava intacto. Agora o recorte termina onde o ramo da água termina,
      // e a conta da cáustica tem o seu próprio teto, logo abaixo.
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const frag = compile(transparent).fragmentShader
      const inicio = frag.indexOf('if (gIsWater)')
      const fimDoRamo = frag.indexOf('// CÁUSTICA no fundo', inicio)
      expect(fimDoRamo, 'não achei o fim do ramo da água no fragmento').toBeGreaterThan(inicio)
      const trecho = frag.slice(inicio, fimDoRamo)
      const chamadas = (trecho.match(/rcOndaCompleta\s*\(/g) || []).length
      expect(chamadas, `o ramo da água avalia a onda ${chamadas}× por pixel`).toBe(1)
    })

    it('a refracao SO roda em face de agua virada pra cima', () => {
      // Esta garantia estava sendo cobrada por FOTO -- a sonda procurava, no
      // mesmo quadro, leito molhado e areia seca, pra provar que o borrão não
      // escapava pra fora d'água. Só que praia não tem lâmina funda e mar
      // aberto não tem areia seca: era exigir uma geografia que não existe.
      //
      // A pergunta é de CÓDIGO, não de foto, e aqui ela não depende de achar
      // cenário: o ramo tem que estar atrás da força (zero quando o alvo não
      // foi desenhado) E da normal virada pra cima (a lateral da lâmina e o
      // leito seco ficam de fora).
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const frag = compile(transparent).fragmentShader
      expect(frag).toMatch(/if \(uRefracaoForca > 0\.5 && vWorldNormal\.y > 0\.5\)/)
    })

    it('a caustica deriva da onda, e paga no maximo tres avaliacoes', () => {
      // A cáustica precisa vir da MESMA onda que a superfície desenha — senão
      // são dois padrões independentes e a linha de luz no fundo não acompanha
      // a crista de cima, que foi a queixa do founder em 25/08.
      //
      // Mas ela custa: curvatura por diferença central são três avaliações. O
      // teto existe pra ninguém transformar isso em cinco numa tarde distraída.
      // O ramo só roda no leito raso (limitado a 6 blocos de profundidade), que
      // é o que mantém o custo local.
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const frag = compile(transparent).fragmentShader
      const inicio = frag.indexOf('// CÁUSTICA no fundo')
      expect(inicio, 'não achei o ramo da cáustica').toBeGreaterThan(0)
      const trecho = frag.slice(inicio)
      const chamadas = (trecho.match(/rcOndaCompleta\s*\(/g) || []).length
      expect(chamadas, 'a cáustica não está derivando da onda').toBeGreaterThan(0)
      expect(chamadas, `a cáustica avalia a onda ${chamadas}× por pixel`).toBeLessThanOrEqual(3)
    })

    it('nem a agua nem a faisca balancam com o vento — aWind ali e outra coisa', () => {
      // `aWind` carrega TRÊS significados, separados pelo bucket e pela camada:
      // balanço de planta, profundidade de lâmina na água, e semente de fase na
      // faísca da tocha. O ramo do vento é o dono do primeiro, e precisa
      // recusar os outros dois EXPLICITAMENTE — não há como deduzi-los do
      // valor, que é só um byte.
      //
      // Sem a guarda da água, o mar inteiro treme como um campo de mato. Sem a
      // guarda da faísca, a brasa balança feito folha além de subir.
      const { transparent } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      const vert = compile(transparent).vertexShader
      const guarda = vert.match(/if \(aWind > 0\.0([^)]*)\)/)
      expect(guarda, 'não achei o ramo do vento').toBeTruthy()
      expect(guarda[1], 'o ramo do vento parou de recusar a água').toContain('!rcEhAgua')
      expect(guarda[1], 'o ramo do vento parou de recusar a faísca').toContain('!rcEhFaisca')
    })

    it('a agua tem espuma e o fundo tem caustica', () => {
      const { transparent, opaque } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      expect(compile(transparent).fragmentShader).toContain('gFoam')
      expect(compile(opaque).fragmentShader).toContain('caustica')
    })

    it('perfil baixo desliga o que custa POR PIXEL — e o vento não é isso', () => {
      // A regra mudou em 24/08/2026 e a mudança é deliberada, não um relaxamento
      // do teste. O que o perfil baixo corta é custo por PIXEL em tela cheia: a
      // onda da água (um seno por fragmento) e o normal map. O vento é ALU por
      // VÉRTICE de planta, e planta é uma fração ínfima dos vértices do mundo —
      // cortá-lo pagava quase nada e tirava a única coisa que fazia o mundo
      // parecer vivo no celular.
      //
      // O que segura o corte por pixel continua valendo e continua testado.
      const { shared } = createVoxelMaterials(fakeTex(), { quality: 'low' })
      expect(shared.uWaterFx.value, 'onda da água é custo por pixel: sai no baixo').toBe(0)
      expect(shared.uNormalStrength.value, 'normal map é custo por pixel: sai no baixo').toBe(0)
      expect(
        shared.uWindStrength.value,
        'vento é custo por vértice: FICA no baixo',
      ).toBeGreaterThan(0)
    })

    it('o vento do perfil baixo é MAIS FRACO que o do alto, não igual', () => {
      // Se um dia os dois empatarem, ou o baixo passar o alto, é sinal de que
      // alguém mexeu num dos dois sem olhar o outro.
      const baixo = createVoxelMaterials(fakeTex(), { quality: 'low' }).shared
      const alto = createVoxelMaterials(fakeTex(), { quality: 'high' }).shared
      expect(baixo.uWindStrength.value).toBeLessThan(alto.uWindStrength.value)
    })

    it('a folhagem tem material de PROFUNDIDADE próprio, com recorte e vento', () => {
      // Sem ele a copa projeta sombra de caixa: o material de profundidade que
      // o three monta sozinho lê recorte de `map`/`alphaMap`, e o nosso mora
      // num sampler2DArray que ele não conhece.
      const { depthCutout } = createVoxelMaterials(fakeTex(), { quality: 'high' })
      expect(depthCutout, 'não existe material de profundidade pro recortado').toBeTruthy()
      // O passe de profundidade do three tem OUTRA lista de chunks — não tem
      // `map_fragment` nem `roughnessmap_fragment`, e tem `clipping_planes_
      // fragment`, que é onde o descarte entra. Reproduzir a lista do material
      // de superfície aqui daria falso negativo: o enxerto certo, o teste
      // reprovando. Esta é a lista do `depth.glsl.js` do three.
      const s = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>\n',
        fragmentShader:
          '#include <common>\n#include <packing>\n' +
          '#include <clipping_planes_fragment>\n#include <map_fragment>\n' +
          '#include <alphatest_fragment>\n',
      }
      depthCutout.onBeforeCompile(s)
      expect(s.fragmentShader, 'o passe de sombra não lê a textura').toContain('uAlbedo')
      expect(s.fragmentShader, 'o passe de sombra não descarta o furo da folha').toContain(
        'discard',
      )
      expect(s.vertexShader, 'a sombra não acompanha o vento').toContain('uWindDir')
      // O RECIBO do enxerto. `String.replace` com alvo ausente devolve a string
      // intacta e não avisa — e os nomes de chunk são contrato com o three,
      // que muda entre versões.
      expect(depthCutout.userData.enxertado).toEqual({
        vertice: true,
        fragmento: true,
        recorte: true,
        vento: true,
      })
    })

    it('geometryFromBuffers monta todos os atributos que o shader declara', () => {
      const geo = geometryFromBuffers({
        position: new Float32Array([0, 0, 0]),
        normal: new Int8Array([0, 127, 0]),
        uv: new Float32Array([0, 0]),
        layer: new Uint16Array([3]),
        light: new Uint8Array([255, 255, 0]),
        tint: new Uint8Array([255, 255, 255]),
        wind: new Uint8Array([0]),
        index: new Uint32Array([0]),
      })
      for (const name of ['position', 'normal', 'uv', 'aLayer', 'aLight', 'aTint', 'aWind']) {
        expect(geo.getAttribute(name), 'atributo ' + name + ' faltando').toBeTruthy()
      }
      expect(geo.getAttribute('aLight').normalized).toBe(true)
    })
  })
})

/**
 * OS NÚMEROS DA SOMBRA.
 *
 * Relato do founder (25/08/2026): peter-panning — a sombra descola da base do
 * bloco e o contato fica sem sombra, pior com sol baixo.
 *
 * Este bloco guarda os números que consertaram isso. Eles são pequenos, moram
 * longe uns dos outros (`engine.js` e `voxelMaterial.js`) e voltam sozinhos na
 * primeira pessoa que "ajustar a sombra" sem saber por que estavam ali.
 */
describe('roquecraft - a sombra encosta no bloco', () => {
  const engine = readFileSync(resolve(__dirname, '../../src/servicos/render/engine.js'), 'utf8')
  const material = readFileSync(
    resolve(__dirname, '../../src/servicos/render/voxelMaterial.js'),
    'utf8',
  )

  it('⚠️ o `normalBias` é 0.02, não os 0.055 que empurravam a sombra', () => {
    // 0,055 são cinco centímetros e meio de bloco de deslocamento ao longo da
    // normal — exatamente o tanto que a sombra andava pra longe do contato.
    expect(engine).toMatch(/sun\.shadow\.normalBias = 0\.02\b/)
    // ⚠️ A NEGATIVA MIRA A ATRIBUIÇÃO, NÃO O TEXTO. A primeira versão procurava
    // "0.055" no arquivo inteiro e reprovava por causa do COMENTÁRIO que conta
    // de onde o número veio — o guard acusando a própria documentação dele.
    expect(engine).not.toMatch(/sun\.shadow\.normalBias = 0\.055/)
  })

  it('⚠️ o `bias` é ZERO — e só pode ser zero porque a projeção sai da face de trás', () => {
    expect(engine).toMatch(/sun\.shadow\.bias = 0\b/)
    expect(engine).not.toMatch(/shadow\.bias = -/)
    // O contrato de que o zero depende. Se esta linha sair, o acne volta.
    expect(material).toMatch(/opaque\.shadowSide = THREE\.BackSide/)
  })

  it('o `radius` está escrito, e é ≤ 2', () => {
    // Sem a linha, o valor vinha de um padrão de biblioteca — e um raio grande
    // reabre o descolamento por outro caminho.
    const m = engine.match(/sun\.shadow\.radius = (\d+(?:\.\d+)?)/)
    expect(m, 'o raio do PCF não está escrito').toBeTruthy()
    expect(Number(m[1])).toBeLessThanOrEqual(2)
  })

  it('⚠️ a VEGETAÇÃO continua DoubleSide — forçar face nela apagaria a copa', () => {
    const cutout = material.slice(
      material.indexOf('const cutout'),
      material.indexOf('const transparent'),
    )
    expect(cutout).toMatch(/side: THREE\.DoubleSide/)
    expect(cutout).not.toMatch(/shadowSide/)
  })

  it('o frustum encolheu SEM o mapa crescer — é o que afina a sombra', () => {
    // Resolução = 2R/shadowSize blocos por texel. Encolher R sem mexer no mapa
    // é ganho de nitidez de graça em memória.
    // ⚠️ SÓ OS PERFIS QUE DESENHAM SOMBRA. O perfil `low` tem `shadows: false`
    // e carrega números de sombra que nunca são usados; exigir resolução dele
    // era o guard reprovando por uma conta que não acontece.
    const perfis = [
      ...engine.matchAll(
        /shadows: (true|false),\s*\n\s*shadowSize: (\d+),\s*\n\s*shadowRadius: (\d+),/g,
      ),
    ].map(([, on, size, raio]) => ({
      on: on === 'true',
      size: +size,
      raio: +raio,
      porTexel: (2 * +raio) / +size,
    }))
    const comSombra = perfis.filter((p) => p.on)
    expect(comSombra.length).toBeGreaterThanOrEqual(3)
    for (const p of comSombra) {
      expect(p.porTexel, `${p.raio}/${p.size} grosseiro demais`).toBeLessThanOrEqual(0.05)
    }
    // E o mapa continua nos tamanhos de antes: a nitidez veio do frustum, não
    // de gastar memória.
    expect(perfis.map((p) => p.size)).toEqual([2048, 2048, 1024, 512])
  })

  it('⚠️ o TEXEL SNAPPING existe, e tem guarda pro sol a pino', () => {
    // Sem snapping a borda da sombra ferve enquanto o jogador anda. E sem a
    // guarda, com o sol a pino o `up` fica paralelo à luz, o produto vetorial
    // degenera e a base vira NaN — a sombra some da tela inteira.
    expect(engine).toMatch(/Math\.round\(_shadowCenter\.dot\(_eixoX\) \/ texel\)/)
    expect(engine).toMatch(/Math\.round\(_shadowCenter\.dot\(_eixoY\) \/ texel\)/)
    expect(engine).toMatch(/_eixoX\.lengthSq\(\) < 1e-8/)
  })
})
