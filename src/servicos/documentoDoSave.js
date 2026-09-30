// RoqueCraft — o documento que o Firestore aceita: nenhuma lista dentro de lista.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE O MUNDO PAROU DE GRAVAR NA CONTA, EM SILÊNCIO.
//
// O save v12 tinha lista dentro de lista em quatro lugares: o inventário
// (`[[slot, item, n], …]`), as outras dimensões (`[[id, [edições]], …]`), os
// efeitos (`[[nome, nível, restante], …]`) e o conteúdo da mobília
// (`s: [[item, n]]`). O Firestore recusa ("Nested arrays are not supported"),
// medido em 26/09/2026 com o `firebase` 12.7.0: com UM item no inventário o
// autosave caía no `aoFalhar`, que só escreve no console, e o jogador seguia
// jogando um mundo que não ia para lugar nenhum.
//
// A REGRA É UMA SÓ, E VALE PARA O DOCUMENTO INTEIRO: toda lista que está
// diretamente dentro de outra lista vira `{ _a: [...] }` na ida e volta a ser
// lista na volta. Uma regra na fronteira, e não um formato novo em cada um dos
// quatro serializadores, porque o quinto campo com lista dentro de lista (e ele
// vai existir) passaria por aqui sem ninguém lembrar de nada. O formato em
// memória, o da sala (o RTDB aceita) e os testes de cada serializador não
// mudam. `parseSave` continua lendo o v12: um documento sem `_a` volta igual.
//
// `_a` e não `l`: o rebanho já grava `l` (tosquiada) e o pecuarista não ia
// gostar de ver as ovelhas viradas em lista.

export const CHAVE_DA_LISTA = '_a'

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A ida: o valor como o documento aceita. Lista sem lista dentro volta a mesma. */
export function semListaDentroDeLista(v) {
  if (Array.isArray(v)) {
    if (!v.some((e) => Array.isArray(e) || ehObjeto(e))) return v
    return v.map((e) =>
      Array.isArray(e) ? { [CHAVE_DA_LISTA]: semListaDentroDeLista(e) } : semListaDentroDeLista(e),
    )
  }
  if (ehObjeto(v)) {
    const saida = {}
    for (const k of Object.keys(v)) saida[k] = semListaDentroDeLista(v[k])
    return saida
  }
  return v
}

/** A volta: o documento como o jogo lê. Documento v12 (sem `_a`) volta igual. */
export function comListaDentroDeLista(v) {
  if (Array.isArray(v)) {
    if (!v.some(ehObjeto)) return v
    return v.map(comListaDentroDeLista)
  }
  if (ehObjeto(v)) {
    const chaves = Object.keys(v)
    if (chaves.length === 1 && chaves[0] === CHAVE_DA_LISTA && Array.isArray(v[CHAVE_DA_LISTA])) {
      return comListaDentroDeLista(v[CHAVE_DA_LISTA])
    }
    const saida = {}
    for (const k of chaves) saida[k] = comListaDentroDeLista(v[k])
    return saida
  }
  return v
}

/**
 * Onde há lista dentro de lista, como caminho (`inventory[0]`), ou `null`.
 * É o que o teste usa para provar que o documento inteiro passa, campo a campo.
 */
export function ondeHaListaDentroDeLista(v, caminho = '') {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (Array.isArray(v[i])) return `${caminho}[${i}]`
      const dentro = ondeHaListaDentroDeLista(v[i], `${caminho}[${i}]`)
      if (dentro) return dentro
    }
    return null
  }
  if (ehObjeto(v)) {
    for (const k of Object.keys(v)) {
      const dentro = ondeHaListaDentroDeLista(v[k], caminho ? `${caminho}.${k}` : k)
      if (dentro) return dentro
    }
  }
  return null
}
