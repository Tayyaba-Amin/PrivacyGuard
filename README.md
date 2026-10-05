# PrivacyGuard

PrivacyGuard is a privacy-focused application that detects sensitive information in text and images,
evaluates the risk of sharing it, protects it by redacting the detected content, and rescans the
protected result to confirm it is safe to share.

It is built around a deterministic, pattern-based detection engine, with an optional AI layer that
explains each finding in plain language. There is no database: content is processed in memory for the
length of a request and then discarded.

## Features

| Feature                  | What it does                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Text analysis            | Paste text and run the full flow: detect, score, recommend action, protect, verify.        |
| Image analysis with OCR  | Upload a PNG, JPEG or WebP image (up to 10 MB) and extract its text with OCR.              |
| Sensitive-data detection | Ten categories, with the exact location of every match.                                    |
| Risk scoring and verdict | A deterministic 0–100 score, a level, a sharing verdict and a per-finding breakdown.       |
| AI contextual analysis   | Optional. Explains what each finding means _in this content_ and what to do about it.      |
| Text protection          | Replaces each detected span with a category-specific token such as `[REDACTED_EMAIL]`.     |
| Image guidance           | Shows plain-language guidance for manually removing or obscuring detected sensitive areas. |
| Rescan after protection  | Re-analyzes the protected text or image to check that nothing recognisable remains.        |
| Final verdict            | A post-protection safe-to-share verdict backed by the rescan.                              |
| Light/dark theme         | Follows the system preference on first visit, remembers a manual choice.                   |

**Detected categories:** email addresses, phone numbers, credit cards, IP addresses, URLs, API keys,
JWTs, private keys, credential pairs (username + password) and postal addresses.

The AI layer can only add context to findings the detector already produced. It can never add a
finding or change a location.

## How It Works

### Text workflow

```
Analyze → understand risks → create protected copy → copy/share protected text → rescan → final safety check
```

### Image workflow

```
Upload → analyze → understand detected sensitive areas → manually crop/blur/remove sensitive information → upload edited image again → rescan → final safety check
```

Deterministic detection is the primary detection layer and always runs first. The AI step is
optional: it runs on top of the detected findings and its failure never removes a finding.

## User Flow

### 1. Analyze content

Paste text or upload an image, then click **Analyze for Privacy Risks**.

### 2. Review the result

PrivacyGuard shows a simple result card:

- **Safe to Share** — no sensitive information was found.
- **Not Safe to Share** — sensitive items were detected, along with a risk score.

Below the result, you will see **What we found** with a short explanation and recommended action
for each detected item.

### 3. Recommended action

The result card includes a **What to do** section in plain language:

- **Safe content:** No sensitive information was detected. You can share it, but review it
  once before sending.
- **Low/Medium risk:** Review the detected information before sharing. Create a protected copy
  if needed.
- **High/Critical risk:** Do not share the original. Create a protected copy or manually remove
  the sensitive information. Rescan before sharing.

### 4. Create a protected copy (text only)

For text, click **Create Protected Copy**. PrivacyGuard replaces each detected span with a
safe placeholder such as `[REDACTED_EMAIL]`.

The protected text is shown on the page and can be copied with one click.

### 5. Review the protected copy

Check the protected text. For images, manually edit/crop/blur the image according to the
guidance.

### 6. Check protected copy

Click **Scan Protected Copy** to rescan the protected content.

### 7. Final safety check

- **Safe to Share** — no sensitive information remains. You can share the protected copy.
- **Still Needs Attention** — sensitive items remain. Protect the remaining information and
  scan again.

## Text protection

PrivacyGuard replaces detected spans with category-specific tokens:

| Category       | Token                    |
| -------------- | ------------------------ |
| Email address  | `[REDACTED_EMAIL]`       |
| Phone number   | `[REDACTED_PHONE]`       |
| Credit card    | `[REDACTED_CREDIT_CARD]` |
| IP address     | `[REDACTED_IP]`          |
| URL            | `[REDACTED_URL]`         |
| API key        | `[REDACTED_API_KEY]`     |
| JWT            | `[REDACTED_JWT]`         |
| Private key    | `[REDACTED_PRIVATE_KEY]` |
| Credentials    | `[REDACTED_CREDENTIALS]` |
| Postal address | `[REDACTED_ADDRESS]`     |

## Image guidance notes

For images, PrivacyGuard detects sensitive information and provides plain-language guidance on
how to remove or obscure it before sharing.

PrivacyGuard does not currently provide a user-ready protected/redacted image for sharing.

Recommended practice for sharing images containing sensitive information:

1. Do not share the original image.
2. Edit the image to remove or hide the sensitive information (crop, blur, cover, or recreate
   without sensitive details).
3. Run the edited image through PrivacyGuard again before sharing.

## Tech Stack

| Layer            | Technology                                                                              |
| ---------------- | --------------------------------------------------------------------------------------- |
| Frontend         | React 18, TypeScript, Vite 6                                                            |
| Backend          | Node.js (>= 20.11), TypeScript, Express 4                                               |
| OCR              | Tesseract.js 7 (WASM, `eng` language pack)                                              |
| Image processing | Jimp (pure JS, no native dependencies)                                                  |
| AI provider      | Featherless AI, via the OpenAI-compatible `/v1/chat/completions` endpoint using `fetch` |
| Tests            | Node's built-in test runner (`node:test`) with `tsx`                                    |
| Language         | TypeScript across both apps; no runtime framework dependency on the frontend            |

The Featherless API is OpenAI-compatible, so it is called with plain `fetch` rather than the OpenAI
SDK. No Anthropic or OpenAI SDK is used anywhere in this project.

## Project Structure

```
apps/
  web/                     Frontend (React + TypeScript + Vite)
    src/App.tsx            View state: dashboard, text, image
    src/components/        Dashboard, header, footer, stage panels, risk and verdict panels
    src/lib/               API client, display mapping, masking, theme
  server/                  Backend API (Express, TypeScript, ESM)
    src/detection/         Deterministic detectors, overlap policy, validators
    src/ai/                Optional contextual analysis and the Featherless client
    src/risk/              Deterministic risk scoring
    src/protection/        Text redaction tokens and redaction logic
    src/image/             OCR and image redaction
    src/routes/            analyze, protect and rescan endpoints for text and images
    src/config/env.ts      Environment loading and validation
```

## Getting Started

### 1. Prerequisites

- Node.js >= 20.11
- npm (comes with Node)

### 2. Install dependencies

```bash
npm install
```

The repository is an npm workspace, so this installs the root, `apps/web` and `apps/server`
dependencies at once.

### 3. Environment variables

Copy the example file and fill in what you need:

```bash
cp .env.example .env      # macOS / Linux
copy .env.example .env    # Windows
```

`.env` is git-ignored and must never be committed. Only `.env.example` is tracked.

```dotenv
FEATHERLESS_API_KEY=your_api_key_here
FEATHERLESS_MODEL=Qwen/Qwen3-8B
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
```

Everything in `.env` is read by the backend only. Values prefixed with `VITE_` are inlined into the
browser bundle and are public, so never put a secret in one.

### 4. Configure Featherless AI (optional)

1. Create an account and API key at [featherless.ai](https://featherless.ai).
2. Put the key in `.env` as `FEATHERLESS_API_KEY`.
3. Set `FEATHERLESS_MODEL` to a model your account can run.

Without a key the application still works: every finding is returned by the deterministic engine and
the response reports `aiStatus: "unavailable"`.

### 5. Run the application

```bash
npm run dev
```

This starts the API on `http://127.0.0.1:4000` and the UI on `http://localhost:5173`. The Vite dev
server proxies `/api` to the backend. If your backend runs elsewhere, set `VITE_API_ORIGIN`.

Other scripts:

| Command                                  | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                            | Run API and UI together (development)                |
| `npm run dev:server` / `npm run dev:web` | Run one side only                                    |
| `npm run build`                          | Typecheck and build both apps                        |
| `npm run typecheck`                      | Typecheck both apps                                  |
| `npm test`                               | Run the backend test suite                           |
| `npm start`                              | Run the built API server (run `npm run build` first) |

The backend does not serve the frontend build, so use `npm run dev:web` (or any static server) to
view a production build locally.

Check the API is up with `GET /api/health`.

## AI Configuration

AI is optional. PrivacyGuard performs full deterministic detection, risk scoring and redaction with
no AI key at all, and the response reports `aiStatus: "unavailable"` when the contextual layer did
not run. When a key is configured, Featherless AI is used for contextual analysis only.

The Featherless settings can be tuned in `.env`:

| Variable                        | Default                         | Meaning                                           |
| ------------------------------- | ------------------------------- | ------------------------------------------------- |
| `FEATHERLESS_API_KEY`           | empty                           | Provider key. Missing key means no AI layer.      |
| `FEATHERLESS_MODEL`             | `Qwen/Qwen3-8B`                 | Model id on Featherless                           |
| `FEATHERLESS_BASE_URL`          | `https://api.featherless.ai/v1` | OpenAI-compatible base URL                        |
| `FEATHERLESS_TIMEOUT_MS`        | `15000`                         | Hard ceiling for the AI stage of one request      |
| `FEATHERLESS_MAX_CONTEXT_CHARS` | `4000`                          | Maximum user text sent per prompt                 |
| `FEATHERLESS_MAX_TOKENS`        | `1200`                          | Maximum reply size                                |
| `AI_ENABLED`                    | `true`                          | Set to `false` to switch the contextual layer off |
| `MAX_TEXT_CHARS`                | `20000`                         | Maximum text accepted per request                 |
| `PORT` / `HOST`                 | `4000` / `127.0.0.1`            | API bind address                                  |
| `CORS_ORIGINS`                  | `http://localhost:5173`         | Comma-separated allowed browser origins           |

Defaults are the values in `apps/server/src/config/env.ts`. Keep the key in `.env`: it is git-ignored,
it is read by the backend only, and it must never be committed.

## Testing

```bash
npm test          # backend tests
npm run typecheck # typecheck both apps
```

The backend suite uses Node's built-in test runner and covers:

- detection (categories, validators, overlap policy) in `detection/detect.test.ts`
- risk scoring in `risk/score.test.ts`
- text redaction and tokens in `protection/redact.test.ts`
- AI context building and the Featherless client in `ai/contextual.test.ts` and `ai/featherless.test.ts`
- the analyze, protect and rescan routes for both text and images, including AI failure and degradation
  paths, in `routes/*.test.ts`

The frontend has no test suite; it is verified with typechecking and a production build.

## Privacy and Security

- User content is processed for analysis and protection. Nothing is written to a database, and content
  is not intentionally persisted beyond the lifetime of the request.
- Findings include the exact matched span so protection can be applied, but response metadata
  (counts, categories, engine, OCR statistics) contains no sensitive values, and the UI masks values
  when displaying them.
- API keys are read from environment variables on the server only. They are never logged and never
  sent to the browser.
- Request limits are enforced: 20,000 characters of text, 10 MB per image, 15 MB JSON bodies.
- CORS is restricted to the origins in `CORS_ORIGINS`.

This is a hackathon/demo application. It does not currently include authentication, rate limiting,
TLS termination, or production-grade hardening, so it should not be deployed publicly as-is.

## Limitations

- OCR currently focuses on English only.
- AI context requires a configured Featherless API key. Without it, or if the provider times out or
  errors, the application falls back to deterministic analysis and reports the AI status honestly.
- Detection is pattern-based, so unusual formatting can slip through. Review content yourself.
- The AI layer enriches existing findings; it cannot detect anything new.
- Image protection covers regions with solid boxes using OCR word boxes. It does not reconstruct or
  inpaint what was underneath.
- No persistent storage, no authentication and no rate limiting.
- The initial risk score is an assessment of the content _before_ redaction; the final verdict comes
  from the rescan of the protected content.
- PrivacyGuard does not currently provide a user-ready protected/redacted image for sharing. Image
  analysis guides the user on how to manually remove or obscure sensitive information.

## Example

The following illustrates the flow using the real category and token names. It is not a transcript of
a live API call.

Input:

```text
Contact me at alice@example.com or 0300-1234567.
```

Result:

- **Not Safe to Share** — 2 sensitive items found.
- **What to do:** Review the detected information before sharing. We recommend protecting the content first.

Detected categories:

- Email address — Medium
- Phone number — Medium

Protected output (text redaction):

```text
Contact me at [REDACTED_EMAIL] or [REDACTED_PHONE].
```

Other tokens follow the same pattern, for example `[REDACTED_API_KEY]`, `[REDACTED_CREDIT_CARD]` and
`[REDACTED_CREDENTIALS]`.

## Demo Flow

For a quick demonstration:

1. Open PrivacyGuard (the dashboard loads first).
2. Choose **Text Analysis**.
3. Paste a sample containing sensitive data, for example
   `Contact me at alice@example.com or 0300-1234567. My API key is [YOUR_API_KEY].`
4. Click **Analyze for Privacy Risks**.
5. Review the result card and the **What to do** guidance.
6. Click **Create Protected Copy** to produce the redacted text.
7. Review the protected copy and click **Copy Protected Text** if you need it.
8. Click **Scan Protected Copy** to verify the protected text.
9. Show the final safe-to-share verdict.
10. Optionally repeat with **Image Analysis** using a screenshot containing an email or phone number to
    demonstrate OCR and image guidance.

Use the header navigation (`Home`, `Text`, `Image`) and the theme toggle to move between views.

## Important Notes

- Detection, risk scoring and redaction are deterministic and run entirely on the server.
- The AI layer is optional and advisory: it explains findings, it does not decide them.
- Nothing sensitive is written to disk, and no key ever reaches the browser.
- Keep `.env` local. Only `.env.example` belongs in Git.
- PrivacyGuard does not currently provide a user-ready protected/redacted image for sharing. Image
  results guide the user on how to safely modify the image instead.
