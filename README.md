# Rechnungsverarbeitung - Sprint 1

Digitalisierung der Eingangsrechnungsbearbeitung mit gRPC und Messaging.

## Bausteine

- **gRPC Service** (Port 50051): Speichert Rechnungsmetadaten
- **RabbitMQ** (Ports 5672, 15672): Message Broker für asynchronen Nachrichtenaustausch  
- **Payment Worker**: Zahlungssystem, verarbeitet Zahlungsaufträge aus RabbitMQ-Queue
- **Client**: Speichert Rechnungsdaten per gRPC und veranlasst Zahlungen per Messaging

## Voraussetzungen

- Node.js 22.x LTS
- Docker Desktop (RabbitMQ)
- PowerShell / Terminal

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

Zum Stoppen:
```powershell
.\Stop-Server.ps1
```

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
Zahlungsauftrag empfangen:
{ invoiceId: '1', supplier: 'Muster GmbH', amount_cents: 19999, ... }
Verarbeite Zahlung für Rechnung 1 über 199.99 EUR

**Client (gRPC):**
Speichern erfolgreich: { success: true, id: '1' }
Rechnung geladen: { id: '1', supplier_name: 'Muster GmbH', amount_cents: '19999', ... }

**Client (Messaging):**
Zahlungsauftrag gesendet:
{ invoiceId: '1', supplier: 'Muster GmbH', amount_cents: 19999, ... }
