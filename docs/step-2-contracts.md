---
sidebar_position: 5
title: 'Step 2 — Define RPC Contract'
---

# Step 2 — Define RPC Contract

Ganti `IpcMessageCommand` ad-hoc dengan **interface bertipe**. StreamJsonRpc akan otomatis route method call ke implementasi.

## 2.1 Interface `IHermesRpc`

Buat file:

```csharp title="HermesServices/HermesIpc.Contracts/IHermesRpc.cs"
using System.Threading;
using System.Threading.Tasks;

namespace HermesIpc.Contracts;

/// <summary>
/// Kontrak RPC antara HermesNetwork (UI) dan HermesServiceEngine (helper).
/// Method dipanggil oleh client, dieksekusi di server.
/// Semua method async dan accept CancellationToken — wajib.
/// </summary>
public interface IHermesRpc
{
    // ====== Logging ======
    Task<RpcResult> SetLogPathAsync(string path, CancellationToken ct);

    // ====== XDR ======
    Task<RpcResult> StartXdrAsync(string config, CancellationToken ct);
    Task<RpcResult> StopXdrAsync(CancellationToken ct);

    // ====== RMM ======
    Task<RpcResult> InstallRmmAsync(CancellationToken ct);
    Task<RpcResult> ActivateRmmAsync(string config, CancellationToken ct);
    Task<RpcResult> StartRmmAsync(CancellationToken ct);
    Task<RpcResult> StopRmmAsync(CancellationToken ct);

    // ====== SASE / WireGuard ======
    Task<RpcResult> StartSaseAsync(string wireGuardConfig, CancellationToken ct);
    Task<RpcResult> StopSaseAsync(CancellationToken ct);

    // ====== Diagnostics (optional) ======
    Task<HealthReport> GetHealthAsync(CancellationToken ct);
}
```

## 2.2 DTO sederhana

```csharp title="HermesServices/HermesIpc.Contracts/RpcResult.cs"
namespace HermesIpc.Contracts;

public sealed record RpcResult(bool Success, string? Message, string? ErrorCode = null)
{
    public static RpcResult Ok(string? message = null) => new(true, message);
    public static RpcResult Fail(string message, string? code = null) => new(false, message, code);
}
```

```csharp title="HermesServices/HermesIpc.Contracts/HealthReport.cs"
namespace HermesIpc.Contracts;

public sealed record HealthReport(
    bool ServiceRunning,
    bool XdrRunning,
    bool RmmRunning,
    bool SaseRunning,
    string Version
);
```

## 2.3 Interface event push (server → client)

StreamJsonRpc mendukung **`event`** C# yang otomatis di-marshal jadi notification JSON-RPC. Tapi cara paling robust adalah definisikan **interface client** terpisah:

```csharp title="HermesServices/HermesIpc.Contracts/IHermesRpcClient.cs"
using System.Threading.Tasks;

namespace HermesIpc.Contracts;

/// <summary>
/// Method yang dipanggil SERVER ke CLIENT (push event).
/// Di sisi UI, implementasi ini me-route ke MessageBusProvider.IpcMessageBus.
/// </summary>
public interface IHermesRpcClient
{
    Task OnSaseStatusChangedAsync(SaseStatus status);
    Task OnKcptunLogAsync(string line);
    Task OnXdrStatusChangedAsync(bool running);
    Task OnLogEntryAsync(LogLevel level, string source, string message);
}

public enum SaseStatus { Disconnected, Connecting, Connected, Reconnecting, Failed }
public enum LogLevel { Trace, Debug, Info, Warn, Error }
```

## 2.4 Constants tetap dipakai? Bisa, tapi tidak wajib

Karena method sudah bertipe, `IpcConst.Services.Xdr` + `Arguments.Start` tidak diperlukan lagi sebagai routing key. Anda bisa:

- **Pertahankan** `IpcConst` untuk konsumsi di domain layer (misal log key).
- **Hapus** kalau hanya dipakai routing IPC.

## 2.5 Mapping lama → baru

| Sebelum (`IpcMessageCommand`) | Sesudah (method call) |
|---|---|
| `{Service:"Xdr", Arg:"Start", Config:"..."}` | `await rpc.StartXdrAsync(config, ct)` |
| `{Service:"Sase", Arg:"Start", Config:"<wg>"}` | `await rpc.StartSaseAsync(wgConfig, ct)` |
| `{Service:"Log", Arg:"Path", Config:"C:\\..."}` | `await rpc.SetLogPathAsync(path, ct)` |

Lebih readable, type-safe, IDE autocomplete jalan, refactor aman.

## Checklist

- [ ] `IHermesRpc.cs` dibuat di `HermesIpc.Contracts`
- [ ] `RpcResult.cs` & `HealthReport.cs` dibuat
- [ ] `IHermesRpcClient.cs` dibuat untuk event push
- [ ] Build sukses
- [ ] Tim sepakat naming method (review!)

Lanjut: [Step 3: Transport Factory](./step-3-transport-factory).
