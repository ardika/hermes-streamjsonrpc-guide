---
sidebar_position: 1
slug: /
title: Introduction
---

# Hermes IPC Migration Guide

Panduan **step-by-step** untuk memigrasi IPC antar-proses pada **Hermes Network 360 (Avalonia)** dari implementasi Named Pipe + JSON ad-hoc saat ini ke **StreamJsonRpc** dengan transport factory **cross-platform (Windows + macOS)**.

## Audiens

Programmer .NET / C# yang akan mengerjakan migrasi. Anda **tidak** perlu pengalaman sebelumnya dengan StreamJsonRpc atau JSON-RPC 2.0 — semua dijelaskan dari nol.

## Hasil akhir yang ditargetkan

Setelah mengikuti seluruh guide ini, codebase Hermes akan memiliki:

1. **Kontrak IPC bertipe** (`IHermesRpc` C# interface) — bukan lagi `IpcMessageCommand` JSON manual.
2. **Framing length-prefix** otomatis dari StreamJsonRpc — bebas dari bug `ReadLineAsync()` yang truncate payload multi-line.
3. **Request/response correlation** built-in via JSON-RPC id — tidak ada lagi race "client hang menunggu balasan".
4. **Push event** dari service ke UI (`OnSaseStatusChanged`, `OnKcptunLog`) menggantikan polling timer 30 detik.
5. **Transport per-OS**:
   - Windows → Named Pipe (`NamedPipeServerStream` + ACL ketat)
   - macOS / Linux → Unix Domain Socket (`/var/run/hermes.sock`, mode 0600)
6. **Cancellation token end-to-end** untuk graceful shutdown.
7. **Verifikasi peer** (process SID Windows / euid macOS) sebelum menerima command privileged.

## Apa yang TIDAK diubah

- Domain logic di `ServiceXdr`, `ServiceRmm`, `ServiceSase` — tetap utuh.
- Bus internal UI (`MessageBusProvider.IpcMessageBus`) — tetap konsumsi event yang sama.
- Format konfigurasi WireGuard / Kcptun.

Migrasi ini **hanya menyentuh layer transport IPC**, bukan logika bisnis.

## Estimasi waktu

| Tahap | Durasi |
|---|---|
| Step 1–3 (setup contract & transport) | 1 hari |
| Step 4–5 (refactor server & client) | 2 hari |
| Step 6 (event push) | 0.5 hari |
| Step 7 (security hardening) | 1 hari |
| Step 8–9 (testing & rollout) | 1.5 hari |
| **Total** | **~6 hari kerja** |

## Cara membaca guide ini

Baca berurutan. Setiap step membangun di atas step sebelumnya. Step yang independent diberi tag `independent`.

> **Konvensi blok kode:** Snippet yang diawali komentar `// ❌ BEFORE` adalah kode lama yang akan dihapus. `// ✅ AFTER` adalah kode baru. Diff `// 🔄 CHANGED` menunjukkan baris yang berubah saja.

Lanjutkan ke [Current Architecture](./current-architecture) untuk pahami baseline yang akan dimigrasi.
