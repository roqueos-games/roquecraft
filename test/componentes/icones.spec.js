import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DESENHOS, NOMES, temIcone } from '../../src/componentes/icones.js'

// OS ÍCONES DO ROQUECRAFT.
//
// O founder pediu (2026-08-23) que os menus e o HUD pertencessem ao jogo. O que
// mais denunciava "isto é um aplicativo" era o conjunto de ícones do Android
// dentro de um mundo de cubos. Entraram vinte desenhos em grade de 8×8.
//
// ⚠️ O DEFEITO QUE ESTE ARQUIVO EXISTE PRA PEGAR É O NOME ERRADO. `<RCIcon
// nome="picarera" />` não quebra nada: o componente resolve para uma lista
// vazia e desenha um SVG sem nenhum retângulo. O botão fica lá, do tamanho
// certo, e simplesmente sem ícone — e num controle de toque, que não tem
// rótulo, isso é um botão cego. Não há erro no console, não há teste que falhe
// sozinho, e o print de QA só mostra um quadrado vazio que parece proposital.

const DIR = path.resolve('src/componentes')
const vues = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.vue'))

/** Todo `nome="..."` literal passado a um RCIcon nos templates do jogo. */
function nomesUsadosNosTemplates() {
  const usos = []
  for (const arquivo of vues()) {
    const src = fs.readFileSync(path.join(DIR, arquivo), 'utf8')
    for (const m of src.matchAll(/<RCIcon[^>]*?\snome="([^"]+)"/g)) {
      usos.push({ arquivo, nome: m[1] })
    }
    // `:nome="cond ? 'a' : 'b'"` — os dois lados do ternário também precisam
    // existir, e é justamente esse o caso do sol/lua no HUD.
    for (const m of src.matchAll(/<RCIcon[^>]*?\s:nome="([^"]+)"/g)) {
      for (const lit of m[1].matchAll(/'([a-zA-Z]+)'/g)) usos.push({ arquivo, nome: lit[1] })
    }
  }
  return usos
}

describe('roquecraft - ícones de pixel', () => {
  it('todo ícone usado nos templates existe no catálogo', () => {
    const usos = nomesUsadosNosTemplates()
    expect(usos.length, 'não achei uso nenhum — a varredura quebrou').toBeGreaterThan(10)
    const orfaos = usos.filter((u) => !temIcone(u.nome))
    expect(orfaos, `ícone sem desenho: ${JSON.stringify(orfaos)}`).toEqual([])
  })

  it('não sobrou ícone Material dentro do jogo', () => {
    // A troca inteira perde o sentido se um `q-icon` voltar sorrateiro num
    // componente novo.
    const sobras = []
    for (const arquivo of vues()) {
      const src = fs.readFileSync(path.join(DIR, arquivo), 'utf8')
      const tpl = src.slice(0, src.indexOf('<script'))
      if (/<q-icon/.test(tpl)) sobras.push(arquivo)
    }
    expect(sobras).toEqual([])
  })

  it('todo desenho cabe na grade de 8×8 e não é vazio', () => {
    for (const nome of NOMES) {
      const cels = DESENHOS[nome]
      expect(cels.length, `${nome} está vazio`).toBeGreaterThan(0)
      for (const [x, y, w, h] of cels) {
        expect(Number.isInteger(x) && Number.isInteger(y), `${nome} fora da grade`).toBe(true)
        expect(Number.isInteger(w) && Number.isInteger(h), `${nome} com tamanho fracionário`).toBe(
          true,
        )
        expect(w > 0 && h > 0, `${nome} com retângulo de área zero`).toBe(true)
        expect(x >= 0 && x + w <= 8, `${nome} vaza em x: ${x}+${w}`).toBe(true)
        expect(y >= 0 && y + h <= 8, `${nome} vaza em y: ${y}+${h}`).toBe(true)
      }
    }
  })

  it('nenhum desenho é fraco ou cheio demais pra ler no tamanho de uso', () => {
    // Menos de 6 células acesas em 64 não é ícone, é sujeira — foi o sintoma
    // das primeiras versões de `picareta` e `sair`, que sumiam a 11px. Mais de
    // 48 vira um borrão sólido, sem silhueta: foi o que aconteceu com `gente`
    // quando os dois corpos se encostaram e viraram uma muralha.
    for (const nome of NOMES) {
      const area = DESENHOS[nome].reduce((a, [, , w, h]) => a + w * h, 0)
      expect(area, `${nome} tem só ${area} pixels acesos`).toBeGreaterThanOrEqual(6)
      expect(area, `${nome} está quase todo preenchido (${area}/64)`).toBeLessThanOrEqual(48)
    }
  })

  it('o catálogo é imutável em runtime', () => {
    // Um componente que escrevesse em DESENHOS corromperia o ícone pra todo
    // mundo, e o sintoma apareceria em outra tela.
    expect(Object.isFrozen(DESENHOS)).toBe(true)
  })
})
