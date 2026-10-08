# PrivacyGuard

### Catch sensitive information before you share it.

PrivacyGuard scans text and images for personal or confidential details, explains the risks, and
helps you create and verify a safer copy. Deterministic detection runs in the API; optional AI adds
plain-language context but does not decide what is sensitive. Your content is processed in memory,
not stored in a database.

**Scan it. Understand it. Protect it. Check it again.**

## Screenshots

### Landing page
![PrivacyGuard landing page](./docs/screenshots/landing.jpeg)

### Dashboard
![PrivacyGuard dashboard](./docs/screenshots/dashboard.jpeg)

### Text analysis
![Text analysis input page](./docs/screenshots/text-analysis.jpeg)

### Image analysis
![Image analysis input page](./docs/screenshots/image-analysis.jpeg)

### Text results
![Text analysis results](./docs/screenshots/text-result.jpeg)

### Image results
![Image result with no findings](./docs/screenshots/image-result.jpeg)

![Image result with sensitive findings](./docs/screenshots/image-result.png)

### Protected copies
![Protected text copy](./docs/screenshots/protected-copy.jpeg)

![Protected image preview](./docs/screenshots/image-protected.png)

### History
![Session history](./docs/screenshots/history.jpeg)

## Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "20px"}, "flowchart": {"nodeSpacing": 70, "rankSpacing": 85}}}%%
flowchart TB
    USER["User"]
    FE["Frontend<br/>React + TypeScript + Vite"]
    API["Backend API<br/>Express + TypeScript"]

    subgraph MEMORY["In-memory request processing"]
        direction TB
        OCR["Image OCR<br/>Tesseract.js"]
        DETECT["Deterministic detection<br/>10 sensitive-data categories"]
        RISK["Risk scoring<br/>and sharing verdict"]
        PROTECT["Text redaction<br/>and image protection"]
    end

    AI{"Optional AI context"}
    PROVIDER["Featherless API"]

    USER --> FE
    FE -->|"/api"| API
    API --> OCR
    API --> DETECT
    OCR --> DETECT
    DETECT --> RISK
    DETECT --> PROTECT
    DETECT -. "Existing findings only" .-> AI
    AI --> PROVIDER
    PROVIDER -. "Context only" .-> RISK
    PROTECT -->|"Protected copy can be rescanned"| API

    classDef actor fill:#eef2ff,stroke:#6258e8,color:#172033,stroke-width:2px
    classDef service fill:#f5f3ff,stroke:#8177f5,color:#172033,stroke-width:2px
    classDef process fill:#ecfeff,stroke:#35a3b4,color:#172033,stroke-width:2px
    classDef optional fill:#fff7ed,stroke:#ef9a43,color:#172033,stroke-width:2px
    class USER actor
    class FE,API service
    class OCR,DETECT,RISK,PROTECT process
    class AI,PROVIDER optional
```

Requests are processed in memory. The optional AI provider can explain existing detector results;
it cannot add findings or change their locations. If OCR cannot read an image, PrivacyGuard asks
you to review it manually rather than treating it as safe.

## Quickstart

**Requirements:** Node.js 20.11+ and npm.

```bash
git clone https://github.com/Tayyaba-Amin/PrivacyGuard.git
cd PrivacyGuard
npm install
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:4000**. No AI key is required;
deterministic analysis works without one. To enable optional AI explanations, copy `.env.example`
to `.env` and add your `FEATHERLESS_API_KEY`.

```bash
npm test          # backend tests
npm run typecheck # check server and web types
npm run build     # production build
```

## What it does

- Detects emails, phone numbers, payment cards, IP addresses, URLs, API keys, JWTs, private keys,
  credential pairs, and postal addresses.
- Scores risk and gives a clear sharing recommendation.
- Redacts sensitive text and can create a protected image copy; inspect every protected result.
- Rescans protected content. Images that OCR cannot verify require manual review.
- Shows recent scan metadata for the current session only; submitted content is not saved.

## Important

PrivacyGuard is a demo, not a guarantee of safety. Detection and OCR can miss information; review
the original and protected content yourself before sharing. Image redaction uses covered regions
from OCR boxes and does not reconstruct the hidden image. The demo has no authentication or
production-grade deployment hardening.

## Technology

React · TypeScript · Vite · Express · Tesseract.js · Jimp · optional Featherless AI
