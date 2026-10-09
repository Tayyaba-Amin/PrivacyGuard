<div align="center">

# PrivacyGuard

### Know what you’re sharing. Keep sensitive information private.

Scan text and images before they leave your hands. PrivacyGuard finds sensitive details, explains
the risks, helps protect what it can, and lets you check the result again.

<p>
  <a href="https://react.dev/"><img alt="React 18" src="https://img.shields.io/badge/React-18-20232a?logo=react&logoColor=61DAFB"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-20232a?logo=typescript&logoColor=3178C6"></a>
  <a href="https://vite.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-6-20232a?logo=vite&logoColor=646CFF"></a>
  <a href="https://expressjs.com/"><img alt="Express" src="https://img.shields.io/badge/Express-4-20232a?logo=express&logoColor=ffffff"></a>
  <a href="https://github.com/naptha/tesseract.js"><img alt="Tesseract.js" src="https://img.shields.io/badge/OCR-Tesseract.js-20232a"></a>
  <a href="https://www.npmjs.com/package/jimp"><img alt="Jimp" src="https://img.shields.io/badge/Images-Jimp-20232a"></a>
  <a href="https://nodejs.org/"><img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-20232a?logo=nodedotjs&logoColor=5FA04E"></a>
</p>

[Quickstart](#quickstart) · [Architecture](#architecture) · [Screenshots](#screenshots)

</div>

## The problem

Everyday messages, support tickets, screenshots, and configuration snippets can quietly expose
email addresses, phone numbers, credentials, API keys, or other private details. It is easy to
miss them before clicking **Send**—and image text is especially easy to overlook.

**PrivacyGuard is a last check before sharing:** deterministic detection highlights what may be
sensitive, risk guidance explains why it matters, and protection tools help you make a safer copy.
Optional AI adds context to existing findings; it does not decide what the detector finds.

## What you can do

- **Scan text and images** for emails, phone numbers, payment cards, IP addresses, URLs, keys,
  tokens, credentials, and postal addresses.
- **Understand the risk** with a score, a clear verdict, and practical guidance.
- **Protect and verify:** redact text or cover detected image regions, then rescan the result.
- **Keep content private:** requests are processed in memory and are not saved to a database.

> OCR can miss text, and pattern-based detection is not perfect. Review the original and every
> protected result yourself before sharing. An image OCR cannot read is marked for manual review,
> not assumed safe.

## Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {"background": "#0d1117", "primaryColor": "#24282d", "primaryTextColor": "#f0f0f0", "primaryBorderColor": "#92979d", "lineColor": "#92979d", "secondaryColor": "#1b1f24", "tertiaryColor": "#15191e", "clusterBkg": "#15191e", "clusterBorder": "#777c82", "fontFamily": "Arial, sans-serif", "fontSize": "18px"}, "flowchart": {"nodeSpacing": 70, "rankSpacing": 78, "curve": "linear"}}}%%
flowchart TB
    USER["User"]
    FE["Frontend<br/>React 18 + TypeScript + Vite"]
    API["Backend API<br/>Node.js + Express"]

    subgraph PIPELINE["In-memory request processing"]
        direction TB
        OCR["Image OCR<br/>Tesseract.js"]
        DETECT["Deterministic detection<br/>Sensitive-data patterns"]
        RISK["Risk scoring<br/>and sharing verdict"]
        PROTECT["Text redaction<br/>and image protection"]
    end

    AI{"Optional AI context"}
    PROVIDER["Featherless API"]

    USER -->|"Browser"| FE
    FE -->|"/api over HTTP"| API
    API -->|"Image requests"| OCR
    OCR -->|"Extracted text"| DETECT
    API -->|"Text requests"| DETECT
    DETECT --> RISK
    DETECT --> PROTECT
    DETECT -. "Existing findings only" .-> AI
    AI --> PROVIDER
    PROVIDER -. "Context only" .-> RISK
    PROTECT -->|"Protected copy can be rescanned"| API

    classDef node fill:#24282d,stroke:#92979d,color:#f0f0f0,stroke-width:2px
    classDef subnode fill:#1b1f24,stroke:#858a90,color:#f0f0f0,stroke-width:2px
    class USER,FE,API,AI,PROVIDER node
    class OCR,DETECT,RISK,PROTECT subnode
    style PIPELINE fill:#15191e,stroke:#777c82,stroke-width:2px,color:#f0f0f0
    linkStyle default stroke:#92979d,stroke-width:2px,color:#d8dadd
```

The API has no database: submitted content is handled in memory. The optional AI provider can
explain existing detector findings, but cannot add findings or change their locations.

## Quickstart

**You’ll need:** Node.js 20.11+ and npm.

```bash
git clone https://github.com/Tayyaba-Amin/PrivacyGuard.git
cd PrivacyGuard
npm install
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:4000**. No API key is needed
for scanning; deterministic analysis works without the optional AI context provider.

<details>
<summary>Enable optional AI explanations</summary>

Copy `.env.example` to `.env`, then add your `FEATHERLESS_API_KEY`. Keep `.env` private and never
commit it.

</details>

<details>
<summary>More commands</summary>

```bash
npm test          # backend tests
npm run typecheck # check server and web types
npm run build     # production build
```

</details>

## Screenshots

<details>
<summary>Explore the app screens</summary>

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

</details>

## Privacy and limitations

PrivacyGuard is a demo, not a guarantee of safety. Image protection covers detected OCR regions;
it does not reconstruct what was underneath. The application has no authentication or
production-grade deployment hardening, so do not deploy it publicly as-is.
