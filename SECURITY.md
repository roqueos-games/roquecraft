# Segurança

## Como reportar

Não abra issue pública para falha de segurança. Use o
[relatório privado de vulnerabilidade](https://github.com/roqueos-games/roquecraft/security/advisories/new)
do GitHub. A resposta vem em até sete dias.

## O que vale aqui

O jogo roda **na mesma origem** do RoqueOS. O SDK entrega capacidades em vez das stores do
sistema, mas isso não é fronteira de segurança. O que protege quem usa o RoqueOS é:

- todo merge passa pela revisão do mantenedor (`CODEOWNERS`);
- o RoqueOS instala o jogo por uma tag exata, com o SHA travado no lockfile, e toda troca de
  versão é revisada antes de entrar;
- nenhum script roda sozinho no install, e o `jogo check` reprova se aparecer um;
- o CI de pull request não lê segredo nenhum.

---

## Security (English)

Do not open public issues for vulnerabilities; use GitHub's private vulnerability reporting.
The game runs on the same origin as RoqueOS. Protection comes from maintainer review on every
merge, exact version pins in RoqueOS, no install-time scripts and secret-free CI.
