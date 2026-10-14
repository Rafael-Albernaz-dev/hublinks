# Estado do projeto

Em 14/10/2026, o repositório foi movido para `/home/toru/Documents/hublink`, ainda sem commit. O DRS detalhado e seus links operacionais permaneceram em `/home/toru/Documents/Codex/2026-10-13/c/outputs/` como material de pesquisa, fora deste repositório de portfólio.

Há três pacotes npm: web React, API Fastify e extensão Chrome MV3. A web é uma demonstração configurável com nome, descrição, logo PNG/JPG/WebP, cor RGB e links HTTPS públicos. A configuração é validada, salva em `localStorage` e pode ser importada/exportada em JSON. Dois links de exemplo mostram os cards iniciais. Não há backend para persistir configurações de vários usuários ou clientes.

A API expõe somente `/health` em loopback. A extensão não se conecta à web e não tem permissões de host. Não há login, cofre, catálogo privado, automação de formulário ou integração com fornecedores.

Próximo recorte da variante privada: fechar sessão, 2FA admin, cofre central, chaves/backup, autorização por operação e protocolo de bilhete antes de construir rotas sensíveis. Cada adaptador deve receber permissões por domínio apenas após validação.
