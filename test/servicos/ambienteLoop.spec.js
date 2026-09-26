import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// TODO LEITO DE AMBIENTE PRECISA SER LONGO.
//
// "O som de ondas está irritante, procure um som de ondas do mar mais suave e
// relaxante para colocar na praia" — founder, 25/08/2026.
//
// ⚠️ O DEFEITO NÃO ERA DE GOSTO, ERA DE DURAÇÃO — e por isso vira teste.
//
// O `amb-ondas.ogg` que estava no jogo tinha DOIS SEGUNDOS. Os outros seis
// leitos têm de seis a catorze. Dois segundos em loop repetem trinta vezes por
// minuto; o ouvido tranca nessa periodicidade em poucos ciclos e a partir dali
// não se escuta mais o mar, escuta-se o loop. Nenhuma escolha de amostra
// conserta isso, e nenhuma quantidade de "está mais bonito" mede.
//
// O arquivo curto entrou porque o script de montagem PEDE 12 s e aceita
// silenciosamente o que a fonte tiver — se a amostra baixada só tem dois
// segundos aproveitáveis, saem dois segundos e ninguém é avisado. Este teste é
// o aviso, e ele roda sobre o pacote VERSIONADO, que é o que o jogador ouve.
//
// A duração sai do granule position da última página Ogg, sem depender de
// ffmpeg: um teste de unidade que precisa de binário externo é um teste que
// não roda no CI de alguém.

const DIR = path.resolve('public/games/roquecraft/audio')

/**
 * Duração de um Ogg, em segundos.
 *
 * A última página do fluxo carrega o granule position — para Vorbis, o número
 * total de amostras. Dividido pela taxa (que está no cabeçalho de identificação
 * do primeiro pacote), dá a duração.
 */
function duracaoOgg(buf) {
  // taxa: no pacote de identificação Vorbis, 12 bytes depois de "\x01vorbis"
  const marca = buf.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]))
  if (marca < 0) return null
  const taxa = buf.readUInt32LE(marca + 12)
  if (!taxa) return null
  // última página: procura o último "OggS" de trás pra frente
  let p = buf.lastIndexOf('OggS')
  if (p < 0) return null
  const granule = buf.readUInt32LE(p + 6) + buf.readUInt32LE(p + 10) * 2 ** 32
  return granule / taxa
}

const leitos = fs.existsSync(DIR)
  ? fs
      .readdirSync(DIR)
      .filter((f) => f.startsWith('amb-') && f.endsWith('.ogg'))
      .map((f) => [f, duracaoOgg(fs.readFileSync(path.join(DIR, f)))])
  : []

describe('roquecraft — os leitos de ambiente são longos o bastante', () => {
  it('o pacote de áudio existe e tem leitos', () => {
    expect(leitos.length, `nenhum amb-*.ogg em ${DIR}`).toBeGreaterThan(3)
  })

  it('o leitor de duração funciona — nenhum leito devolveu nulo', () => {
    // ⚠️ PROVA DE VIDA DO INSTRUMENTO. Um parser que devolve `null` em tudo
    // faria o teste abaixo passar sem ler nada, que é o modo silencioso de um
    // teste morrer.
    for (const [nome, dur] of leitos) {
      expect(dur, `não consegui ler a duração de ${nome}`).toBeTypeOf('number')
      expect(dur, `${nome} deu duração absurda`).toBeGreaterThan(0.1)
    }
  })

  // ⚠️ O PISO É 4 s, E NÃO OS 6 QUE EU TINHA ESCRITO PRIMEIRO.
  //
  // Com 6 s, dois arquivos que ninguém reclamou reprovavam: o vento (5,96 s —
  // quatro centésimos abaixo) e o borbulhar de submerso (4,4 s). Isso não é o
  // teste achando defeito, é o número ser inventado. A única evidência que eu
  // tenho é a do founder, e ela é sobre DOIS segundos; esticar essa evidência
  // até 6 e depois abrir exceção pros dois que sobraram seria uma regra que não
  // acredita em si mesma.
  //
  // 4 s é o dobro do arquivo que provou ser intolerável — pega a classe do
  // defeito sem fingir saber onde exatamente está a fronteira. O de ondas, que
  // é o caso julgado, tem sua própria asserção logo abaixo.
  it.each(leitos)('%s tem pelo menos 4 s de loop', (nome, dur) => {
    expect(
      dur,
      `${nome} tem só ${dur?.toFixed(1)} s — o loop vai ser ouvido como loop`,
    ).toBeGreaterThanOrEqual(4)
  })

  it('o leito de ONDAS é longo de verdade — foi o que o founder reclamou', () => {
    // Ele tinha 2 s: trinta repetições por minuto, e o ouvido tranca nisso em
    // poucos ciclos. Foi refeito por síntese com 24 s (ver
    // `scripts/gen-roquecraft-ondas.py`). Doze segundos é a metade disso, e
    // existe pra que uma regeneração distraída não devolva o problema.
    const ondas = leitos.find(([n]) => n === 'amb-ondas.ogg')
    expect(ondas, 'sumiu o leito de ondas').toBeTruthy()
    expect(
      ondas[1],
      `amb-ondas.ogg voltou a ter ${ondas?.[1]?.toFixed(1)} s`,
    ).toBeGreaterThanOrEqual(12)
  })
})
