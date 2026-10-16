# Hublink — guia para agentes

Leia este arquivo antes de alterar o repositório. Hublink contém uma demonstração pública configurável e a base de uma futura variante privada com autenticação, cofre central e extensão Chrome. O DRS detalhado da variante SVA permanece no diretório de pesquisa original, fora deste repositório; `docs/DECISIONS.md` resume as decisões relevantes sem links operacionais.

## Leitura curta

1. `README.md`: funcionalidades reais, modo de configuração e comandos.
2. `docs/CONTEXT.md`: estado implementado e próximo passo.
3. `docs/ROADMAP.md`: sequência de entregas, dependências e ponto de retomada.
4. `docs/ARCHITECTURE.md`: fronteiras entre demonstração, API, extensão e SVAs.
5. `docs/DECISIONS.md` e `docs/OPEN_QUESTIONS.md`: decisões e pendências.
6. Se alterar um adaptador de fornecedor, leia `docs/skills/extension-adapter/SKILL.md`.

## Guardrails

- **Papéis e Execução de Agentes**: Hermes atua estritamente como Auditor e Gerador de Despacho (elaboração de tickets de prompt em `prompts/` para o executor Codex GPT-6-SOL). Hermes **não** deve implementar código autonomamente. Hermes só executa alterações diretamente quando o usuário ordenar explicitamente `"executar"` / `"execute"` no chat.
- Antes de editar, veja `git status --short --branch`; preserve mudanças de terceiros. Não faça commit, push ou deploy sem instrução explícita. **Quando um commit for autorizado, escreva a mensagem inteira em inglês**, incluindo título e corpo.
- **Atualize os arquivos `README.md` no mesmo trabalho de toda nova feature ou mudança de comportamento. Escreva todos os READMEs integralmente em inglês e mantenha regras de agentes fora deles**, concentradas em `AGENTS.md` e nas skills apropriadas. Documente uso, limites e comandos afetados; mantenha exemplos executáveis e o estado atual honesto.
- A demonstração só pode conter links e logos próprios ou públicos. Não copie URLs operacionais, planilhas reais, credenciais, dados de clientes ou o DRS bruto para este repositório de portfólio. Arquivos JSON exportados podem conter dados do usuário e não devem ser versionados sem revisão.
- Não acesse painéis de fornecedores, planilhas privadas, contas, senhas ou produção para desenvolver o scaffold. Use dados sintéticos em testes.
- Nunca grave senhas, códigos 2FA, cookies, bilhetes, chaves ou dados de clientes em Git, documentação, logs, screenshots ou exemplos. `.gitignore` não torna seguro um segredo já rastreado.
- A configuração em `localStorage` é individual por navegador e não oferece autenticação, controle de acesso nem sincronização. Para catálogo privado, URLs e ações devem vir de API autenticada e autorizada; esconder um card em React não equivale a autorização.
- O frontend não recebe senhas de SVA. A extensão deve aceitar somente a origem oficial configurada, serviço conhecido e uma tentativa iniciada pelo usuário. The user approved the R7 exception `https://*/*` solely for immediate assisted autofill of dynamically configured HTTPS destinations after a valid ticket exchange. Before injecting, verify the loaded tab against the API-confirmed destination; the content script must verify its own location again before receiving credentials. Do not add other broad host permissions or remote scripts.
- Acesso a uma credencial individual exige identidade do dono; compartilhadas são geridas e reveladas pelo admin. Toda autorização sensível precisa ser conferida no servidor por operação.
- Revogação do Hub não encerra sessões nos SVAs nem muda permissões das planilhas. CAPTCHA e 2FA são humanos. Não declare login concluído sem observar o destino real.
- Não invente decisão de duração de sessão, desenho de chave/cofre, backup, domínio/TLS, associação de extensão ou automação por fornecedor. Registre em `docs/OPEN_QUESTIONS.md` até haver decisão e prova.
- Para cada mudança, rode verificações proporcionais (`npm run check` para alterações de base). Informe exatamente o que passou e o que depende de navegador, provedor ou infraestrutura.

## Comandos locais

Node 24 e npm. `npm ci`, `npm run dev:web`, `npm run dev:api`, `npm run check`. A API local escuta apenas `127.0.0.1:3177` por padrão. A extensão gerada fica em `apps/extension/dist` após `npm run build`.
