# J-API — Instruções para agentes

## Escopo

- Este repositório contém o serviço local de envio por WhatsApp.
- Trabalhe somente neste repositório e na instalação própria do J-API em produção.
- A aplicação consumidora é um projeto separado. Não leia nem modifique esse projeto sem autorização explícita do usuário.

## Contexto operacional

- Se `OPERATIONS.local.md` existir, leia-o completamente antes de qualquer operação de deploy, VPS, GitHub, systemd, QR ou diagnóstico de produção.
- `OPERATIONS.local.md` e `.env` são deliberadamente ignorados pelo Git e podem conter detalhes privados da infraestrutura.
- Não copie informações desses arquivos para commits, logs públicos, issues ou pull requests.

## Segurança

- Nunca versionar `.env`, dados de sessão, QR Codes ou credenciais do WhatsApp.
- O serviço deve permanecer ligado exclusivamente em `127.0.0.1`.
- Não apagar sessões diante de falhas temporárias.
- Antes de publicar, confirmar com `git status --short --ignored` que arquivos locais e `data/sessions/` continuam ignorados.

## Validação

- `send-file` aceita PDF e XLSX reais por caminho local, com confinamento por
  `realpath` e `ALLOWED_FILE_PATHS`, limite `MAX_PDF_SIZE_MB` e validação do MIME
  correspondente ao nome solicitado. XLSX por URL não é aceito; preservar o fluxo
  HTTPS/hosts permitidos dos PDFs e os jobs/payloads PDF legados.
- XLSX usa tipo de job `xlsx`, cópia privada `.xlsx` na fila com permissão `600`,
  chave idempotente por sessão e envio nativo com MIME de Excel. Preservar a cópia
  em falhas/reinícios e removê-la apenas após envio bem-sucedido. Não renomear
  planilha como PDF, aceitar ZIP genérico nem expor novos diretórios/portas.

```bash
npm run check
npm audit --omit=dev
```
