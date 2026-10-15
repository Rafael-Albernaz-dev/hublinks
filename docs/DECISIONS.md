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

## R1 — Demonstração pública reutilizável (15/10/2026)

- **Persistência central via API local:** a web carrega `GET /api/config` e salva a configuração completa com `PUT /api/config`. O arquivo padrão é `data/config.json`; `HUB_CONFIG_PATH` permite outro caminho para testes. A API valida o JSON v1 e grava por arquivo temporário seguido de rename, com modo `0600` na criação. Isso compartilha a configuração entre navegadores conectados à mesma API local, sem oferecer autenticação, backup ou isolamento multiempresa.
- **Rede estrita:** a web depende da API de loopback. Se ela estiver indisponível, a interface mostra erro e bloqueia edição. Não há fallback silencioso para `localStorage`.
- **Salvamento explícito:** alterações de marca, cor e links permanecem em rascunho até **Salvar alterações**. Importar JSON também cria um rascunho. Exportar JSON pode conter dados inseridos pelo usuário e exige revisão antes de compartilhar.
- **Logos por card:** cada link aceita logo opcional PNG, JPG ou WebP em data URL base64 de até 500 KB. A ausência de logo mostra o número do card. A logo faz parte do JSON persistido e exportado.
- **Reutilização:** o modelo da demonstração é uma instalação local/on-premise separada por cliente (single-tenant). O arquivo da API local não é um catálogo privado nem um painel administrativo multiusuário. A variante privada ainda depende do contrato de identidade, autorização, cofre e operação em R2.

Essas decisões encerram para R1 a alternativa de instalação da pergunta 9 e a necessidade de configuração compartilhada entre navegadores da pergunta 10 em `docs/OPEN_QUESTIONS.md`. Quem pode editar/publicar, versionamento e reversão para a variante privada continuam pendentes em R2; o arquivo de perguntas permanece como registro das questões originais.

## R2 — Contratos e Especificação da Variante Privada (15/10/2026)

- A variante privada começa com uma instalação isolada e PostgreSQL 16 local em porta de host `127.0.0.1:5439` por padrão. As seis tabelas centrais estão em `apps/api/migrations/001_initial_schema.sql`; a API atual não usa esse banco.
- Sessões usam cookie opaco `HttpOnly` rolling de 365 dias, token persistido apenas como SHA-256 e revogação pelo servidor via `revoked_at`. Cada operação sensível revalida sessão e autorização.
- Cofre planejado com AES-256-GCM, chave mestra de 32 bytes injetada em runtime, IV aleatório de 12 bytes e tag de 16 bytes. As duas colunas cifradas formam uma única mensagem autenticada; não se reutiliza IV em duas operações. Credenciais compartilhadas são geridas pelo admin; individuais pertencem ao atendente, com revelação de suporte ao admin.
- Bilhete de abertura: UUID v4 interno e token portador aleatório de 32 bytes, guardado apenas por hash; TTL de 30 segundos, vínculo com usuário/sessão/serviço e consumo transacional único pela extensão diretamente na API. A senha de SVA não passa pelo React.
- Piloto local do Hub sem 2FA do Hub; acesso administrativo restrito à rede local/loopback. Desafios de fornecedores continuam humanos. Domínio/TLS, 2FA futuro do admin, chaves/backup e vínculo da extensão seguem como gates operacionais antes de exposição remota.
- Catálogo piloto: PARTIU!, Fullcam, Playhub, IPTV, CRM e Fullarm; os dois últimos ficam sem ação até validação da URL (D-41). Três planilhas de consulta abrem em nova aba sem cofre (D-21). Nenhuma URL operacional integra o repositório público.

O contrato completo, inclusive limites e pendências para R3–R8, está em `docs/PRIVATE_SPEC.md`. R2 entrega especificação e DDL; não entrega endpoints privados, automação, implantação ou prova de fornecedor.

## R3 — Identidade e sessões locais (15/10/2026)

- A API abre pool `pg` de até dez conexões, timeout de conexão de cinco segundos e idle de trinta segundos. No boot local, aplica o DDL R2 somente se a tabela `users` não existir, sob advisory lock, e provisiona um admin se ainda não houver um. Fecha o pool no hook `onClose`.
- Senhas do Hub usam `node:crypto.scrypt` com salt aleatório de 16 bytes e chave de 64 bytes. A comparação usa `timingSafeEqual`. O admin inicial tem valores de desenvolvimento substituíveis por `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`; o ambiente piloto deve defini-los antes do primeiro boot. Mudar essas variáveis depois não altera o admin já criado.
- Login cria token opaco de 32 bytes, salva somente SHA-256 em `sessions` e entrega cookie `HttpOnly`, `SameSite=Lax`, rolling de 365 dias. `GET /api/auth/me` e rotas administrativas revalidam revogação/inatividade no banco. Logout e redefinição de senha revogam sessões no servidor; redefinição e revogação são transacionais.
- Admin pode listar/criar atendentes e redefinir senha de atendente. O servidor verifica papel por operação. O React exige sessão para exibir links e oferece painel básico de gestão. `GET/PUT /api/config` continuam endpoints da demonstração pública local, sem autorização; esse arquivo não é catálogo privado. R5 deve servir destinos privados somente por API autorizada.
- O piloto permanece vinculado ao loopback. Não há 2FA do Hub, limitação de tentativas, CSRF por origem, TLS, cofre, integração com extensão ou prova em fornecedor nesta etapa. Esses controles são gates para exposição remota e fases posteriores.
