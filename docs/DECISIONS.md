# Decisões e origem

Fonte da variante SVA: DRS versão 0.37 de 14/10/2026, preservado fora deste repositório em `Codex/2026-10-13/c/outputs/`. Consulte os IDs e a legenda de estado no original antes de implementar a variante privada. Este resumo evita publicar os links operacionais do documento bruto.

## Confirmado no DRS

- D-02, D-12 e D-13: web React/TypeScript e extensão própria para piloto em Chrome, com instalação manual.
- D-23, D-25, D-27 e D-33: Hub com login individual, backend/cofre central, contas compartilhadas mantidas pelo admin e individuais pelo atendente; mesmos cards visíveis no piloto.
- D-19: reCAPTCHA e 2FA do Playhub ficam com o atendente.
- D-21: planilhas de consulta continuam acessíveis por link, em leitura; login do Hub não restringe o Google.
- D-28, D-30 e D-35: revogação imediata das sessões do Hub, 2FA admin em navegador novo e revogação após redefinição de senha.
- D-41: Fullarm e CRM aparecem sem ação enquanto não tiverem URL.

## Escolhas reversíveis desta inicialização

- npm workspaces e um lockfile para web, API e extensão.
- Vite + React para web, Fastify para API, Manifest V3 e esbuild para extensão.
- Node 24, TypeScript strict, ESLint e Prettier. Sem CI, banco, autenticação ou permissões de host por enquanto.
- `/health` em loopback para verificação local, sem dados de negócio.
- Repositório `hublink/` com uma demonstração pública configurável; o DRS bruto continua no diretório de pesquisa.
- Configuração local com logo, RGB e links HTTPS públicos; importação/exportação JSON. Isso não substitui o catálogo autenticado da variante privada.
- Mensagens de commit em inglês quando forem autorizadas; README atualizado em cada feature.

Essas escolhas não fecham perguntas de produto, segurança ou infraestrutura em aberto no DRS. Uma revisão futura deve registrar a alternativa escolhida e sua prova antes de implementar rotas sensíveis.
