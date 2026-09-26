// RoqueCraft - Web Worker do mundo.
//
// Recebe a semente e a posição do jogador; devolve blocos (pra colisão) e
// malhas prontas (pra GPU). Geração, luz e mesher rodam TODOS aqui, então a
// thread principal só faz input, física e render.
//
// O laço trabalha em fatias curtas (`tick`) intercaladas com `setTimeout(0)`,
// pra continuar respondendo mensagens (o jogador andou, quebrou um bloco,
// mudou a distância de renderização) em vez de travar numa rajada longa.

import { createPipeline } from './chunkPipeline.js'

let pipe = null
let pumping = false

const emit = (msg, transfer) => self.postMessage(msg, transfer || [])

function pump() {
  if (pumping || !pipe) return
  pumping = true
  const step = () => {
    if (!pipe) {
      pumping = false
      return
    }
    let more = false
    try {
      more = pipe.tick(12)
    } catch (err) {
      emit({ t: 'error', message: String(err?.message || err) })
    }
    if (more) setTimeout(step, 0)
    else {
      pumping = false
      emit({ t: 'idle' })
    }
  }
  setTimeout(step, 0)
}

self.onmessage = (e) => {
  const m = e.data || {}
  switch (m.t) {
    case 'init': {
      pipe = createPipeline({
        seed: m.seed,
        dimensao: m.dimensao,
        renderDistance: m.renderDistance,
        emit,
      })
      if (m.edits) pipe.seedEdits(new Map(m.edits.map(([k, v]) => [k, new Map(v)])))
      pipe.setCenter(m.cx | 0, m.cz | 0, m.sy === undefined ? undefined : m.sy | 0)
      emit({ t: 'ready' })
      pump()
      break
    }
    case 'center':
      pipe?.setCenter(m.cx | 0, m.cz | 0, m.sy === undefined ? undefined : m.sy | 0)
      pump()
      break
    case 'distance':
      pipe?.setDistance(m.value)
      pump()
      break
    case 'edit':
      pipe?.edit(m.x, m.y, m.z, m.id)
      pump()
      break
    case 'editBatch':
      pipe?.editBatch(m.list || [])
      pump()
      break
    case 'reset':
      pipe?.reset(
        m.seed,
        m.edits ? new Map(m.edits.map(([k, v]) => [k, new Map(v)])) : null,
        m.dimensao,
      )
      emit({ t: 'reset-done', seed: m.seed, dimensao: m.dimensao })
      pump()
      break
    case 'dispose':
      pipe = null
      break
    default:
      break
  }
}
