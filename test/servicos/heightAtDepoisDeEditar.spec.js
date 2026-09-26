import { describe, it, expect } from 'vitest'
import { createWorldClient } from '../../src/servicos/worldClient.js'

// ⚠️ A FIAÇÃO, E NÃO A CONTA (RC-11).
//
// `heightmapDoCliente.spec.js` prova que a conta do topo está certa. Isso não
// diz nada sobre o defeito: a conta do worker também estava certa, e mesmo
// assim o cliente devolvia o topo velho — porque ninguém a chamava deste lado.
// Este arquivo monta o cliente de verdade, edita um bloco e PERGUNTA a ele.
//
// `forceInline: true` porque o worker não existe em ambiente de teste; o
// caminho de escrita local é o mesmo nos dois.

const SEMENTE = 20260912

async function mundoPronto() {
  const cliente = createWorldClient({
    seed: SEMENTE,
    renderDistance: 1,
    forceInline: true,
    onMesh: () => {},
    onUnload: () => {},
  })
  cliente.start(0, 0, new Map())
  // O pipeline inline gera em fatias; espera o chunk do centro existir.
  for (let i = 0; i < 200; i++) {
    if (cliente.heightAt(0, 0) > 0) break
    await new Promise((r) => setTimeout(r, 10))
  }
  return cliente
}

describe('heightAt depois de editar (RC-11)', () => {
  it('cavar o topo baixa a altura que o cliente responde', async () => {
    const cliente = await mundoPronto()
    const antes = cliente.heightAt(0, 0)
    expect(antes, 'o mundo não carregou a tempo — teste inconclusivo').toBeGreaterThan(0)

    // O bloco logo abaixo do topo livre é o chão. Minerá-lo.
    cliente.edit(0, antes - 1, 0, 0)
    const depois = cliente.heightAt(0, 0)
    expect(depois, 'o cliente continuou respondendo o topo ANTIGO').toBeLessThan(antes)
    cliente.dispose()
  })

  it('construir sobe a altura que o cliente responde', async () => {
    const cliente = await mundoPronto()
    const antes = cliente.heightAt(0, 0)
    expect(antes).toBeGreaterThan(0)

    cliente.edit(0, antes, 0, 1) // pedra em cima do chão
    expect(cliente.heightAt(0, 0)).toBe(antes + 1)
    cliente.dispose()
  })

  it('um lote de edições atualiza todas as colunas que tocou', async () => {
    const cliente = await mundoPronto()
    const h00 = cliente.heightAt(0, 0)
    const h10 = cliente.heightAt(1, 0)
    expect(h00).toBeGreaterThan(0)
    expect(h10).toBeGreaterThan(0)

    cliente.editBatch([
      { x: 0, y: h00, z: 0, id: 1 },
      { x: 1, y: h10, z: 0, id: 1 },
    ])
    expect(cliente.heightAt(0, 0)).toBe(h00 + 1)
    expect(cliente.heightAt(1, 0), 'o lote atualizou só a primeira coluna').toBe(h10 + 1)
    cliente.dispose()
  })
})
