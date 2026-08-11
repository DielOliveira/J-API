# Local WhatsApp Service

Serviço HTTP pequeno, multi-sessão e restrito a `127.0.0.1`, para envio de texto, PIX e PDF pelo WhatsApp. Usa [Baileys](https://github.com/WhiskeySockets/Baileys) e uma fila persistente SQLite, sem navegador headless, Redis, Docker, recebimento de mensagens ou webhooks.

> **Aviso:** Baileys usa o protocolo do WhatsApp Web e não é uma API oficial da Meta. Mudanças no WhatsApp podem interromper o serviço e o uso automatizado pode ter implicações nos termos/políticas da plataforma. Não use para spam; obtenha consentimento dos destinatários. Para garantias comerciais, considere a WhatsApp Business Platform oficial.

## Requisitos

- Linux e Node.js 20 ou mais recente (Node 22 recomendado)
- Uma conta WhatsApp capaz de vincular dispositivos
- PHP com extensão cURL apenas para executar o exemplo de cliente
- Um diretório privado e gravável para a sessão
- Um ou mais diretórios de PDFs legíveis pelo usuário do serviço

## Instalação

```bash
cd /opt/whatsapp-service
npm ci
cp .env.example .env
chmod 600 .env
mkdir -p data/sessions
mkdir -p data/queue-files
chmod 700 data/sessions data/queue-files
```

Durante desenvolvimento, se ainda não existir `package-lock.json`, execute `npm install` no lugar de `npm ci`.

## Configuração

```dotenv
HOST=127.0.0.1
PORT=3001
SESSION_PATH=/opt/whatsapp-service/data/sessions
MAX_SESSIONS=10
ALLOWED_FILE_PATHS=/var/www/minha-app/storage/whatsapp
ALLOWED_DOWNLOAD_HOSTS=public-api-pay.lytex.com.br
MAX_PDF_SIZE_MB=20
QUEUE_DATABASE_PATH=/opt/whatsapp-service/data/queue.sqlite
QUEUE_FILES_PATH=/opt/whatsapp-service/data/queue-files
SEND_DELAY_MIN_MS=5000
SEND_DELAY_MAX_MS=12000
MAX_SENDS_PER_HOUR=60
MAX_CONTACTS_PER_HOUR=20
MAX_SENDS_PER_DAY=150
MAX_QUEUE_SIZE=1000
MAX_SEND_ATTEMPTS=5
RETRY_BASE_MS=30000
RETRY_MAX_MS=1800000
HTTP_BODY_LIMIT=32kb
```

`HOST` aceita intencionalmente apenas `127.0.0.1`. Separe múltiplas raízes de arquivos e hosts de download com vírgula. Não configure `/` como raiz. O arquivo enviado é resolvido com `realpath`, o que também impede que symlinks escapem das raízes permitidas. Downloads aceitam apenas HTTPS e cada redirecionamento precisa permanecer em `ALLOWED_DOWNLOAD_HOSTS`. O conteúdo precisa ser detectado como PDF e respeitar o limite configurado.

`SESSION_PATH` é a raiz que conterá um subdiretório por sessão. `MAX_SESSIONS` limita conexões e criação acidental. O banco da fila e os PDFs preparados são privados e persistem entre reinícios. Não publique `.env`, `data/sessions`, `data/queue.sqlite*`, `data/queue-files` nem os backups `*.invalid-*`.

## Primeira conexão e QR Code

Inicie o processo:

```bash
npm start
```

A sessão `default` é criada automaticamente. Consulte seu QR até `dataUrl` estar disponível:

```bash
curl -s http://127.0.0.1:3001/qr
```

Para criar ou reconectar uma sessão nomeada, consulte o QR dela. Isso cria a sessão preguiçosamente:

```bash
curl -s http://127.0.0.1:3001/sessions/financeiro/qr
curl -s http://127.0.0.1:3001/sessions/atendimento/qr
```

O identificador aceita de 1 a 32 caracteres: letras minúsculas, números, `_` e `-`. Cada sessão possui credenciais, estado, reconexão e fila independentes. Sessões encontradas em disco são restauradas automaticamente no boot.

Enquanto o QR está sendo preparado, o endpoint responde HTTP 202 com `dataUrl: null`. Depois responde HTTP 200:

```json
{
  "session": "default",
  "required": true,
  "state": "awaiting_qr",
  "dataUrl": "data:image/png;base64,..."
}
```

Cole a `dataUrl` na barra de um navegador local ou extraia a parte base64 para um PNG. No celular, abra **WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo** e leia o QR. Após vincular, `/qr` informa `required: false` e não expõe credenciais.

O QR expira e será atualizado automaticamente. Depois do primeiro login, a sessão em disco é reutilizada nos restarts. Falhas temporárias acionam reconexão com espera progressiva. Somente um logout definitivo arquiva a sessão inválida como `NOME.invalid-TIMESTAMP` e inicia um novo vínculo; o backup não é usado automaticamente e deve ser removido manualmente após diagnóstico.

## Status

```bash
curl -s http://127.0.0.1:3001/status
curl -s http://127.0.0.1:3001/sessions/financeiro/status
curl -s http://127.0.0.1:3001/sessions
```

```json
{
  "session": "default",
  "connected": true,
  "state": "ready",
  "phone": "5562999999999",
  "queue": 0
}
```

Estados comuns: `starting`, `connecting`, `awaiting_qr`, `ready`, `disconnected`, `reconnecting`, `logged_out` e `stopped`.

## Painel da fila

Abra no navegador da própria máquina ou por um túnel SSH local:

```text
http://127.0.0.1:3001/admin/queue
```

O painel atualiza a cada 10 segundos, reúne todas as sessões e permite filtrar por sessão e status. Ele mostra somente metadados operacionais: telefone mascarado, tipo, horários, tentativas e último erro. Conteúdo das mensagens, chaves PIX e caminhos de PDF não são expostos.

O painel segue a mesma fronteira de confiança da API e permanece disponível exclusivamente em `127.0.0.1`. Não altere o bind para expô-lo diretamente na internet.

## Enviar texto

O telefone deve conter somente 10 a 15 dígitos, incluindo código do país e DDD, sem `+`, espaços ou pontuação.

```bash
curl -sS -X POST http://127.0.0.1:3001/send-text \
  -H 'Content-Type: application/json' \
  -d '{"phone":"5562999999999","message":"Olá, teste."}'
```

```json
{"success":true,"session":"default","queued":true,"duplicate":false,"jobId":"...","status":"pending"}
```

Para outra sessão, use `POST /sessions/financeiro/send-text` com o mesmo JSON.

## Enviar PIX

Envia o cartão nativo do PIX, com logomarca e botão **Copiar chave Pix**. `pix` deve ter uma única linha e até 1024 caracteres. `merchantName` e `keyType` são opcionais; os padrões são `Pix` e `EVP`. Os tipos aceitos são `EVP`, `EMAIL`, `PHONE` e `CPF`.

```bash
curl -sS -X POST http://127.0.0.1:3001/send-pix \
  -H 'Content-Type: application/json' \
  -d '{
    "phone":"5562999999999",
    "message":"Pague usando o PIX:",
    "pix":"00020101021226820014br.gov.bcb.pix...",
    "merchantName":"Empresa Exemplo",
    "keyType":"EVP"
  }'
```

```json
{"success":true,"session":"default","queued":true,"duplicate":false,"jobId":"...","status":"pending"}
```

Para outra sessão, use `POST /sessions/financeiro/send-pix` com o mesmo JSON. O cartão depende do protocolo não oficial do WhatsApp Web e deve ser testado nos aparelhos usados. Alguns clientes, especialmente o WhatsApp Web, podem não renderizar mensagens interativas enviadas por dispositivos vinculados.

## Enviar PDF

O caminho refere-se ao filesystem do servidor e precisa ficar dentro de `ALLOWED_FILE_PATHS`:

```bash
curl -sS -X POST http://127.0.0.1:3001/send-file \
  -H 'Content-Type: application/json' \
  -d '{
    "phone":"5562999999999",
    "path":"/var/www/minha-app/storage/whatsapp/documento.pdf",
    "filename":"documento.pdf",
    "caption":"Segue seu documento."
  }'
```

Também é possível informar `url` no lugar de `path`. O PDF é baixado, validado e copiado para a área privada da fila antes de a requisição ser aceita:

```bash
curl -sS -X POST http://127.0.0.1:3001/send-file \
  -H 'Content-Type: application/json' \
  -d '{
    "phone":"5562999999999",
    "url":"https://public-api-pay.lytex.com.br/v1/invoices/print/...",
    "filename":"boleto.pdf",
    "caption":"Segue seu boleto."
  }'
```

Informe exatamente um entre `path` e `url`.

Os endpoints de envio respondem HTTP 202 assim que o item é persistido. O worker envia em FIFO, aplica um intervalo aleatório e respeita os limites por hora, contatos distintos e dia. Quando um limite é atingido, os jobs permanecem pendentes. Reinícios recuperam jobs pendentes e jobs interrompidos voltam para a fila.

Para impedir duplicidade quando o consumidor repetir uma requisição, envie uma chave estável:

```http
Idempotency-Key: cobranca-12345-pdf
```

Repetir a mesma chave na mesma sessão devolve HTTP 200 com o `jobId` original. Sem essa chave, toda requisição cria um job novo.

Consulte a fila e um job específico:

```bash
curl -s http://127.0.0.1:3001/sessions/default/queue
curl -s http://127.0.0.1:3001/sessions/default/queue/SEU_JOB_ID
```

Os estados são `pending`, `processing`, `sent` e `failed`. Somente `sent` possui `whatsappMessageId`. Erros temporários são tentados novamente com espera exponencial; erros definitivos e o esgotamento das tentativas deixam o job como `failed` para diagnóstico.

Cada sessão tem sua própria fila: um envio lento em `financeiro` não bloqueia `atendimento`. Para PDF em outra sessão, use `POST /sessions/financeiro/send-file`.

## Cliente PHP

O exemplo em [`examples/WhatsAppClient.php`](examples/WhatsAppClient.php) oferece:

```php
$whatsapp = new WhatsAppClient();
$financeiro = new WhatsAppClient(session: 'financeiro');
$whatsapp->sendText('5562999999999', 'Olá, teste.');
$whatsapp->sendPix('5562999999999', 'Pague usando o PIX:', '000201...');
$whatsapp->sendPdf(
    '5562999999999',
    '/var/www/minha-app/storage/whatsapp/documento.pdf',
    'documento.pdf',
    'Segue seu documento.',
);
$whatsapp->sendPdfUrl(
    '5562999999999',
    'https://public-api-pay.lytex.com.br/v1/invoices/print/...',
    'boleto.pdf',
    'Segue seu boleto.',
);
```

## systemd

O exemplo em [`deploy/whatsapp-service.service`](deploy/whatsapp-service.service) usa um usuário dedicado e restringe acessos. Ajuste os caminhos `ReadWritePaths` e `ReadOnlyPaths` para serem iguais ao `.env`.

```bash
sudo useradd --system --home /opt/whatsapp-service --shell /usr/sbin/nologin whatsapp-service
sudo chown -R whatsapp-service:whatsapp-service /opt/whatsapp-service
sudo chmod 700 /opt/whatsapp-service/data/sessions /opt/whatsapp-service/data/queue-files
sudo cp deploy/whatsapp-service.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-service
sudo systemctl status whatsapp-service
journalctl -u whatsapp-service -f
```

Se a aplicação PHP roda sob outro usuário, dê ao usuário `whatsapp-service` acesso somente de leitura ao diretório específico de PDFs (por grupo ou ACL), nunca ao storage inteiro sem necessidade.

## Checks e testes

```bash
npm run check
php -l examples/WhatsAppClient.php
```

Os testes automatizados cobrem fila, validação/confinamento de PDF e endpoints com cliente WhatsApp simulado. QR, vínculo e entrega real exigem teste manual com um WhatsApp.

## Troubleshooting

- **`/qr` continua sem `dataUrl`:** confira conectividade de saída, relógio do servidor e logs; aguarde a tentativa de reconexão antes de reiniciar.
- **`WhatsApp is not connected`:** consulte `/status`; aguarde `ready` ou vincule novamente em `/qr`.
- **Sessão perde login:** veja se surgiu `NOME.invalid-*` e confira no celular se o dispositivo foi removido. Não copie sessões entre processos ativos.
- **PDF bloqueado:** confirme caminho absoluto, permissões do usuário systemd, raiz em `ALLOWED_FILE_PATHS`, conteúdo PDF verdadeiro e tamanho máximo.
- **systemd bloqueia o PDF:** inclua cada raiz configurada também em `ReadOnlyPaths` na unit e rode `systemctl daemon-reload && systemctl restart whatsapp-service`.
- **Mudança do WhatsApp quebra a conexão:** consulte releases/advisories do Baileys antes de atualizar. Mantenha a versão fixada e teste upgrades deliberadamente.

## Endurecimento futuro

Localhost é a fronteira de confiança desta versão. Se o serviço algum dia for exposto por proxy, container ou rede, adicione autenticação, TLS/regras de firewall e rate limiting antes de alterar o bind. Não mude simplesmente `HOST` para `0.0.0.0`; o código rejeita isso de propósito.
