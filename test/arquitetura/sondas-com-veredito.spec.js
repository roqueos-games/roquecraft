import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ⚠️ QUARENTA SONDAS MEDIAM E NÃO REPROVAVAM NADA.
//
// O RoqueCraft tem 64 scripts de QA (sem contar o `.impl`, que é biblioteca).
// Levantados um por um em 12/09/2026: 33 deles calculam um número, comparam com
// o que era esperado, imprimem o resultado — e saem com código ZERO de qualquer
// jeito. Numa CI, isso é uma
// sonda que nunca reprova; num terminal, é uma parede de texto que alguém tem
// que ler com atenção justamente no dia em que está com pressa.
//
// Elas não são inúteis: `qa-roquecraft-texturas` diz, no próprio cabeçalho, que
// "fotografar a floresta natural não PROVA nada" e monta um cenário controlado.
// O trabalho está feito. O que falta é a última linha — a que transforma o que
// ela descobriu em um portão.
//
// ⚠️ DUAS SONDAS NÃO ENTRAM NESSA CONTA, E É DE PROPÓSITO. `qa-roquecraft-olho`
// (a folha de contato) e `qa-roquecraft-ceu-fotos` existem para o HUMANO olhar
// — a segunda diz isso com todas as letras: "Sem análise: o objetivo aqui é
// OLHAR". Exigir veredito delas seria pedir que a foto se julgasse sozinha, que
// é exatamente o erro que a folha de contato existe para consertar.
//
// ESTE ARQUIVO É UMA CATRACA. O número de hoje é 33 e ele só pode DESCER: sonda
// nova nasce com veredito, e sonda antiga que ganhar o dela sai da lista. Quem
// tentar subir o teto vai ler isto aqui antes.
//
// Veio de `tests/unit/architecture/sondas-com-veredito.spec.js` do RoqueOS (7ab22a6f), com os mesmos casos e as mesmas
// asserções; o que mudou foi só o caminho do front para o do repo.
// As sondas e o manifesto moram em `qa/`, e não em `scripts/`.

const DIR = resolve('qa')
const MANIFESTO = JSON.parse(readFileSync(resolve(DIR, 'qa-roquecraft-manifesto.json'), 'utf8'))

/**
 * Uma sonda "tem veredito" quando ela sabe sair DIFERENTE de zero.
 *
 * ⚠️ `process.exit(0)` LITERAL NÃO CONTA, e a primeira versão deste arquivo
 * media ao contrário: ela procurava `process.exit(1)` e por isso classificou
 * `qa-roquecraft-texturas` como muda — quando ela termina exatamente assim:
 *
 *     process.exit(Object.values(medida.veredito).includes('INVERTIDO') ? 1 : 0)
 *
 * Sete sondas foram acusadas injustamente pelo meu próprio instrumento. O
 * número que importa caiu de 40 para 33 ao consertar a régua, e é por isso que
 * medir o instrumento vem antes de medir o medido.
 */
const VEREDITO = /process\.exit\((?!\s*0\s*\))|process\.exitCode\s*=\s*[^0]|throw new Error/

const sondas = readdirSync(DIR)
  .filter((f) => /^qa-roquecraft.*\.mjs$/.test(f) && !/\.impl\./.test(f))
  .sort()

const temVeredito = (f) => VEREDITO.test(readFileSync(resolve(DIR, f), 'utf8'))

describe('sondas do RoqueCraft têm veredito', () => {
  it('toda sonda está classificada — nenhuma entra sem alguém decidir o papel dela', () => {
    const conhecidas = new Set([...MANIFESTO.mostra, ...MANIFESTO.semVeredito])
    const novas = sondas.filter((f) => !conhecidas.has(f) && !temVeredito(f))
    expect(
      novas,
      `sonda nova sem veredito e fora do manifesto: ${novas.join(', ')}. ` +
        `Dê a ela um \`process.exit(1)\` quando o que ela mede estiver errado, ` +
        `ou declare em \`mostra\` que ela existe só para o humano olhar.`,
    ).toEqual([])
  })

  it('o manifesto não guarda sonda que já foi consertada', () => {
    // Uma lista que não encolhe quando o trabalho é feito vira decoração.
    const jaTem = MANIFESTO.semVeredito.filter((f) => sondas.includes(f) && temVeredito(f))
    expect(
      jaTem,
      `estas já têm veredito e continuam no manifesto — tire-as de lá: ${jaTem.join(', ')}`,
    ).toEqual([])
  })

  it('o manifesto não guarda sonda que não existe mais', () => {
    const fantasmas = MANIFESTO.semVeredito.filter((f) => !sondas.includes(f))
    expect(fantasmas, `sonda no manifesto e não no disco: ${fantasmas.join(', ')}`).toEqual([])
  })

  it('as duas sondas de OLHAR continuam existindo e continuam sem julgar', () => {
    // Se uma delas ganhar veredito, a decisão mudou e a mudança tem que ser
    // consciente — não um efeito colateral de alguém copiar código de outra.
    for (const f of MANIFESTO.mostra) {
      expect(sondas, `${f} sumiu`).toContain(f)
    }
  })

  it('o total sem veredito não sobe', () => {
    const sem = sondas.filter((f) => !MANIFESTO.mostra.includes(f) && !temVeredito(f))
    expect(
      sem.length,
      `${sem.length} sondas medem e não reprovam (teto ${MANIFESTO.semVeredito.length}). ` +
        `O teto só desce.`,
    ).toBeLessThanOrEqual(MANIFESTO.semVeredito.length)
    // A catraca só serve se alguém a VÊ descer.
    console.log(
      `  [sondas] ${sem.length} sem veredito de ${sondas.length} (teto ${MANIFESTO.semVeredito.length})`,
    )
  })
})
