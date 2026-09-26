import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createWorldClient } from '../../src/servicos/worldClient.js'

// ⚠️ O ÚNICO DEFEITO QUE IMPEDIA O FOUNDER DE JOGAR, VIRADO EM TESTE.
//
// "eu entro em um mapa todo quebrado com um monte de blocos sem faces, coisas
// voando e etc" — founder, 25/08/2026. A gambiarra dele: entrar no mapa, baixar
// o gráfico pro mínimo e voltar pro ultra. Isso recria o renderizador inteiro e,
// de quebra, joga fora a geometria do mundo anterior — que era o problema.
//
// A CAUSA: `worldClient.reset` esquecia os chunks (`chunks.clear()`) sem avisar
// ninguém. A malha não mora no cliente, mora no engine, e o engine só descarta
// seção quando ouve `onUnload`. Trocar de semente sem esse aviso deixa TODA a
// geometria do mundo velho pendurada na cena: onde o mundo novo tem seção no
// mesmo lugar ela é sobrescrita, onde não tem — oceano onde era montanha — ela
// fica no ar para sempre. Medido na sonda `qa-roquecraft-entrada.mjs`: 1.035
// faces desenhadas em células de AR ao abrir um mapa novo.
//
// ESTE ARQUIVO NÃO CHECA "reset chamou uma função". Ele monta um motor falso com
// a MESMA regra de vida e morte de seção do engine de verdade e compara o
// resultado com o mundo da semente nova gerado do zero, num cliente separado.
// Sobra qualquer seção que o mundo novo não justifique, e o teste reprova.
//
// ⚠️ VERDE AQUI NÃO VALE NADA SEM O VERMELHO. Antes de commitar eu reintroduzi o
// defeito (apaguei o laço de `onUnload` dentro do `reset`) e rodei este arquivo:
//
//   × não deixa nenhuma seção do mundo anterior na cena
//       seção do mundo velho pendurada no ar (2 de 5 possíveis): 0,4,1 | 1,4,1
//   × avisa cada chunk carregado, exatamente uma vez
//       expected Set{} to deeply equal Set{ '0,0', '-1,0', ... } (49 chunks)
//
// Depois restaurei o conserto e os dois voltaram a passar. As seções que vazam
// são as da faixa y 64..79 — a superfície, que é o que o founder via voando.

const SEMENTE_A = 20260825
const SEMENTE_B = 777

/**
 * Motor falso com a regra de vida e morte de seção do `engine.js` de verdade:
 *
 *  - `setSection` com malha VAZIA **apaga** a seção (`else sectionMeshes.delete`).
 *    É por isso que a sobra do defeito não some sozinha: o mundo novo só emite
 *    malha das seções que ele tem, e a seção que virou ar nunca é remalhada —
 *    ninguém manda apagar.
 *  - `removeChunk` mata a coluna inteira, e é a ÚNICA porta de saída da malha.
 *
 * O teste `motor falso ainda reflete o engine de verdade` (no fim do arquivo)
 * é o que impede este espelho de envelhecer em silêncio.
 */
function motorFalso() {
  const secoes = new Map()
  const motor = {
    secoes,
    setSection(cx, sy, cz, malha) {
      const chave = `${cx},${sy},${cz}`
      const temGeo = ['opaque', 'cutout', 'transparent'].some((n) => malha[n]?.count)
      if (temGeo) secoes.set(chave, true)
      else secoes.delete(chave)
    },
    removeChunk(cx, cz) {
      for (const chave of [...secoes.keys()]) {
        const [kx, , kz] = chave.split(',')
        if (Number(kx) === cx && Number(kz) === cz) secoes.delete(chave)
      }
    },
    chaves: () => new Set(secoes.keys()),
  }
  return motor
}

// Piso, não igualdade: o pipeline carrega uma borda ALÉM do raio pedido, e com
// `renderDistance: 1` a medida real deu 49 chunks (7x7). 25 é só o ponto a
// partir do qual o silêncio do mesher significa "acabou" e não "ainda nem
// começou".
const CHUNKS_MINIMOS = 25

/**
 * Espera o carregamento ASSENTAR: o pipeline inline roda num laço de `setTimeout`,
 * então não dá pra dormir um tempo fixo e torcer.
 *
 * ⚠️ A PRIMEIRA VERSÃO DESTA ESPERA MENTIU, e o próprio teste pegou: ela contava
 * "quieto" desde o instante zero, quando o gerador ainda nem tinha emitido a
 * primeira malha, e voltava em 393ms com o mundo de referência VAZIO. Silêncio
 * antes do começo não é silêncio depois do fim.
 *
 * A condição agora tem as duas metades: todos os chunks do raio no espelho E
 * nenhuma malha nova por meio segundo.
 *
 * ⚠️ E A SEGUNDA VERSÃO MENTIU DE OUTRO JEITO: estourar o teto saía do `while` e
 * DEVOLVIA, calada, com o mundo pela metade. Sob `--coverage` -- que instrumenta
 * cada linha do gerador -- 8s não davam para 25 chunks, e o vermelho que aparecia
 * era "o mundo de referência nasceu vazio: expected 5 to be greater than 10", três
 * asserções à frente. Quem lê aquilo procura defeito no lugar errado.
 *
 * Agora estourar o teto é FALHA, e a mensagem diz o que faltou. O teto acompanha a
 * instrumentação pelo mesmo motivo que o `testTimeout` acompanha: o trabalho é o
 * mesmo, a máquina é que está 4x mais lenta.
 */
// O runner do GitHub Actions (2 vCPU compartilhados) é máquina lenta do mesmo jeito que a
// instrumentação: medido em 26/09/2026, no primeiro CI do repo, a janela de silêncio de 10
// deu "assentado" com o mundo novo pela metade. Lá valem os números da máquina lenta.
const MAQUINA_LENTA = Boolean(process.env.VITEST_INSTRUMENTADO || process.env.CI)
const TETO_ASSENTAR = MAQUINA_LENTA ? 90000 : 8000
// ⚠️ SILÊNCIO CURTO NÃO É FIM DE TRABALHO NUMA MÁQUINA LENTA. Meio segundo sem
// malha nova prova pouco quando cada malha custa 4x mais: sob `--coverage` a
// espera dava "assentado" com 5 seções no motor, e a asserção de premissa
// (`> 10`) reprovava logo depois. A janela de silêncio acompanha o custo.
const QUIETO_ASSENTAR = MAQUINA_LENTA ? 60 : 10
// O prazo do teste tem que caber a espera acima com folga, senão o vermelho é
// "timed out" em vez da mensagem que diz o que faltou assentar.
const PRAZO = MAQUINA_LENTA ? 150000 : 20000

async function assentar(mundo, teto = TETO_ASSENTAR) {
  const t0 = Date.now()
  let ultimo = -1
  let quieto = 0
  while (Date.now() - t0 < teto) {
    await new Promise((r) => setTimeout(r, 50))
    if (mundo.contador.n !== ultimo) {
      ultimo = mundo.contador.n
      quieto = 0
      continue
    }
    if (mundo.contador.n === 0) continue
    if (mundo.cliente.loadedCount < CHUNKS_MINIMOS) continue
    if (++quieto >= QUIETO_ASSENTAR) return
  }
  throw new Error(
    `o mundo não assentou em ${teto}ms: ${mundo.cliente.loadedCount} chunks no espelho ` +
      `(mínimo ${CHUNKS_MINIMOS}), ${mundo.contador.n} malhas emitidas -- ` +
      `mundo incompleto, não adianta medir nada em cima dele`,
  )
}

/** Cliente inline com um motor falso pendurado nele. */
function abrirMundo(seed) {
  const motor = motorFalso()
  const contador = { n: 0 }
  const descarregados = []
  const cliente = createWorldClient({
    seed,
    renderDistance: 1,
    forceInline: true,
    onMesh: (m) => {
      contador.n++
      motor.setSection(m.cx, m.sy, m.cz, m)
    },
    onUnload: (cx, cz) => {
      descarregados.push(`${cx},${cz}`)
      motor.removeChunk(cx, cz)
    },
  })
  return { cliente, motor, contador, descarregados }
}

describe('abrir um mapa novo', () => {
  it(
    'não deixa nenhuma seção do mundo anterior na cena',
    async () => {
      // REFERÊNCIA INDEPENDENTE: como é o mundo da semente B nascido do zero.
      // Não é uma expectativa escrita à mão — é o mesmo gerador, num cliente que
      // nunca viu a semente A.
      const b = abrirMundo(SEMENTE_B)
      b.cliente.start(0, 0)
      await assentar(b)
      const esperado = b.motor.chaves()
      b.cliente.dispose()
      expect(esperado.size, 'o mundo de referência nasceu vazio — nada a comparar').toBeGreaterThan(
        10,
      )

      // SUJEITO: mundo A na tela e depois `reset` pra B, que é exatamente o que o
      // botão "Novo mundo" do menu faz.
      const a = abrirMundo(SEMENTE_A)
      a.cliente.start(0, 0)
      await assentar(a)
      const antes = a.motor.chaves()

      // ⚠️ LIFE-PROOF DO FIXTURE, e ele vem ANTES da asserção de verdade.
      // Se as duas sementes desenhassem as mesmas seções, este teste passaria
      // COM o defeito no lugar — verde por não ter o que reprovar. A capacidade
      // de reprovar é esta lista: seções que existem em A e não existem em B.
      // São elas que ficavam penduradas no ar na tela do founder.
      //
      // A margem aqui é estreita e eu prefiro dizer isso a esconder: com o defeito
      // reintroduzido vazaram 2 das 5 possíveis (as outras 3 o mundo novo remalha
      // vazias, e malha vazia apaga a seção). Quem não tem margem nenhuma é o
      // teste seguinte, `avisa cada chunk carregado` — lá o defeito derruba os 49.
      const sobrasPossiveis = [...antes].filter((k) => !esperado.has(k))
      expect(
        sobrasPossiveis.length,
        'as duas sementes geraram o mesmo relevo: não há sobra possível, logo o teste não teria como reprovar',
      ).toBeGreaterThan(0)

      a.cliente.reset(SEMENTE_B, null)
      await assentar(a)
      const depois = a.motor.chaves()

      const sobras = [...depois].filter((k) => !esperado.has(k))
      expect(
        sobras,
        `seção do mundo velho pendurada no ar (${sobras.length} de ${sobrasPossiveis.length} possíveis): ${sobras.slice(0, 6).join(' | ')}`,
      ).toEqual([])

      // E o avesso: descarregar não pode ter comido o mundo novo. Sem isto, um
      // `reset` que apagasse tudo e não recarregasse nada passaria de bom.
      const faltando = [...esperado].filter((k) => !depois.has(k))
      expect(
        faltando,
        `o mundo novo não terminou de nascer: ${faltando.slice(0, 6).join(' | ')}`,
      ).toEqual([])
      a.cliente.dispose()
    },
    PRAZO,
  )
})

describe('worldClient.reset', () => {
  it(
    'avisa cada chunk carregado, exatamente uma vez, antes de esquecer o mundo',
    async () => {
      const a = abrirMundo(SEMENTE_A)
      a.cliente.start(0, 0)
      await assentar(a)

      const carregados = new Set(a.cliente.chunks.keys())
      expect(carregados.size, 'nada carregou — o teste não teria o que exigir').toBeGreaterThan(4)

      a.descarregados.length = 0
      a.cliente.reset(SEMENTE_B, null)

      // O aviso é SÍNCRONO de propósito: ele tem que sair antes da primeira malha
      // do mundo novo chegar, senão o engine sobrescreve e depois apaga o que
      // acabou de receber. Por isso a asserção é aqui, sem `await` no meio.
      expect(new Set(a.descarregados), 'chunk esquecido sem avisar o renderizador').toEqual(
        carregados,
      )
      expect(a.descarregados.length, 'o mesmo chunk foi descarregado duas vezes').toBe(
        carregados.size,
      )
      expect(a.cliente.loadedCount).toBe(0)
      a.cliente.dispose()
    },
    PRAZO,
  )

  it('o motor falso ainda reflete o engine de verdade', () => {
    const engine = fs.readFileSync(path.resolve('src/servicos/render/engine.js'), 'utf8')
    // Premissa 1: malha vazia APAGA a seção. Se isto virar "ignora", a sobra
    // deixa de depender do reset e o motor falso acima mente.
    expect(engine).toContain('else sectionMeshes.delete(key)')
    // Premissa 2: `removeChunk` mata a coluna inteira, por cx/cz.
    expect(engine).toMatch(/function removeChunk\(cx, cz\)/)

    // Premissa 3, a que sustenta o invariante: `onUnload` é a ÚNICA porta que
    // chega em `removeChunk`. Se aparecer uma segunda chamada, o conserto
    // dentro do `reset` deixa de ser suficiente e este teste manda olhar.
    const app = fs.readFileSync(path.resolve('src/JogoRoqueCraft.vue'), 'utf8')
    expect(app).toMatch(/onUnload:\s*\(cx, cz\)\s*=>\s*engine\?\.removeChunk\(cx, cz\)/)
    expect(app.match(/removeChunk\(/g) || []).toHaveLength(1)
  })
})
