// SKINS do RoqueCraft.
//
// Existe porque numa sala com três pessoas todo mundo era o mesmo boneco: a cor
// da camisa saía de um hash do nome, então dois jogadores podiam nascer quase
// iguais e ninguém sabia quem era quem (relato do founder, 2026-08-22).
//
// Não é um atlas de skin no formato do original de propósito. Um PNG de skin é
// conteúdo de terceiro na esmagadora maioria dos casos, e a regra de assets
// deste projeto é CC0 ou nada. Um conjunto fechado de paletas nossas resolve o
// problema real - distinguir jogador - sem importar arquivo de ninguém, e
// mantém o boneco coerente com o resto do mundo, que é todo procedural.
//
// Puro: sem THREE, sem DOM. O render lê as cores, o protocolo valida o id.

// ⚠️ As camisas são o que identifica alguém a 30 metros, quando o resto virou
// um pixel. Existe um teste que exige distância RGB > 90 entre TODAS as duplas
// - ele já reprovou uma paleta em que 'roque' e 'noite' ficaram a 75 um do
// outro. Ao acrescentar skin, rode o teste antes de achar que ficou bom.
export const SKINS = [
  { id: 'roque', pele: 0xe8b98c, camisa: 0x2f7be0, calca: 0x2f3b57, cabelo: 0x3a2a1d },
  { id: 'mata', pele: 0x8d5524, camisa: 0x2fae62, calca: 0x24331f, cabelo: 0x140f0a },
  { id: 'brasa', pele: 0xf0c8a0, camisa: 0xd7442f, calca: 0x3b2320, cabelo: 0xa8551f },
  { id: 'cinza', pele: 0xc68642, camisa: 0x8b93a1, calca: 0x3a3f47, cabelo: 0x2a2d33 },
  { id: 'noite', pele: 0x5c3a21, camisa: 0x7b2fd0, calca: 0x241e4d, cabelo: 0x0d0b18 },
  { id: 'limao', pele: 0xffdbac, camisa: 0xd9d63f, calca: 0x4a4718, cabelo: 0x6b5a12 },
  { id: 'coral', pele: 0xa9673a, camisa: 0xe0559b, calca: 0x4b1f38, cabelo: 0x2b1018 },
  { id: 'gelo', pele: 0xf5dcc0, camisa: 0x7ce3ea, calca: 0x1f4249, cabelo: 0x7e8f96 },
]

export const SKIN_IDS = SKINS.map((s) => s.id)
export const SKIN_PADRAO = SKINS[0].id

const POR_ID = new Map(SKINS.map((s) => [s.id, s]))

/** Hash estável de string. Mesmo nome, mesma skin, em qualquer máquina. */
function hash(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0
  return h
}

/**
 * Resolve a skin de um jogador.
 *
 * `id` vem da escolha dele. Quando não vier (jogador de uma versão anterior,
 * campo corrompido, valor desconhecido) cai num sorteio ESTÁVEL pela semente -
 * o nome ou o uid. Nunca devolve `undefined`: o render não tem plano B.
 */
export function skinDe(id, semente = '') {
  const achada = POR_ID.get(id)
  if (achada) return achada
  return SKINS[hash(semente) % SKINS.length]
}

/** O id que pode ir pro protocolo. String vazia = "deixa o servidor decidir". */
export function normalizeSkinId(id) {
  return typeof id === 'string' && POR_ID.has(id) ? id : ''
}
