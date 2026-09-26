import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * UMA POLÍTICA DE NASCIMENTO, NÃO TRÊS.
 *
 * `nascimento.spec.js` prova que `landingSpot`/`safeSpawn` obedecem o piso que
 * recebem. Não é o suficiente: quem passava o piso errado era o COMPONENTE, e
 * ele passava em três lugares diferentes.
 *
 * O que aconteceu de fato: em 2026-08-23 o piso relativo à superfície foi
 * aplicado no boot e no resgate de soterramento, e esquecido em
 * `pousarSeguro` — que é o único dos três que roda no caminho do jogador de
 * verdade (pelo menu) e roda DEPOIS do boot, desfazendo o pouso correto. O
 * harness reportou 0 de 25 mundos enterrados porque o modo E2E pula o menu.
 * Entrando pelo menu: 2 de 25, com o jogador em y=31 e o chão em 75.
 *
 * Um teste de valor não pegaria isso: os três lugares chamavam a função certa
 * com argumentos diferentes. O que pega é ESTRUTURAL — existe um único lugar
 * que decide onde o jogador encosta o pé.
 *
 * Este arquivo lê o componente como TEXTO de propósito. Um guard que importa o
 * que ele fiscaliza morre junto com o arquivo quebrado, e aí não fiscaliza
 * nada (foi o que aconteceu com o guard de crase nos shaders).
 */

const COMPONENTE = resolve(__dirname, '../../src/JogoRoqueCraft.vue')
const fonte = readFileSync(COMPONENTE, 'utf8')

/*
 * ⚠️ O DONO MUDOU DE ENDEREÇO NA RODADA 18 — e o guard foi ATRÁS dele, não
 * afrouxado.
 *
 * A política saiu do componente pra `services/roquecraft/nascimento.js`. As
 * asserções sobre o CÁLCULO (piso relativo ao solo, desconto da árvore, desvio
 * condicional pra vizinha) passaram a ler o serviço; as asserções sobre o USO
 * (boot, resgate e `pousarSeguro` chamando a mesma política, e ninguém mais
 * chamando `landingSpot`/`safeSpawn` por conta própria) continuam lendo o
 * componente.
 *
 * O guard ficou MAIOR, não menor: agora ele cobre dois arquivos, e a fronteira
 * entre eles é justamente onde uma segunda política nasceria.
 */
const SERVICO = resolve(__dirname, '../../src/servicos/nascimento.js')
const servico = readFileSync(SERVICO, 'utf8')

/*
 * ⚠️ A AMARRAÇÃO MUDOU DE ENDEREÇO NA ONDA 4 DO GOAL 22 — e o guard foi ATRÁS
 * dela de novo. `pousarSeguro`, `chaoParaNascer` e o leitor de blocos saíram do
 * componente pra `composables/useRoqueCraftAbertura.js`, junto com o resto da
 * entrada no mundo (menu, pouso, começar do save, mundo novo). O componente
 * continua sendo o dono do `world`, e é por isso que ele passa o mundo por
 * acessor — a fronteira entre os dois é onde uma segunda política nasceria.
 */
const ABERTURA = resolve(__dirname, '../../src/composables/useRoqueCraftAbertura.js')
const abertura = readFileSync(ABERTURA, 'utf8')

/** Corpo de uma função de nível de indentação zero, por contagem de chaves. */
function corpoDaFuncao(texto, nome) {
  const i = texto.indexOf(`function ${nome}(`)
  if (i < 0) return null
  let profundidade = 0
  let comecou = false
  for (let j = i; j < texto.length; j++) {
    if (texto[j] === '{') {
      profundidade++
      comecou = true
    } else if (texto[j] === '}') {
      profundidade--
      if (comecou && profundidade === 0) return texto.slice(i, j + 1)
    }
  }
  return null
}

describe('roquecraft - o nascimento tem um dono só', () => {
  it('o SERVIÇO define `chaoParaNascer` e `pousoNaColuna`', () => {
    expect(corpoDaFuncao(servico, 'chaoParaNascer')).toBeTruthy()
    expect(corpoDaFuncao(servico, 'pousoNaColuna')).toBeTruthy()
  })

  it('o componente NÃO redefine a política, só amarra o mundo nela', () => {
    // Uma cópia local de qualquer uma das duas é a divergência voltando. Foi
    // exatamente assim que ela existiu em três lugares.
    expect(corpoDaFuncao(fonte, 'pousoNaColuna'), 'cópia local de pousoNaColuna').toBeNull()
    expect(fonte, 'o componente tem que importar a política').toMatch(
      /from '\.\/servicos\/nascimento\.js'/,
    )
  })

  it('nenhuma função do componente CHAMA landingSpot ou safeSpawn por conta própria', () => {
    // Depois da extração o componente só PASSA as duas como dependência; quem
    // as invoca é o serviço. Uma chamada aqui é uma segunda política nascendo.
    const fugitivas = fonte
      .split('\n')
      .map((linha, i) => ({ linha: linha.trim(), n: i + 1 }))
      .filter(({ linha }) => /\b(landingSpot|safeSpawn)\s*\(/.test(linha))
    expect(
      fugitivas,
      `o componente voltou a decidir nascimento sozinho:\n${fugitivas
        .map((f) => `  linha ${f.n}: ${f.linha}`)
        .join('\n')}`,
    ).toEqual([])
  })

  /*
   * O defeito era literalmente o número 1 no lugar do piso. Ele não volta por
   * acidente de digitação — volta quando alguém copia a chamada pra um contexto
   * novo e "simplifica" o piso. A asserção é sobre a chamada, não sobre o
   * cálculo: o piso tem que vir de `top`.
   */
  it('o piso da busca é relativo à superfície, nunca uma constante', () => {
    const corpo = corpoDaFuncao(servico, 'pousoNaColuna')
    expect(corpo).toMatch(/const piso = /)
    expect(corpo).toMatch(/- 6/)
    // `landingSpot(...)` e `safeSpawn(...)` recebem a variável, não um literal.
    expect(corpo).not.toMatch(/(landingSpot|safeSpawn)\([^)]*,\s*1\s*[,)]/s)
  })

  /*
   * O piso tem que descontar a ÁRVORE. `surfaceY` conta folha e tronco, então
   * numa floresta ele devolve a copa; um piso de `copa - 6` fica acima da terra
   * e o jogador pousa em cima das árvores. A métrica de soterramento não vê
   * isso (em cima da copa `y == surfaceY`, delta 0), e por isso o guard tem que
   * ver.
   */
  it('o piso desconta a árvore antes de descer os 6 blocos', () => {
    const corpo = corpoDaFuncao(servico, 'pousoNaColuna')
    expect(corpo).toMatch(/topoDoSolo\(/)
    expect(corpo, 'piso voltou a sair do topo cru (copa)').not.toMatch(
      /piso = [^\n]*Math\.floor\(top\) - 6/,
    )
    const solo = corpoDaFuncao(servico, 'topoDoSolo')
    expect(solo, 'topoDoSolo sumiu').toBeTruthy()
    expect(solo, 'topoDoSolo tem que pular folha E tronco').toMatch(/Leaves\|Log/)
  })

  /*
   * Quando a coluna do spawn É uma árvore (tronco do chão até a copa) não
   * existe pouso nenhum nela, e a busca sem filtro aceita a copa. Medido nas
   * sementes 942457 e 42. O desvio pra vizinha só pode rodar quando o defeito
   * está presente: uma busca que roda sempre pode piorar quem já estava certo,
   * que foi como a tentativa de "nascer com céu aberto" se perdeu.
   */
  it('desvia pra coluna vizinha só quando o pé caiu em árvore', () => {
    const corpo = corpoDaFuncao(servico, 'chaoParaNascer')
    expect(corpo).toMatch(/apoiadoEmArvore\(/)
    expect(corpo, 'o desvio tem que ser condicional, com retorno antecipado').toMatch(
      /if \(!r\.safe \|\| !apoiadoEmArvore\([^)]*\)\) return r/,
    )
    expect(corpo, 'sem varredura de vizinhas, o defeito volta').toMatch(/VIZINHAS/)
    expect(corpo, 'a vizinha tem que estar na mesma altura de terreno').toMatch(
      /Math\.abs\(v\.safe\.y - r\.solo\) > 4/,
    )
    const arv = corpoDaFuncao(servico, 'apoiadoEmArvore')
    expect(arv, 'apoiadoEmArvore olha o bloco DE BAIXO do pé').toMatch(/Math\.floor\(y\) - 1/)
  })

  /*
   * `pousarSeguro` roda DEPOIS do boot e reposiciona o jogador. Se ele parar de
   * usar a política comum, volta a desfazer o pouso correto — e é o caminho que
   * todo jogador percorre, porque é o que sai do menu.
   */
  it('pousarSeguro usa a política comum', () => {
    const corpo = corpoDaFuncao(abertura, 'pousarSeguro')
    expect(corpo, 'pousarSeguro sumiu da abertura').toBeTruthy()
    expect(corpo).toMatch(/chaoParaNascer\(/)
    // E não voltou a existir uma segunda cópia no componente.
    expect(corpoDaFuncao(fonte, 'pousarSeguro'), 'cópia local de pousarSeguro').toBeNull()
  })

  it('o boot e o resgate de soterramento também usam a política comum', () => {
    // ⚠️ O RESGATE MUDOU DE ENDEREÇO EM 26/08 - e o guard foi ATRÁS dele, não
    // afrouxado. `resgatarDoSoterramento` mora no composable do corpo, que é
    // dono do jogador; a AMARRAÇÃO da política com o mundo vivo continua aqui,
    // porque só o componente tem o mundo.
    const corpoDoJogador = readFileSync(
      resolve(__dirname, '../../src/composables/useRoqueCraftCorpo.js'),
      'utf8',
    )
    expect(corpoDaFuncao(corpoDoJogador, 'resgatarDoSoterramento')).toMatch(/chaoParaNascer\(/)
    // E ninguém reimplementou a política lá dentro.
    expect(corpoDoJogador, 'o composable ganhou uma cópia da política').not.toMatch(
      /function chaoParaNascer/,
    )
    // O boot não é uma função nomeada; basta que a chamada exista no arquivo
    // mais de uma vez além da definição.
    // Antes da rodada 18 este número era 4: três chamadas mais a DEFINIÇÃO
    // local, que também casava com `chaoParaNascer(`. Com a definição fora do
    // componente sobram as três chamadas — e o teste ficou mais preciso, não
    // mais frouxo: agora ele conta só uso, e um uso que suma derruba.
    // O boot (no componente) e `pousarSeguro` (na abertura) chamam a mesma
    // amarração; o resgate chama a sua, que é conferida logo acima. Contados
    // nos dois arquivos, porque é nos dois que o uso mora hoje.
    const usos = [...fonte.matchAll(/chaoParaNascer\(/g), ...abertura.matchAll(/chaoParaNascer\(/g)]
    expect(usos.length, 'boot e pousarSeguro').toBeGreaterThanOrEqual(2)
    expect(fonte, 'o boot parou de usar a política comum').toMatch(/chaoParaNascer\(/)
    // E a amarração com o mundo vivo tem que existir, senão as três chamadas
    // apontam pro nada.
    // ⚠️ Tolerante a quebra de linha: o prettier parte a seta em duas linhas, e
    // uma regex com `[^\n]*` reprovava código correto — o guard acusando a
    // formatação em vez do defeito.
    expect(abertura, 'sumiu a amarração do mundo com a política').toMatch(
      /const chaoParaNascer =[\s\S]{0,160}politicaDeNascimento\(/,
    )
    // E a amarração fala com o mundo VIVO: por acessor, não por valor. Uma foto
    // do mundo aqui leria a coluna de outro mundo depois da troca de dimensão.
    expect(abertura, 'o mundo entrou por valor na amarração').toMatch(/mundo\(\)/)
  })
})
