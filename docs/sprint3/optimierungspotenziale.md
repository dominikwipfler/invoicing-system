# Sprint 3 - Identifizierte Optimierungen

## Ausgangslage aus Sprint 2

Aus den Event-Logs wurden folgende Schwachstellen sichtbar:

- Lange Liegezeiten zwischen `Invoice Retrieved` und `Payment Initiated`
- Wiederholte Bearbeitung bei doppelten Rechnungen
- Asynchrone Zahlungen ohne klaren End-to-End-Status je Vorgang

## Soll-Optimierungen

### 1. Workflow-Orchestrierung einfuehren

- Ein zentraler Workflow-Status je Rechnung ersetzt lose Schrittketten.
- Freigaben, Zahlungen und Abschluss werden zustandsbasiert gesteuert.

### 2. Expliziter Freigabeschritt vor Zahlung

- Der Schritt `PENDING_APPROVAL` bildet die fachliche Kontrolle sauber ab.
- Nur genehmigte Rechnungen duerfen in den Zahlungsprozess.

### 3. Technisches Status-Feedback aus dem Zahlungssystem

- Payment Worker publiziert Status-Events (`PAYMENT_FAILED`, `PAYMENT_PROCESSED`).
- Workflow-Engine uebernimmt diese Events und aktualisiert den Prozesszustand.

### 4. Bessere Transparenz fuer Process Mining

- Workflow-Engine schreibt eigene Events in `workflow-engine/event-log.csv`.
- End-to-End-Pfade sind dadurch klarer in Celonis interpretierbar.

## Erwarteter Nutzen

- Weniger Medienbrueche zwischen Fachprozess und Technik
- Schnellere Erkennung von haengenden Faellen
- Bessere Grundlage fuer SLA-Monitoring
- Klare Verantwortung je Prozessschritt (Sachbearbeitung, Workflow, Payment)
