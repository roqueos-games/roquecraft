import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ⚠️ A ARMADILHA QUE ESTE ARQUIVO FECHA, E QUE CUSTOU TRES DIAS.
//
// `tryAttack` fazia `best.x - origin.x`. Quando o laço de mira saiu dali pra
// `mobMirado`, o `const { origin } = cameraRay()` foi junto — e a linha do
// empurrão ficou apontando pro `origin` GLOBAL DO NAVEGADOR, uma string com a
// URL da página. `best.x - origin.x` virava NaN, o empurrão escrevia NaN na
// velocidade do bicho, e ele SUMIA do mundo no quadro seguinte.
//
// Nada acusou:
//   - o lint não viu, porque `origin` é global de browser e existe de verdade
//     (`no-undef` só reclama do que não existe em lugar nenhum);
//   - o console ficou limpo, porque `undefined` em aritmética dá NaN em
//     silêncio;
//   - os 7.600 testes passaram, porque nenhum deles monta o jogo;
//   - a sonda de combate passou, porque ela mede dano, não paradeiro.
//
// A classe do defeito é essa: um nome que parece local e não é. `origin`,
// `name`, `status`, `length`, `top`, `event`, `screen`, `history` — todos
// existem no `window`, todos são nomes que qualquer um usaria pra uma variável,
// e todos falham em silêncio quando a declaração some num refactor.

/** Globais de `window` com nome de variável local. Curtos e tentadores. */
const ARMADILHAS = [
  'origin',
  'name',
  'status',
  'length',
  'top',
  'event',
  'screen',
  'history',
  'parent',
  'self',
  'closed',
  'opener',
  'external',
  'frames',
  'frameElement',
  'crypto',
  'caches',
  'indexedDB',
  'speechSynthesis',
  'visualViewport',
  'isSecureContext',
]

/**
 * Onde o global É a resposta certa.
 *
 * Um Web Worker não tem `window`: `self` é o escopo dele, e usar `self` lá é o
 * jeito correto. A lista existe pra que a exceção seja NOMEADA em vez de a
 * varredura ser afrouxada.
 */
const PERMITIDO = { 'chunkWorker.js': ['self'] }

const RAIZ = path.resolve(__dirname, '../..')

function arquivosDoJogo() {
  const lista = []
  const junta = (dir, filtro) => {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      const cheio = path.join(dir, f)
      if (fs.statSync(cheio).isDirectory()) junta(cheio, filtro)
      else if (filtro(f)) lista.push(cheio)
    }
  }
  junta(path.join(RAIZ, 'src/servicos'), (f) => f.endsWith('.js'))
  junta(path.join(RAIZ, 'src/composables'), (f) => f.startsWith('useRoqueCraft'))
  lista.push(path.join(RAIZ, 'src/JogoRoqueCraft.vue'))
  junta(path.join(RAIZ, 'src/componentes'), (f) => f.endsWith('.vue'))
  return lista.filter((f) => fs.existsSync(f))
}

/**
 * Tira comentário e texto entre aspas, deixando só código.
 *
 * ⚠️ SEM ISTO A VARREDURA MENTE, e ela mentiu na primeira execução: acusou
 * `status.` em `resourcePack.js`, onde a palavra estava dentro da frase "não
 * basta olhar o status. Este site é uma SPA". Um instrumento que acusa prosa
 * ensina a ignorá-lo, e um instrumento ignorado é pior que nenhum.
 *
 * Um varredor de caractere, e não um `replace` de regex: `'https://x'` tem `//`
 * dentro de aspas, e cortar ali comeria código de verdade.
 */
function soCodigo(txt) {
  let fora = ''
  let i = 0
  let aspa = null
  while (i < txt.length) {
    const c = txt[i]
    const prox = txt[i + 1]
    if (aspa) {
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === aspa) aspa = null
      fora += c === '\n' ? c : ' '
      i += 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      aspa = c
      fora += ' '
      i += 1
      continue
    }
    if (c === '/' && prox === '/') {
      while (i < txt.length && txt[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && prox === '*') {
      i += 2
      while (i < txt.length && !(txt[i] === '*' && txt[i + 1] === '/')) {
        if (txt[i] === '\n') fora += '\n'
        i += 1
      }
      i += 2
      continue
    }
    fora += c
    i += 1
  }
  return fora
}

/** Só o `<script>` de um `.vue`: `name` e `top` no template e no CSS são outra coisa. */
function corpoDeCodigo(caminho) {
  const txt = fs.readFileSync(caminho, 'utf8')
  if (!caminho.endsWith('.vue')) return soCodigo(txt)
  const i = txt.indexOf('<script')
  const j = txt.indexOf('</script>')
  return i >= 0 && j > i ? soCodigo(txt.slice(i, j)) : ''
}

/**
 * ⚠️ A PERGUNTA E POR ESCOPO, E NAO POR ARQUIVO. Esta linha e a lição inteira.
 *
 * A primeira versão desta varredura perguntava "o nome está declarado no
 * arquivo?" — e por isso ficou CEGA justamente pro defeito que a motivou:
 * `origin` continua declarado no arquivo, dentro de `mobMirado`, três funções
 * abaixo de onde `tryAttack` o usava. Um instrumento que não acusa o caso que o
 * fez nascer não é instrumento, é enfeite. Descobri isso porque plantei o
 * defeito de volta pra ver se ele acusava, e ele não acusou.
 *
 * Não é análise de escopo de verdade — é a aproximação que resolve este
 * defeito: cada função de topo é um escopo, e vale o que está declarado DENTRO
 * dela, mais o que é de módulo (coluna zero) ou importado.
 */
function declaracoesDeModulo(txt) {
  const nomes = new Set()
  for (const m of txt.matchAll(/^(?:export )?(?:const|let|var|function|class)\s+(\w+)/gm)) {
    nomes.add(m[1])
  }
  // `import { a, b as c }` e `const { a, b } = ...` na coluna zero
  for (const m of txt.matchAll(/^(?:import|const|let|var)\s*\{([^}]*)\}/gm)) {
    for (const parte of m[1].split(',')) {
      const nome = parte
        .split(/\s+as\s+|:/)
        .pop()
        .trim()
      if (nome) nomes.add(nome)
    }
  }
  for (const m of txt.matchAll(/^import\s+(\w+)/gm)) nomes.add(m[1])
  return nomes
}

/** Os corpos das funções de topo, cada um um escopo. */
function escoposDeTopo(txt) {
  const linhas = txt.split('\n')
  const blocos = []
  for (let i = 0; i < linhas.length; i++) {
    if (!/^(?:export )?(?:async )?function \w+|^const \w+ = (?:async )?\(/.test(linhas[i])) continue
    let j = i + 1
    while (j < linhas.length && linhas[j] !== '}' && linhas[j] !== '})') j++
    blocos.push({ inicio: i, corpo: linhas.slice(i, j + 1).join('\n') })
  }
  return blocos
}

/** Declarado DENTRO deste escopo (declaração, parâmetro ou desestruturação)? */
function declaradoNoEscopo(corpo, nome) {
  const padroes = [
    new RegExp(`(?<![\\w.$])(?:const|let|var|function|class)\\s+${nome}\\b`),
    new RegExp(`[{,]\\s*${nome}\\s*[,}=:]`),
    new RegExp(`\\(\\s*[^)]*\\b${nome}\\b[^)]*\\)\\s*(?:=>|\\{)`),
    new RegExp(`\\b${nome}\\s*=>`),
  ]
  return padroes.some((p) => p.test(corpo))
}

describe('nenhum nome do jogo cai no global do navegador por acidente', () => {
  it('todo uso de um nome-armadilha tem declaracao local', () => {
    const acusados = []
    for (const caminho of arquivosDoJogo()) {
      const txt = corpoDeCodigo(caminho)
      if (!txt) continue
      const base = path.basename(caminho)
      const doModulo = declaracoesDeModulo(txt)
      for (const bloco of escoposDeTopo(txt)) {
        for (const nome of ARMADILHAS) {
          if (PERMITIDO[base]?.includes(nome)) continue
          if (doModulo.has(nome)) continue
          // usado como objeto (`nome.algo`), que é onde o global morde
          if (!new RegExp(`(?<![\\w.$])${nome}\\s*\\.`).test(bloco.corpo)) continue
          if (declaradoNoEscopo(bloco.corpo, nome)) continue
          const assinatura = bloco.corpo.split('\n')[0].trim()
          acusados.push(`${base} :: ${assinatura} usa \`${nome}.\` sem declarar`)
        }
      }
    }
    expect(acusados, `caem no window:\n  ${acusados.join('\n  ')}`).toEqual([])
  })

  it('a varredura enxerga os arquivos que diz enxergar', () => {
    // Uma varredura sobre lista vazia passa sempre. Este teste e a prova de que
    // ela realmente abriu o componente e os servicos.
    const arquivos = arquivosDoJogo().map((f) => path.basename(f))
    expect(arquivos).toContain('JogoRoqueCraft.vue')
    expect(arquivos).toContain('mobs.js')
    expect(arquivos.length).toBeGreaterThan(40)
  })

  it('o corpo lido do .vue e o script, e nao a pagina inteira', () => {
    const corpo = corpoDeCodigo(path.join(RAIZ, 'src/JogoRoqueCraft.vue'))
    expect(corpo).toContain('function tryAttack')
    expect(corpo).not.toContain('<template>')
  })

  it('comentario e texto entre aspas NAO contam como codigo', () => {
    // A varredura mentiu na primeira execucao por causa disto: acusou `status.`
    // dentro da frase "nao basta olhar o status. Este site e uma SPA".
    expect(soCodigo('// olhar o status. depois\nconst a = 1')).not.toContain('status.')
    expect(soCodigo('/* origin.x aqui */ const b = 2')).not.toContain('origin.')
    expect(soCodigo("const u = 'https://x.com/a' // fim")).toContain('const u =')
    // e o codigo de verdade continua inteiro
    expect(soCodigo('const c = origin.x // nota')).toContain('origin.x')
  })
})
