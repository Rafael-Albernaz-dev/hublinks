# Estado do projeto

Em 14/10/2026, o repositório foi movido para `/home/toru/Documents/hublink` e publicado no GitHub. O código público tem commits; consulte `git log` e `git status` para o estado atual. O DRS detalhado e seus links operacionais permaneceram em `/home/toru/Documents/Codex/2026-10-13/c/outputs/` como material de pesquisa, fora deste repositório de portfólio.

Há três pacotes npm: web React, API Fastify e extensão Chrome MV3. A web é uma demonstração configurável com nome, descrição, logo PNG/JPG/WebP, cor RGB e links HTTPS públicos (com suporte a logos individuais nos cards). A configuração é validada e persistida localmente pela API Fastify em `data/config.json` via endpoints `GET/PUT /api/config`, consumidos pela web via proxy no Vite. O salvamento é explícito e a web exibe banner bloqueante caso a API esteja indisponível. A importação/exportação em JSON v1 é suportada para transporte de configuração. Não há persistência multiempresa nem banco multiusuário nesta fase.

A API expõe `/health` e `/api/config` em loopback (127.0.0.1). A extensão não se conecta à web e não tem permissões de host. Não há login, cofre, catálogo privado, automação de formulário ou integração com fornecedores.

A fase R1 (Qualidade e produto reutilizável) foi concluída e validada com suíte completa de testes unitários, testes de integração Fastify e 5 cenários E2E no Playwright (Chromium headless). Próximo recorte da variante privada (R2): fechar o contrato do DRS (sessão, 2FA admin, cofre central, chaves/backup, autorização por operação e protocolo de bilhete) antes de construir rotas sensíveis. Cada adaptador deve receber permissões por domínio apenas após validação.

O plano de execução e o ponto de retomada estão em `docs/ROADMAP.md` (R1 ENTREGUE; R2 PRÓXIMO).
