---
sidebar_position: 3
title: Why StreamJsonRpc
---

# Why StreamJsonRpc

[StreamJsonRpc](https://github.com/microsoft/vs-streamjsonrpc) adalah library Microsoft yang implementasi **JSON-RPC 2.0** di atas `System.IO.Stream` apa pun. Library ini dipakai di **Visual Studio**, **Roslyn LSP**, **VS Code .NET extension**.

## Mapping masalah → solusi

| Masalah saat ini | Solusi StreamJsonRpc |
|---|---|
| ACL `WorldSid` (rawan privilege escalation) | Tetap di-fix manual via `PipeSecurity`, tapi setelah migrasi kita punya satu titik untuk hardening |
| Framing newline rapuh | `HeaderDelimitedMessageHandler` (length-prefix `Content-Length: N\r\n\r\n`) atau `LengthHeaderMessageHandler` — bebas truncate |
| Single-message pipe | Long-lived connection; server menerima banyak request paralel, lengkap dengan ordering per-connection |
| Dua pipe (command vs reply) | Satu duplex stream. Request/response otomatis matched via `id` field |
| Boilerplate switch dispatcher | Decorate method dengan `[JsonRpcMethod]`, library yang dispatch ke method C# |
| Tidak ada cancellation | `CancellationToken` parameter diserialisasi otomatis ke notification `$/cancelRequest` |
| Polling status | Server kirim **notification** (one-way) ke client — `connection.NotifyAsync("OnSaseStatus", payload)` |
| Logging secret tanpa filter | Trace listener custom + redaction di satu titik |

## Cross-platform free

StreamJsonRpc agnostic terhadap transport — ia hanya butuh **dua `Stream`** (in + out) atau satu `Stream` duplex. Berarti:

- Windows: bungkus `NamedPipeServerStream` / `NamedPipeClientStream`.
- macOS/Linux: bungkus `NetworkStream` dari `Socket(AddressFamily.Unix, SocketType.Stream, ...)` ke Unix Domain Socket.

**Kontrak (interface C#) identik**, hanya factory transport yang OS-specific. Avalonia UI Hermes sudah cross-platform; helper sisi macOS bisa diimplementasi nanti tanpa ubah kontrak.

## Performance & maturity

- Dipakai produksi di IDE-class software (Visual Studio).
- Overhead: JSON-RPC ~3-5% lebih lambat dari MessagePack, tapi tetap << network I/O cost untuk IPC desktop.
- Throughput cukup tinggi untuk use case Hermes (perintah lifecycle, log streaming).

## Lisensi

MIT License — kompatibel dengan project komersial.

## Alternatif yang dipertimbangkan dan ditolak

| Alternatif | Kenapa ditolak |
|---|---|
| gRPC over UDS | Butuh `.proto` + tooling; migrasi lebih invasif. Bisa jadi step selanjutnya. |
| WCF (CoreWCF.NetNamedPipe) | Tidak ada native UDS binding cross-platform. |
| SignalR | Overkill untuk command/response IPC privileged 1-to-1. |
| Localhost TCP + token | Butuh auth manual + rawan port conflict & firewall popup. |
| Rebuild dengan Sockets manual | Sama saja menulis ulang StreamJsonRpc lebih buruk. |

## Package NuGet yang akan kita pakai

```xml
<PackageReference Include="StreamJsonRpc" Version="2.19.27" />
<PackageReference Include="Nerdbank.Streams" Version="2.11.74" />
```

`Nerdbank.Streams` opsional tapi sangat berguna untuk multiplexing (kalau nanti butuh banyak channel di satu pipe) dan `FullDuplexStream.Splice` (gabungkan in+out menjadi satu duplex stream).

Lanjut ke [Step 1: Add Packages](./step-1-packages).
