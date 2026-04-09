# Rechnungsverarbeitung - Sprint 1

Digitalisierung der Eingangsrechnungsbearbeitung mit gRPC und Messaging.

## Bausteine

- **gRPC Service** (Port 50051): Speichert Rechnungsmetadaten
- **RabbitMQ** (Ports 5672, 15672): Message Broker für asynchronen Nachrichtenaustausch  
- **Payment Worker**: Zahlungssystem, verarbeitet Zahlungsaufträge aus RabbitMQ-Queue
- **Client**: Speichert Rechnungsdaten per gRPC und veranlasst Zahlungen per Messaging

## Voraussetzungen

- Node.js 22.x LTS (oder neuer, z.B. 25.x)
- Docker Desktop (RabbitMQ)
- PowerShell / Terminal

## Architektur-Highlights

- **Idempotent Start/Stop**: Start-Server.ps1 erkennt bereits laufende Dienste und startet sie nicht doppelt
- **Fehlertoleranz**: Payment Worker reconnectet mit exponentiellem Backoff bei RabbitMQ-Ausfällen
- **Robustes Shutdown**: Stop-Server.ps1 findet und beendet Prozesse auch bei gestörtem State
- **Zuverlässige Datentypen**: Geldbeträge in Cents (int64) statt Float, keine Rundungsfehler

## Startreihenfolge

### Ein-Kommando-Start
```powershell
.\Start-Server.ps1
```

Oder via npm:
```powershell
npm run start:servers
```

Das Skript startet RabbitMQ, den gRPC-Service und den Payment Worker und gibt direkt aus, welche Dienste laufen, wie sie erreichbar sind und auf welchen Ports sie lauschen.

**Hinweis**: Das Skript ist idempotent - mehrfaches Ausführen startet keine doppelten Prozesse.

Zum Stoppen:
```powershell
.\Stop-Server.ps1
```

**Hinweis**: Stop beendet Prozesse zuverlässig, auch wenn State-Dateien fehlen oder PIDs veraltet sind.

### 1. Message Broker (RabbitMQ)
```powershell
docker start rabbitmq
# oder falls noch nicht gestartet:
# docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

**Prüfen**: http://localhost:15672 (guest/guest)

### 2. gRPC Service starten
```powershell
node grpc-service/server.js
```
**Port**: 50051

### 3. Payment Worker starten  
```powershell
node payment-system/payment-worker.js
```
**wartet auf Nachrichten in Queue `payment_requests`**

### 4. Tests ausführen
```powershell
# Test 1: Rechnungsmetadaten speichern/abrufen
node client/invoice-client.js

# Test 2: Zahlungsauftrag senden  
node client/send-payment.js
```

### 5. Integrationschecks (Happy Path)
```powershell
npm run check:grpc
npm run check:messaging
npm run check:integration
```

## Erwartete Ausgaben

**gRPC Service:**

gRPC Server läuft auf Port 50051
Rechnung gespeichert: { id: '1', supplier_name: 'Muster GmbH', amount_cents: '19999', ... }

**Payment Worker:**

Payment Worker läuft und wartet auf Nachrichten...
Fehler im Payment Worker: Socket closed abruptly during opening handshake
Neuer Verbindungsversuch in 1000ms (Versuch 1)...

(Anfängliche Socket-Fehler sind normal und werden automatisch mit Retry behoben)

Zahlungsauftrag empfangen:
{ invoiceId: '1', supplier: 'Muster GmbH', amount_cents: 19999, amount_eur: '199.99', ... }
Zahlung verarbeitet für Rechnung 1 über 199.99 EUR

**Client (gRPC):**
Speichern erfolgreich: { success: true, id: '1' }
Rechnung geladen: { id: '1', supplier_name: 'Muster GmbH', amount_cents: '19999', amount_eur: '199.99', ... }

**Client (Messaging):**
Zahlungsauftrag gesendet:
{ invoiceId: '1', supplier: 'Muster GmbH', amount_cents: 19999, amount_eur: '199.99', ... }

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `EADDRINUSE: address already in use 127.0.0.1:50051` | `.\.Stop-Server.ps1` ausführen, dann neu starten |
| Payment Worker zeigt mehrere Retry-Fehler | Normal beim Boot, RabbitMQ wird sich verbunden |
| gRPC Parse-Fehler bei alten Clients | `.\.Stop-Server.ps1` ausführen für sauberes Shutdown |
