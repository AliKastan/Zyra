# Zyra — AI App Builder Studio

Zyra takes a plain-English prompt and generates a complete, runnable app — then immediately shows it in a **live, interactive preview panel** inside the builder UI. No manual file opening needed.

This is **v1.1: Live Preview**. The UI works like Lovable or Bolt: type a prompt, watch generation happen, and see the result running inside an iframe — fully clickable, interactive, and testable.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEFAULT_PLANNER_MODEL=claude
DEFAULT_CODER_MODEL=claude
DEFAULT_REVIEW_MODEL=openai
PORT=3001
```

**Model values:** `claude` or `openai`

You only need the key for the providers you actually use. For example, if all three model settings are `claude`, you only need `ANTHROPIC_API_KEY`.

---

## Running Zyra

### Start the backend only

```bash
npm run dev      # development (nodemon, auto-restart)
npm run start    # production
```

### Start backend + serve frontend separately

```bash
npm run all
```

The backend serves the frontend automatically on the same port. Just open:

```
http://localhost:3001
```

---

## Live Preview System

When generation completes, Zyra automatically:

1. **Detects the project type** (static HTML/CSS/JS, React, Next.js, or Node.js)
2. **Starts the preview:**
   - **Static sites** — instantly served at `/preview/{slug}/` via Express static middleware (no extra process)
   - **React / Next.js / Node** — runs `npm install` if needed, spawns the dev server on a free port (3100–3200), polls until ready
3. **Loads the preview in an iframe** inside the right panel of the builder studio UI

### Preview states shown in the UI

| State | Meaning |
|-------|---------|
| Generating | App is being written by the AI |
| Starting preview | Static site served; iframe loading |
| Installing dependencies | Running `npm install` for React/Node apps |
| Starting dev server | Spawning the dev server process |
| Preview ready | Iframe is live and interactive |
| Preview failed | Build error or timeout — Retry button shown |

### Builder studio controls

- **Preview / Code tabs** — switch between live preview and file viewer
- **Desktop / Tablet / Mobile** — resize the iframe with device frames (browser chrome for desktop/tablet, phone frame for mobile)
- **Refresh** — reload the iframe
- **Open in new tab** — open the preview URL directly in the browser
- **History cards** — click any past generation to instantly reload its preview

---

## Using the builder

### Via the dashboard (recommended)

1. Open `http://localhost:3001`
2. Type a prompt (e.g. `Build me a pill reminder app`)
3. Click **Generate** (or press Ctrl+Enter / Cmd+Enter)
4. Watch the stage progress in the left sidebar
5. When complete, the app appears in the live preview panel on the right
6. Switch to the **Code** tab to browse generated files and read their contents
7. Use the device toggle to see how it looks on mobile

### Via curl

```bash
# Start a generation
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Build me a todo app with local storage"}'

# Check job status (replace JOB_ID with the id returned above)
curl http://localhost:3001/api/jobs/JOB_ID

# List all jobs
curl http://localhost:3001/api/jobs

# List all generated projects
curl http://localhost:3001/api/projects
```

---

## API Endpoints

### Generation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status and routing config |
| POST | `/api/generate` | Start a new generation (body: `{ prompt, mode }`) |
| GET | `/api/generate/complexity?prompt=...` | Classify prompt complexity without generating |
| GET | `/api/jobs` | List all jobs (newest first) |
| GET | `/api/jobs/:id` | Get job status and logs |
| POST | `/api/jobs/:id/cancel` | Cancel an active job |
| GET | `/api/projects` | List all generated projects |
| GET | `/api/projects/:name/files` | Get file tree for a project |

### Preview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/preview/start/:slug` | Start (or return existing) preview for a project |
| GET | `/api/preview/status/:slug` | Poll preview readiness |
| DELETE | `/api/preview/stop/:slug` | Stop a running dev server preview |
| GET | `/api/preview/list` | List all active previews |
| GET | `/api/preview/file/:slug/*` | Get file content (for code viewer) |

### Static preview

Generated static apps are served directly at:
```
http://localhost:3001/preview/{slug}/
```

---

## Generated output

Apps are written to:
```
/generated-projects/{project-slug}/
```

Each project gets its own folder. Zyra will overwrite a folder if a project with the same slug is regenerated.

Job metadata and logs are saved to:
```
/storage/jobs/{jobId}.json
```

Project metadata is saved to:
```
/storage/projects/{slug}.json
```

---

## Project structure

```
/zyra
  /src
    /config
      env.js                  # loads and validates .env
    /server
      index.js                # entry point, starts server
      app.js                  # Express app, routes, middleware
    /routes
      healthRoutes.js
      generateRoutes.js
      jobsRoutes.js
      projectsRoutes.js
    /controllers
      generateController.js   # handles POST /api/generate
      jobsController.js       # handles GET /api/jobs
      projectsController.js   # handles GET /api/projects
    /services
      orchestrator.js         # routes tasks to correct model
      generationService.js    # main pipeline coordinator
      plannerService.js       # stage 1: plan the app
      coderService.js         # stage 2: generate all code
      reviewerService.js      # stage 3: quality check
    /providers
      anthropicProvider.js    # Claude API calls
      openaiProvider.js       # OpenAI API calls
    /generators
      projectGenerator.js     # manages output folders
      fileWriter.js           # writes files to disk safely
      promptBuilder.js        # system + user prompts for each stage
    /storage
      jobStore.js             # read/write job JSON files
      projectStore.js         # read/write project metadata
    /utils
      logger.js               # structured console logging
      slugify.js              # converts text to safe slugs
      safeJsonParse.js        # JSON parsing with recovery
      ensureDir.js            # wraps fs-extra.ensureDir
      timestamps.js           # ISO timestamps and elapsed time
  /storage
    /jobs                     # one JSON file per job
    /projects                 # one JSON file per project metadata
  /generated-projects         # actual generated app code lives here
  /frontend
    index.html                # dashboard UI
    style.css
    app.js
  .env.example
  package.json
  README.md
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | if using claude | — | Your Anthropic API key |
| `OPENAI_API_KEY` | if using openai | — | Your OpenAI API key |
| `DEFAULT_PLANNER_MODEL` | no | `claude` | Model for planning stage |
| `DEFAULT_CODER_MODEL` | no | `claude` | Model for code generation |
| `DEFAULT_REVIEW_MODEL` | no | `openai` | Model for review stage |
| `PORT` | no | `3001` | Port for the backend server |

---

## Generation pipeline

```
User prompt
    │
    ▼
[1] Planner   → app summary, architecture, file tree, implementation plan
    │
    ▼
[2] Coder     → full source code for all files (structured JSON)
    │
    ▼
[3] File Writer → writes files to /generated-projects/{slug}/
    │
    ▼
[4] Reviewer  → checks for missing files, empty content, obvious errors
    │
    ▼
Job complete  → metadata saved to /storage/jobs/ and /storage/projects/
```

---

## Project structure (updated)

```
/src
  /services
    previewService.js       # manages preview processes and port allocation
  /controllers
    previewController.js    # handles /api/preview/* routes
  /routes
    previewRoutes.js        # preview API routes
  /utils
    portFinder.js           # finds free ports for dev servers
    projectTypeDetector.js  # detects static/react/nextjs/node from package.json
/frontend
  index.html                # builder studio UI (split layout)
  style.css                 # studio styles (device frames, preview states)
  app.js                    # preview orchestration, device switching, code viewer
```

---

## v1.1 limitations

- Static HTML/CSS/JS preview works instantly and reliably
- React/Next.js/Node preview requires `npm install` on first launch (may take 1–2 minutes)
- Preview processes are in-memory only — they stop when the server restarts
- No database — jobs and projects are stored as JSON files
- One generation at a time (pipeline runs async)
- Generated apps target frontend web apps; backend/API apps preview requires a running Node process
