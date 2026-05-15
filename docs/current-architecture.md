---
sidebar_position: 2
title: Current Architecture
---

# Current IPC Architecture

Sebelum migrasi, pahami baseline dulu.

## Diagram tingkat tinggi

```
┌────────────────────────────┐         ┌────────────────────────────────┐
│  HermesNetwork (UI app)    │         │  HermesServiceEngine (helper)  │
│  User session, non-admin   │         │  Windows Service, SYSTEM       │
│                            │         │                                │
│  IpcComService.SendMessage ├────┐    │  IpcComService.StartIpc        │
│  pipe: HermesServiceEngine │    │    │  pipe: HermesServiceEngine     │
│                            │    └───▶│   (server)                     │
│  IpcComService.StartIpc    │◀────┐   │  IpcComService.SendMessage     │
│  pipe: HermesNetwork360Gua │     └───┤  pipe: HermesNetwork360Guard   │
│   rd (server, for replies) │         │   (client, push reply)         │
└────────────────────────────┘         └────────────────────────────────┘
                ▲                                       │
                │                                       ▼
                │                            ┌─────────────────────────┐
                │                            │  ServiceXdr / Rmm /     │
                │                            │  Sase / WireGuard child │
                └──── MessageBusProvider ────│  + Kcptun process       │
                       .IpcMessageBus        └─────────────────────────┘
```

Karakteristik utama:

- **Dua pipe terpisah**, satu untuk command (UI → service), satu untuk reply (service → UI).
- **Single-message per connection**: server membuka pipe, `WaitForConnection`, baca 1 baris, proses, tutup, loop.
- **JSON manual** via `System.Text.Json` di kedua sisi.
- **Framing newline**: `StreamWriter.WriteLineAsync` + `StreamReader.ReadLineAsync`.

## File kunci di codebase

| File | Peran |
|---|---|
| `HermesNetwork/Conn/IpcComService.cs` | Client side (UI). Server pipe `HermesNetwork360Guard` untuk reply. |
| `HermesServices/HermesServiceEngine/Conn/IpcComService.cs` | Server side. Dispatcher `ProcessMessage()` switch ke ServiceXdr/Rmm/Sase. |
| `HermesNetwork/Models/IpcMessageCommand.cs` | DTO command |
| `HermesNetwork/Models/IpcMessageResult.cs` | DTO reply |
| `HermesServices/HermesServiceEngine/Models/IpcMessageCommand.cs` | DTO server mirror |
| `HermesServices/HermesServiceEngine/Models/IpcMessageResult.cs` | DTO server mirror |
| `HermesNetwork/Const/IpcConst.cs` | String constants (`Services.Xdr`, `Arguments.Start`, dll.) |

## DTO saat ini

```csharp
// HermesNetwork/Models/IpcMessageCommand.cs
public class IpcMessageCommand
{
    public string? Code { get; set; }          // random 6 char correlation
    public string? Service { get; set; }       // "Xdr" | "Rmm" | "Sase" | "Log"
    public string? Arg { get; set; }           // "Start" | "Stop" | "Installation" | ...
    public string? Config { get; set; }        // free-form payload (path, WG conf, dll.)
    public string? OptionalData { get; set; }
}

// HermesNetwork/Models/IpcMessageResult.cs
public class IpcMessageResult
{
    public string? Code { get; set; }
    public string? Service { get; set; }
    public string? Arg { get; set; }
    public bool? Status { get; set; }
    public string? Message { get; set; }
}
```

## Server dispatcher (excerpt)

```csharp
// HermesServiceEngine/Conn/IpcComService.cs:113-319
private async Task ProcessMessage(string jsonMessage)
{
    var cmd = JsonSerializer.Deserialize<IpcMessageCommand>(jsonMessage);

    switch (cmd.Service)
    {
        case IpcConstans.Services.Xdr:
            switch (cmd.Arg)
            {
                case IpcConstans.Arguments.Start:
                    var ok = await ServiceXdr.StartAgentXdrService(cmd.Config);
                    await SendMessage(cmd, ok, ok ? "XDR started" : "Failed");
                    break;
                // ... Stop, Rmm, Sase, dst
            }
            break;
    }
}
```

Pola yang sama berulang ~150 baris.

## Masalah yang ingin kita selesaikan

1. **Tidak aman.** `WorldSid + ReadWrite` di pipe ACL (`IpcComService.cs:47-48`) — proses non-admin apa pun bisa kirim command ke service SYSTEM.
2. **Framing rapuh.** `ReadLineAsync()` pecah pada `\n`; payload WG config multi-line bisa ter-truncate.
3. **Single-message pipe.** Tidak ada concurrency; kalau message kedua datang saat message pertama masih diproses, race.
4. **Dua pipe.** Server perlu jadi client untuk push reply — koneksi dua arah ad-hoc, error handling duplicated.
5. **Boilerplate dispatch.** Setiap command baru = case baru di switch raksasa.
6. **Tidak ada cancellation.** Tidak ada CancellationToken sampai ke domain logic.
7. **Polling untuk status.** Tidak ada push native untuk status WG / Kcptun → UI polling.
8. **Logging secret.** Seluruh JSON di-log (kecuali `SaseDataTransfer`) → private key bocor.

Lanjut ke [Why StreamJsonRpc](./why-streamjsonrpc) untuk lihat bagaimana library ini menyelesaikan kedelapan masalah di atas.
