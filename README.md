Invoicing System - Sprint 1
Digitale Rechnungsverarbeitung - Bausteine und Integrationsarchitektur

Dieses Projekt implementiert die ersten Bausteine für die Digitalisierung der Eingangsrechnungsverarbeitung gemäß der Aufgabenstellung Prof. Dr. Andreas Heberle (SS26).

Features
gRPC-Service zum Speichern von Rechnungsmetadaten (Port 50051)

Message Broker (RabbitMQ) für asynchronen Nachrichtenaustausch (Port 5672)

Zahlungssystem verarbeitet Zahlungsaufträge über Messaging (Queue payment_requests)

CLI-Client speichert Rechnungsdaten und veranlasst Zahlungen

Systemarchitektur
text
┌─────────────────┐       gRPC        ┌──────────────────┐
│   CLI-Client    │ ─────────────────▶ │ gRPC-Service     │
│                 │                    │ (Metadaten)      │
└─────────────────┘                    └──────────────────┘
         │                                       
         │  Messaging (RabbitMQ)               
         ▼                                       
┌─────────────────┐       Queue        ┌──────────────────┐
│   CLI-Client    │ ─────────────────▶ │ Zahlungssystem   │
│ (Zahlungsauftrag)│  payment_requests  │ (Payment Worker) │
└─────────────────┘                    └──────────────────┘
Voraussetzungen
Node.js 18+ (node -v)

Docker Desktop (für RabbitMQ)

Git

Installation
bash
git clone https://github.com/DEIN-USERNAME/invoicing-system.git
cd invoicing-system
npm install
Startreihenfolge
1. Message Broker starten (RabbitMQ)
powershell
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
Management UI: http://localhost:15672 (guest/guest)

2. gRPC-Service starten
powershell
node grpc-service/server.js
Port: 50051

3. Zahlungssystem starten (Payment Worker)
powershell
node payment-system/payment-worker.js
4. Tests ausführen
powershell
# Test 1: Rechnungsmetadaten speichern/abrufen
node client/invoice-client.js

# Test 2: Zahlungsauftrag senden
node client/send-payment.js
Erwartete Ausgaben
gRPC-Service
text
gRPC Server läuft auf Port 50051
Rechnung gespeichert: { id: '1', supplier_name: 'Muster GmbH', ... }
Payment Worker
text
Payment Worker läuft und wartet auf Nachrichten...
Zahlungsauftrag empfangen:
{ invoiceId: '1', supplier: 'Muster GmbH', amount: 199.99, ... }
Verarbeite Zahlung für Rechnung 1 über 199.99 EUR
Client (gRPC)
text
Speichern erfolgreich: { success: true, id: '1', error: '' }
Rechnung geladen: { id: '1', supplier_name: 'Muster GmbH', ... }
Client (Messaging)
text
Zahlungsauftrag gesendet:
{ invoiceId: '1', supplier: 'Muster GmbH', amount: 199.99, ... }
Sprint 1 Status
Komponente	Status	Beschreibung
gRPC-Service	✅	Speichert Rechnungsmetadaten (ID, Lieferant, Betrag, Datum)
Message Broker	✅	RabbitMQ mit Management UI
Zahlungssystem	✅	Verarbeitet Zahlungsaufträge aus Queue payment_requests
Client	✅	Speichert Metadaten + veranlasst Zahlungen
Abgabefrist: 14. April 2026, 13:00 Uhr (ILIAS)

Ports Übersicht
Service	Port	Zweck
gRPC-Service	50051	Rechnungsmetadaten
RabbitMQ AMQP	5672	Messaging
RabbitMQ Management	15672	Web-UI
Troubleshooting
Docker-Fehler: docker start rabbitmq oder Container neu erstellen

text
docker rm -f rabbitmq
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
gRPC-Verbindung fehlgeschlagen: gRPC-Service muss vor Client laufen
RabbitMQ-Verbindung fehlgeschlagen: RabbitMQ-Container prüfen (docker ps)

Nächste Schritte (Sprint 2+)
Process Mining mit Celonis

BPMN-Modellierung des Soll-Prozesses

Workflow-Engine Implementierung

RPA-Bot für ERP-Eingabe

AI Agent für PDF-Extraktion

Projekt für den Kurs "Digitalisierung eines Geschäftsprozesses" - Prof. Dr. Andreas Heberle SS26
