import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ⚠️ ESTE TESTE GUARDA UM INVARIANTE QUE NÃO É DE JOGO, É DE INSTRUMENTO.
//
// Quando a chuva entrou, ela começou a andar na frente da lente de sondas que
// existiam desde antes dela. A da refração passou a RECUSAR o próprio número:
// duas fotos idênticas discordavam 0,177 enquanto o sinal que ela mede é 0,376
// — metade do sinal virou ruído. Com a chuva parada a deriva caiu para 0,017.
//
// O conserto foi acoplar a chuva ao `congelarAgua`, que é o interruptor que
// TODAS as sondas de água já usam: quem congela a água congela a chuva, porque
// chuva é água andando. Ninguém que escreva a próxima sonda vai saber disso —
// nem quem refatorar o laço de desenho daqui a três meses.
//
// Um comentário não segura isso; um teste segura. E ele é de FONTE porque o
// laço de desenho precisa de WebGL para rodar: o que dá para verificar sem GPU
// é que a chamada continua lendo o relógio congelado em vez do relógio de
// parede. É pouco, e é muito mais que nada.

const ENGINE = path.resolve('src/servicos/render/engine.js')

describe('congelar a água congela a chuva', () => {
  const fonte = fs.readFileSync(ENGINE, 'utf8')

  it('a cortina de chuva lê o relógio congelado, não o de parede', () => {
    // A chamada tem que passar o tempo congelado quando `fx.congelarAgua` está
    // ligado — o MESMO instante que a onda usa, senão as duas se moveriam uma
    // em relação à outra e o par de fotos voltaria a discordar.
    expect(fonte).toMatch(
      /chuvaVisual\.update\(\s*fx\.congelarAgua \? \(fx\.tempoDaAgua \?\? 1000\) : timeSeconds,/,
    )
  })

  it('a onda e a chuva param no MESMO instante', () => {
    // Se um congelasse em 1000 e o outro em outro número, as duas ficariam
    // paradas — mas em cenas diferentes, e o A/B mediria a diferença entre elas.
    const daOnda = fonte.match(
      /timeSecondsOverride: fx\.congelarAgua \? \(fx\.tempoDaAgua \?\? (\d+)\) : null/,
    )
    const daChuva = fonte.match(
      /chuvaVisual\.update\(\s*fx\.congelarAgua \? \(fx\.tempoDaAgua \?\? (\d+)\) : timeSeconds/,
    )
    expect(daOnda, 'o congelamento da onda mudou de forma').not.toBeNull()
    expect(daChuva, 'o congelamento da chuva mudou de forma').not.toBeNull()
    expect(daChuva[1]).toBe(daOnda[1])
  })

  it('congelar PARA o relógio, não apaga a chuva', () => {
    // ⚠️ A DIFERENÇA IMPORTA. Esconder a cortina também estabilizaria o par de
    // fotos — e apagaria a prova: a foto da sonda da chuva não mostraria mais
    // que está chovendo, e o próximo a olhar concluiria que a chuva sumiu.
    // A força continua vindo da precipitação, e só o tempo é que congela.
    const chamada = fonte.match(/chuvaVisual\.update\(([\s\S]{0,220}?)\)\n/)
    expect(chamada, 'a chamada da cortina sumiu').not.toBeNull()
    expect(chamada[1]).toMatch(/precipita \*/)
    expect(chamada[1]).not.toMatch(/congelarAgua \? 0/)
  })
})
