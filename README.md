# TeamNest.ai

AI-native, WhatsApp-style team communication & research platform. One product, three parts that share a single backend:

- **Backend** — FastAPI + MongoDB (`/app/backend`). Source of truth; every route is prefixed with `/api`.
- **Web** — React (`/app/frontend`).
- **Mobile** — Expo / React Native (`/app/mobile`).

Both clients talk to the same backend over HTTP.

---

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| Yarn | 1.x (classic) |
| MongoDB | 6.0+ (local or Atlas) |
| Expo | via `npx expo` (installed by `yarn`) |

> Use **Yarn** for JS installs (not npm). Mobile uses `yarn expo install` so versions match the Expo SDK.

---

## 2. Clone & configure environment

```bash
git clone https://github.com/funasiadevteam-maker/teamnest.ai.git
cd teamnest.ai
```

Every service reads config from a local `.env`. Real `.env` files are **git-ignored** — copy the templates and fill in your own values:

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
cp mobile/.env.example   mobile/.env
```

### Required environment variables

**`backend/.env`** (minimum to boot):

| Key | What it is |
|-----|------------|
| `MONGO_URL` | Mongo connection string, e.g. `mongodb://localhost:27017` |
| `DB_NAME` | Database name, e.g. `teamnest` |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:3000` |
| `JWT_SECRET` | Long random string for signing sessions |
| `EMERGENT_LLM_KEY` | Universal LLM key (or set provider keys directly) |
| `PUBLIC_BACKEND_URL` | Public base URL used in emails/links, e.g. `http://localhost:3000` |

Optional/feature keys (payments, calls, email, connectors, IAP, etc.) are all listed in `backend/.env.example` — fill in only the ones you need.

**`frontend/.env`**:

| Key | What it is |
|-----|------------|
| `REACT_APP_BACKEND_URL` | Base URL of the backend, e.g. `http://localhost:8001` |

**`mobile/.env`**:

| Key | What it is |
|-----|------------|
| `EXPO_PUBLIC_BACKEND_URL` | Base URL of the backend, e.g. `http://localhost:8001` |

> The web client calls `${REACT_APP_BACKEND_URL}/api/...`; the mobile client calls `${EXPO_PUBLIC_BACKEND_URL}/api/...`. Never hardcode URLs — always read from `.env`.

---

## 3. Run the backend (FastAPI, port 8001)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # optional but recommended
pip install -r requirements.txt
# make sure MongoDB is running (e.g. `mongod --dbpath /data/db`)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

- API is served at `http://localhost:8001/api/...`
- Quick check: `curl http://localhost:8001/api/` → `200`

### Seed demo data (optional)

```bash
cd backend
python seed.py
```

Demo accounts are created with the password from `DEMO_PASSWORD` (see `backend/.env`; the code default is a generic placeholder).

---

## 4. Run the web app (React, port 3000)

```bash
cd frontend
yarn install
yarn start
```

Open `http://localhost:3000`. It calls the API at `REACT_APP_BACKEND_URL`.

---

## 5. Run the mobile app (Expo)

```bash
cd mobile
yarn install
yarn expo start
```

- Press `w` for the web preview, or scan the QR with **Expo Go** on a device.
- **Native-only features** (LiveKit audio/video calls, RevenueCat in-app purchases, push notifications) do **not** work in Expo Go or the web preview — they require a native build.

---

## 6. Running tests

Backend tests (pytest) hit a running API, so set the URLs plus the test credentials (kept in your git-ignored `backend/.env`):

```bash
cd backend
export REACT_APP_BACKEND_URL=http://localhost:8001
export EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
# These are read from backend/.env automatically by tests/conftest.py:
#   SUPERADMIN_TEST_PASSWORD, DEMO_PASSWORD, TEST_PASSWORD, RADCITI_TEST_PASSWORD, RC_WEBHOOK_AUTH
python -m pytest tests/ -q
```

Collect-only (no network) to verify everything imports:

```bash
python -m pytest tests/ --collect-only -q
```

---

## 7. Project structure

```
teamnest.ai/
├── backend/            # FastAPI + MongoDB (shared API, /api/*)
│   ├── server.py       # app entrypoint (uvicorn server:app)
│   ├── routes/         # feature routers
│   ├── services/       # business logic
│   ├── tests/          # pytest suite
│   ├── seed.py         # demo data seeder
│   ├── requirements.txt
│   └── .env.example
├── frontend/           # React web app
│   ├── src/
│   └── .env.example
├── mobile/             # Expo / React Native app
│   ├── app/            # expo-router file-based routes
│   └── .env.example
└── README.md
```

---

## 8. Development workflow & branch strategy

We use **GitHub Flow** (trunk-based, short-lived branches) — simple and ideal for several developers working in parallel with CI.

- **`main`** is always deployable and **protected** (no direct pushes; PRs only; CI must pass).
- Create a short-lived branch off `main` per unit of work:
  - `feat/<short-desc>` — new feature
  - `fix/<short-desc>` — bug fix
  - `chore/<short-desc>` — tooling/docs/refactor
- Open a **Pull Request** into `main` → require review + green CI → **squash & merge**. Delete the branch after merge.
- Tag releases (`v1.2.0`) on `main`; **CD is manual** for now (deploy from a tag/`main`).

Recommended GitHub settings:
- Branch protection on `main`: require PR, require status checks (CI), require ≥1 review, no force-push.
- Add a `CODEOWNERS` file to auto-request reviewers.
- Store all secrets in **GitHub → Settings → Secrets and variables → Actions** (mirror the keys in the `.env.example` files). CI reads them from the environment — never commit real `.env` files.

> Prefer a staging gate? Add a long-lived `develop` branch (feature branches → `develop` → `main` for releases). For a CI-first setup with manual CD, plain GitHub Flow above is the leaner choice.

---

## 9. Security notes

- Real `.env` files are git-ignored; only `*.env.example` templates are committed.
- No secrets, API keys, or credentials live in the codebase — inject them via `.env` locally and via GitHub Secrets in CI.
- `test_reports/` (internal QA artifacts) is git-ignored.
