// O log de desenvolvimento do RoqueCraft: namespace por assunto, calado fora
// de dev.
//
// Vinha do logger do RoqueOS (`src/services/utils/logger.js`), que decidia
// "estou em dev?" por `process.env.DEV`, uma variável que o Quasar injeta no
// build do front e que não existe no Vite do repo nem no do SDK. Aqui a
// pergunta é a do Vite, `import.meta.env.DEV`, que vale igual no `yarn dev`
// do repo e no build do RoqueOS (lá ela vira `false` na produção).
//
// No teste o Vitest diz DEV verdadeiro; o `MODE === 'test'` segura o log de
// depuração fora da saída da suíte, como era no front (onde `process.env.DEV`
// não existia no teste). Aviso e erro saem sempre: esses são para quem joga.

const ehDev = () => {
  const env = import.meta.env ?? {}
  return Boolean(env.DEV) && env.MODE !== 'test'
}

export const createLogger = (namespace = '') => {
  const prefixo = namespace ? `[${namespace}]` : ''
  const comPrefixo = (args) => (prefixo ? [prefixo, ...args] : args)

  return {
    debug: (...args) => {
      if (ehDev()) console.log(...comPrefixo(args))
    },
    info: (...args) => {
      if (ehDev()) console.log(...comPrefixo(args))
    },
    warn: (...args) => {
      console.warn(...comPrefixo(args))
    },
    error: (...args) => {
      console.error(...comPrefixo(args))
    },
  }
}
