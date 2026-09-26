// Os textos do RoqueCraft, um JSON por idioma em `i18n/`, carregados quando o jogo
// monta. O jogo não usa o vue-i18n do RoqueOS: ele roda num app Vue próprio, e
// fora do RoqueOS (no `yarn dev` do repo) não existe i18n de sistema nenhum.
//
// O mapa é ESTÁTICO de propósito: `import(variável)` faz o Vite desistir de
// recortar e empacotar os dez idiomas juntos, em silêncio. Assim o navegador
// baixa um pedaço, o do jogador.
//
// ⚠️ O JSON vem como TEXTO (`?raw`) e vira objeto no `JSON.parse`, e não por
// `import` de JSON direto. Medido em 25/09/2026: o build do RoqueOS quebra em
// qualquer import de JSON fora de `src/i18n/`, com `orgTransform.apply is not a
// function`. O `@intlify/unplugin-vue-i18n` 4.0.0 do front embrulha o
// `transform` do `vite:json`, e no Vite 7 esse transform virou objeto. O teste
// não vê (o Vitest não carrega esse plugin); só o `yarn build:app` vê. O `?raw`
// passa por fora do embrulho e funciona igual no RoqueOS e no Vite do repo.

export const IDIOMA_CANONICO = 'pt-BR'

const CARREGADORES = {
  'pt-BR': () => import('../i18n/pt-BR.json?raw'),
  'en-US': () => import('../i18n/en-US.json?raw'),
  'es-ES': () => import('../i18n/es-ES.json?raw'),
  'fr-FR': () => import('../i18n/fr-FR.json?raw'),
  'de-DE': () => import('../i18n/de-DE.json?raw'),
  'ja-JP': () => import('../i18n/ja-JP.json?raw'),
  'zh-CN': () => import('../i18n/zh-CN.json?raw'),
  'hi-IN': () => import('../i18n/hi-IN.json?raw'),
  'ru-RU': () => import('../i18n/ru-RU.json?raw'),
  'ar-AR': () => import('../i18n/ar-AR.json?raw'),
}

export const IDIOMAS_COM_TEXTO = Object.freeze(Object.keys(CARREGADORES))

/**
 * @param {string} idioma um dos dez; outro cai no canônico
 * @returns {Promise<Record<string, string>>}
 */
export async function carregarTextos(idioma) {
  const carregar = CARREGADORES[idioma] ?? CARREGADORES[IDIOMA_CANONICO]
  const modulo = await carregar()
  return JSON.parse(modulo.default)
}

/**
 * Traduz uma chave. Sem textos carregados devolve vazio (a tela fica sem
 * rótulo por um instante, em vez de mostrar o caminho da chave); com textos e
 * sem a chave devolve a chave, que é defeito de programação e o teste pega.
 * @param {Record<string, string> | null} textos
 * @param {string} chave
 * @param {Record<string, string | number>} [valores] trocam `{nome}` no texto
 */
export function traduzir(textos, chave, valores) {
  if (!textos) return ''
  // Chave com ponto anda pelo JSON aninhado (`diff.easy` → `{ diff: { easy } }`),
  // que é a forma que o `jogo check` do SDK confere.
  const bruto = chave.split('.').reduce((o, k) => o?.[k], textos)
  if (typeof bruto !== 'string') return chave
  if (!valores) return bruto
  return bruto.replace(/\{(\w+)\}/g, (inteiro, nome) =>
    nome in valores ? String(valores[nome]) : inteiro,
  )
}
