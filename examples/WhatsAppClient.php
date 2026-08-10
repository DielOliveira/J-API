<?php

final class WhatsAppClient
{
    public function __construct(
        private string $baseUrl = 'http://127.0.0.1:3001',
        private string $session = 'default',
    )
    {
    }

    public function sendText(string $phone, string $message): array
    {
        return $this->post('/send-text', [
            'phone' => $phone,
            'message' => $message,
        ]);
    }

    public function sendPdf(
        string $phone,
        string $filePath,
        string $filename,
        ?string $caption = null,
    ): array {
        return $this->post('/send-file', array_filter([
            'phone' => $phone,
            'path' => $filePath,
            'filename' => $filename,
            'caption' => $caption,
        ], static fn (mixed $value): bool => $value !== null));
    }

    private function post(string $endpoint, array $payload): array
    {
        if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $this->session)) {
            throw new InvalidArgumentException('Invalid WhatsApp session identifier');
        }
        $prefix = $this->session === 'default' ? '' : '/sessions/' . rawurlencode($this->session);
        $curl = curl_init($this->baseUrl . $prefix . $endpoint);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 60,
        ]);
        $body = curl_exec($curl);
        if ($body === false) {
            throw new RuntimeException('WhatsApp service request failed: ' . curl_error($curl));
        }
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        $result = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException($result['error'] ?? "WhatsApp service returned HTTP {$status}");
        }
        return $result;
    }
}

// $whatsapp = new WhatsAppClient();
// $financeiro = new WhatsAppClient(session: 'financeiro');
// $whatsapp->sendText('5562999999999', 'Olá, teste.');
// $whatsapp->sendPdf('5562999999999', '/var/www/minha-app/storage/whatsapp/documento.pdf', 'documento.pdf');
