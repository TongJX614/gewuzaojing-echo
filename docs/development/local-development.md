# Local development

Requirements: Node.js 24, pnpm 9 or newer, Python 3.11.

```powershell
pnpm setup
Copy-Item .env.example .env
pnpm dev
```

Echo listens on `127.0.0.1:5000`; QuillForge listens on `127.0.0.1:8050`. `pnpm dev` validates one absolute `GEWUZAOJING_ENV_FILE` before startup, reports a conflicting PID/command and never terminates an unknown listener.

Set `ECHO_LLM_SOURCE=shared` and `QUILLFORGE_LLM_SOURCE=shared` to reuse `SHARED_LLM_PROVIDER/API_KEY/BASE_URL`. Set either source to `dedicated` and provide that application's complete provider/API-key/base-URL triplet to separate the connections.

```powershell
pnpm test
```

Tests use safe temporary configuration and do not call real LLM, image or TTS providers.
