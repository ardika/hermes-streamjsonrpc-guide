# Hermes IPC Migration Guide — StreamJsonRpc over per-OS Transport

Step-by-step migration guide untuk memindahkan IPC Hermes Network 360 (UI Avalonia ↔ HermesServiceEngine helper) dari custom Named Pipe + `ReadLineAsync`/JSON ke **StreamJsonRpc** dengan transport factory cross-platform (Windows Named Pipe + Unix Domain Socket di macOS/Linux).

📖 **Baca dokumentasi:** https://ardika.github.io/hermes-streamjsonrpc-guide/

## Apa yang dibahas

- Analisis IPC saat ini di codebase Hermes
- Justifikasi pindah ke StreamJsonRpc
- Desain transport factory per-OS
- Migrasi bertahap dengan diff per file (client & server)
- Push event dari service ke UI (hilangkan polling)
- Hardening keamanan: ACL pipe, peer credential check, code signature verify
- Strategi testing + rollout

## Local development

```bash
npm install
npm start
```

Site dibuild & deploy otomatis ke GitHub Pages via `.github/workflows/deploy.yml` saat push ke `main`.

## License

MIT
