import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * UM PAYLOAD DE SAVE, NÃO DOIS. UM TEMPORIZADOR, NÃO DOIS.
 *
 * `useRoqueCraftPersistencia.spec.js` prova o COMPORTAMENTO do autosave. Não
 * basta: o defeito que este arquivo existe pra impedir é de ENDEREÇO.
 *
 * O que estava montado antes da rodada 21: o componente tinha um `saveTimer`
 * próprio, e `buildSavePayload` era chamado em DOIS lugares — no autosave e no
 * gancho `payloadDeSave` do QA, com a lista de campos copiada. As duas cópias
 * concordavam por enquanto. No dia em que um campo novo entrasse só numa
 * delas, a sonda mediria um payload que o jogo não grava e daria verde — o
 * instrumento concordando com o defeito, que é o modo de falha desta sessão
 * inteira.
 *
 * Lê o componente como TEXTO de propósito: um guard que importa o que
 * fiscaliza morre junto com o arquivo quebrado e para de fiscalizar.
 *
 * Veio de `tests/unit/composables/persistenciaEstrutura.spec.js` do RoqueOS
 * (7ab22a6f), com os mesmos seis casos. O componente de lá (`ROSRoqueCraft.vue`)
 * é o `src/JogoRoqueCraft.vue` daqui, o gancho é `src/servicos/ganchoDeQA.js`, e
 * três nomes mudaram na extração sem mudar a porta: o import é relativo, o modo
 * E2E é `emModoE2E()` (era `isE2EMode()`, do RoqueOS) e a porta da conta é
 * `saveDoJogo.disponivel()` — o `progresso.disponivel()` do host, que era o
 * `myUid.value` (CHANGELOG 0.1.0). As quatro portas continuam cobradas, cada
 * uma dentro da sua.
 */

const COMPONENTE = resolve('src/JogoRoqueCraft.vue')
const fonte = readFileSync(COMPONENTE, 'utf8')

describe('a persistência tem um dono só', () => {
  it('o componente usa o composable', () => {
    expect(fonte).toContain(
      "import { useRoqueCraftPersistencia } from './composables/useRoqueCraftPersistencia.js'",
    )
    expect(fonte).toContain('useRoqueCraftPersistencia({')
  })

  it('o componente NÃO tem temporizador de save próprio', () => {
    expect(fonte).not.toMatch(/saveTimer/)
    expect(fonte).not.toMatch(/setTimeout\(\s*persist/)
  })

  it('`buildSavePayload` é chamado UMA vez — dentro de `montarPayloadDeSave`', () => {
    const chamadas = fonte.match(/buildSavePayload\(/g) || []
    expect(chamadas).toHaveLength(1)
    expect(fonte).toMatch(/function montarPayloadDeSave\(\)\s*{\s*return buildSavePayload\(/)
  })

  it('o gancho de QA lê a MESMA função do autosave', () => {
    // ⚠️ O GANCHO MUDOU DE ENDEREÇO EM 26/08 - e o guard foi ATRÁS dele. As 330
    // linhas de `window.__roquecraft` saíram do componente pra
    // `services/roquecraft/ganchoDeQA.js`; o que o componente mantém é a
    // ENTREGA da função, e o gancho tem que ler essa, não reconstruir o payload.
    const gancho = readFileSync(resolve('src/servicos/ganchoDeQA.js'), 'utf8')
    expect(gancho).toMatch(/payloadDeSave:\s*\(\)\s*=>\s*montarPayloadDeSave\(\)/)
    expect(fonte, 'o componente parou de entregar a função pro gancho').toMatch(
      /^\s*montarPayloadDeSave,\s*$/m,
    )
    // E ninguém remontou o payload lá dentro.
    expect(gancho, 'o gancho ganhou uma cópia do payload').not.toMatch(/buildSavePayload\(/)
  })

  it('o teardown cancela o agendamento', () => {
    expect(fonte).toContain('persistencia.cancelar()')
  })

  it('as quatro portas continuam na configuração do composable', () => {
    // Perder qualquer uma custa um save: documento anônimo, mundo do anfitrião
    // sobrescrito, o save do founder apagado por uma corrida do harness -- ou,
    // a quarta (RC-02, 12/09/2026), o mundo inteiro de quem abriu o jogo com o
    // Firestore fora do ar: sem ela o jogo grava um mundo vazio por cima.
    //
    // ⚠️ `[\s\S]` E NÃO `[^\n]`, E ESTA É A SEGUNDA VEZ. O guard já foi preso ao
    // formato de UMA LINHA uma vez e reprovou quando a quarta porta não coube
    // nela; agora a quinta (a dimensão, 13/09/2026) fez o Prettier quebrar
    // `podeGravar` em cinco linhas e ele reprovou de novo — formatação, não
    // regra. O que precisa ser verdade é que os termos estejam TODOS ali, perto
    // uns dos outros; a quebra de linha entre eles não diz nada.
    // ⚠️ E A JANELA NÃO PODE ATRAVESSAR A PORTA SEGUINTE. Com `[\\s\\S]{0,240}`
    // puro, a busca que começa em `podeGravar:` alcançava a linha de
    // `podeAgendar` e achava lá o termo que faltava aqui: o mutante que APAGOU
    // a quinta porta de `podeGravar` passou verde. Cada regra tem que ser
    // encontrada dentro da SUA porta.
    const perto = '(?:(?!podeGravar:|podeAgendar:)[\\s\\S]){0,240}'
    const re = (s) => new RegExp(s)
    const gravar = re(
      `podeGravar:${perto}saveDoJogo\\.disponivel\\(\\)${perto}!mp\\.active${perto}!emModoE2E\\(\\)`,
    )
    const agendar = re(`podeAgendar:${perto}!mp\\.active${perto}!emModoE2E\\(\\)`)
    // A quarta porta, nas duas: agendar sessenta gravações que o gate vai
    // recusar 2,5 s depois é desperdício, e agendar é onde o jogador constrói.
    const carga = re(`podeGravar:${perto}podeSalvar\\(estadoDaCarga\\.value\\)`)
    const cargaNoAgendar = re(`podeAgendar:${perto}podeSalvar\\(estadoDaCarga\\.value\\)`)
    // A quinta porta viveu um commit. Ela recusava gravação fora do overworld
    // porque o save tinha UM mapa de edições; a v10 deu um mapa por dimensão e
    // ela deixou de ter o que proteger. O que ficou dela está em
    // `roqueCraftSave.spec.js`: o save grava a dimensão VIVA e as outras junto.
    expect(fonte).toMatch(gravar)
    expect(fonte).toMatch(agendar)
    expect(fonte, 'a porta da carga sumiu de podeGravar (RC-02)').toMatch(carga)
    expect(fonte, 'a porta da carga sumiu de podeAgendar (RC-02)').toMatch(cargaNoAgendar)
  })
})
