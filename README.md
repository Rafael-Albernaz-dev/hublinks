# Hublink

Hublink é uma casca configurável para reunir links de uma equipe com a identidade visual de cada cliente. Esta versão também funciona como demonstração de portfólio: permite alterar nome, descrição, logo, cor RGB e cards de links diretamente na interface.

## Estado atual

A configuração da demonstração fica **somente no navegador atual** (`localStorage`). É possível exportar e importar um JSON para reutilizar a aparência e os links em outro navegador. Os dois cards iniciais apontam para domínios de exemplo. Use apenas links públicos nesta versão: ainda não há login, catálogo privado, sincronização entre usuários, cofre, nem automação de acesso. A API responde apenas `/health`, e a extensão Chrome não pede permissões de sites.

## Rodar localmente

Requer Node 24 e npm:

```sh
npm ci
npm run check
npm run dev:web
```

Abra `http://127.0.0.1:5177`. Clique em **Personalizar hub** para editar a marca e os links. Para iniciar a API local, rode `npm run dev:api` em outro terminal; a saúde responde em `http://127.0.0.1:3177/health`.

## Configurar a demonstração

1. Preencha o nome da empresa e o texto de apresentação.
2. Envie uma logo PNG, JPG ou WebP de até 1 MB. A imagem é guardada como data URL no navegador e no JSON exportado.
3. Ajuste R, G e B entre 0 e 255 ou use o seletor de cor. O texto sobre a cor da marca escolhe automaticamente um tom claro ou escuro.
4. Adicione, edite ou remova até 30 links HTTPS públicos. Eles abrem em nova aba com `noopener noreferrer`.
5. Use **Exportar JSON** para guardar a configuração e **Importar JSON** para aplicá-la em outro navegador. O arquivo pode conter a logo e os links; revise-o antes de compartilhar.

O formato tem `version: 1` e os campos `companyName`, `subtitle`, `color`, `logoDataUrl` e `links`. A validação fica em [`apps/web/src/config.ts`](apps/web/src/config.ts). Um exemplo mínimo:

```json
{
  "version": 1,
  "companyName": "Cliente Exemplo",
  "subtitle": "Links úteis da equipe",
  "color": { "r": 31, "g": 86, "b": 139 },
  "logoDataUrl": null,
  "links": [
    {
      "id": "site",
      "title": "Site",
      "description": "Página pública",
      "url": "https://example.com/"
    }
  ]
}
```

## Estrutura

- `apps/web`: interface React/TypeScript, configuração e testes de validação e interação.
- `apps/api`: Fastify com endpoint de saúde em loopback.
- `apps/extension`: base Chrome Manifest V3 sem permissões de host.
- `docs/`: decisões, arquitetura, perguntas abertas e procedimento de adaptadores.
- `AGENTS.md`: regras de trabalho, incluindo commits em inglês e atualização deste README a cada feature.

O desenho de autenticação, cofre central e abertura assistida pertence a uma etapa futura. Consulte [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) antes de implementar essas funções. Build local não comprova login, compatibilidade com fornecedores nem prontidão para publicação.
