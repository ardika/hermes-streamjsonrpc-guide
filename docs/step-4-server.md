---
sidebar_position: 7
title: 'Step 4 — Refactor Server'
---

# Step 4 — Refactor HermesServiceEngine (Server)

Sekarang kita ganti `HermesServiceEngine/Conn/IpcComService.cs` dengan implementasi StreamJsonRpc.

## 4.1 Implementasikan `IHermesRpc`

Buat file baru:

```csharp title="HermesServices/HermesServiceEngine/Rpc/HermesRpcServer.cs"
using System.Threading;
using System.Threading.Tasks;
using HermesIpc.Contracts;
using HermesServiceEngine.Log;
using HermesServiceEngine.Modules;

namespace HermesServiceEngine.Rpc;

/// <summary>
/// Implementasi server-side IHermesRpc. Method ini di-invoke oleh StreamJsonRpc
/// saat client call. Wrap domain modules existing (ServiceXdr, ServiceRmm, ServiceSase).
/// </summary>
public sealed class HermesRpcServer : IHermesRpc
{
    private readonly IClientNotifier _notifier;

    public HermesRpcServer(IClientNotifier notifier)
    {
        _notifier = notifier;
    }

    public Task<RpcResult> SetLogPathAsync(string path, CancellationToken ct)
    {
        HelpReport.ChangeLogPath(path);
        return Task.FromResult(RpcResult.Ok($"Log path set to {path}"));
    }

    public async Task<RpcResult> StartXdrAsync(string config, CancellationToken ct)
    {
        var ok = await ServiceXdr.StartAgentXdrService(config).ConfigureAwait(false);
        await _notifier.OnXdrStatusChangedAsync(ok).ConfigureAwait(false);
        return ok ? RpcResult.Ok("XDR started") : RpcResult.Fail("Failed to start XDR");
    }

    public async Task<RpcResult> StopXdrAsync(CancellationToken ct)
    {
        var ok = await ServiceXdr.StopAgentXdrService().ConfigureAwait(false);
        await _notifier.OnXdrStatusChangedAsync(false).ConfigureAwait(false);
        return ok ? RpcResult.Ok("XDR stopped") : RpcResult.Fail("Failed to stop XDR");
    }

    public async Task<RpcResult> InstallRmmAsync(CancellationToken ct)
    {
        var (ok, err) = await ServiceRmm.InstallingRmmModule().ConfigureAwait(false);
        return ok ? RpcResult.Ok("Installation success") : RpcResult.Fail($"Installation failed: {err}");
    }

    public async Task<RpcResult> ActivateRmmAsync(string config, CancellationToken ct)
    {
        var (ok, err) = await ServiceRmm.ActivatingRmmModule(config).ConfigureAwait(false);
        return ok ? RpcResult.Ok("Activation success") : RpcResult.Fail($"Activation failed: {err}");
    }

    public async Task<RpcResult> StartRmmAsync(CancellationToken ct)
    {
        var ok = await ServiceRmm.StartServiceMeshAgent().ConfigureAwait(false);
        return ok ? RpcResult.Ok("RMM started") : RpcResult.Fail("Failed to start RMM");
    }

    public async Task<RpcResult> StopRmmAsync(CancellationToken ct)
    {
        var ok = await ServiceRmm.StopServiceMeshAgent().ConfigureAwait(false);
        return ok ? RpcResult.Ok("RMM stopped") : RpcResult.Fail("Failed to stop RMM");
    }

    public async Task<RpcResult> StartSaseAsync(string wireGuardConfig, CancellationToken ct)
    {
        // WgRename + ServiceSase.CreateSaseConfiguration + ServiceSase.StartSaseService
        // tetap dipanggil sama persis seperti dispatcher lama (IpcComService.cs:257-281).
        await _notifier.OnSaseStatusChangedAsync(SaseStatus.Connecting).ConfigureAwait(false);

        WgFileManager.Rename(toWireguardDll: true);   // lihat catatan di bawah

        var (cfgOk, cfgErr) = ServiceSase.CreateSaseConfiguration(wireGuardConfig);
        if (!cfgOk)
        {
            await _notifier.OnSaseStatusChangedAsync(SaseStatus.Failed).ConfigureAwait(false);
            return RpcResult.Fail($"Failed to create SASE config: {cfgErr}");
        }

        await Task.Delay(1000, ct).ConfigureAwait(false);

        var (startOk, startErr) = ServiceSase.StartSaseService();
        if (!startOk)
        {
            await _notifier.OnSaseStatusChangedAsync(SaseStatus.Failed).ConfigureAwait(false);
            return RpcResult.Fail($"Failed to start SASE: {startErr}");
        }

        await _notifier.OnSaseStatusChangedAsync(SaseStatus.Connected).ConfigureAwait(false);
        return RpcResult.Ok("SASE started");
    }

    public async Task<RpcResult> StopSaseAsync(CancellationToken ct)
    {
        var (ok, err) = ServiceSase.StopSaseService();
        WgFileManager.Rename(toWireguardDll: false);
        await _notifier.OnSaseStatusChangedAsync(SaseStatus.Disconnected).ConfigureAwait(false);
        return ok ? RpcResult.Ok("SASE stopped") : RpcResult.Fail($"Failed to stop SASE: {err}");
    }

    public Task<HealthReport> GetHealthAsync(CancellationToken ct)
    {
        var report = new HealthReport(
            ServiceRunning: true,
            XdrRunning: ServiceXdr.IsRunning,
            RmmRunning: ServiceRmm.IsRunning,
            SaseRunning: ServiceSase.IsRunning,
            Version: typeof(HermesRpcServer).Assembly.GetName().Version?.ToString() ?? "0.0.0");
        return Task.FromResult(report);
    }
}
```

> **Catatan `WgFileManager`:** Ekstrak `WgRename` dari `IpcComService.cs:411-443` ke kelas terpisah dan **wrap dengan `lock`** untuk fix race condition yang sudah diidentifikasi di analisis sebelumnya.

## 4.2 Notifier interface

Server butuh cara push event ke client. Kita injeksi via interface:

```csharp title="HermesServices/HermesServiceEngine/Rpc/IClientNotifier.cs"
using System.Threading.Tasks;
using HermesIpc.Contracts;

namespace HermesServiceEngine.Rpc;

public interface IClientNotifier
{
    Task OnSaseStatusChangedAsync(SaseStatus status);
    Task OnKcptunLogAsync(string line);
    Task OnXdrStatusChangedAsync(bool running);
}
```

## 4.3 Host loop — accept clients, attach JSON-RPC

```csharp title="HermesServices/HermesServiceEngine/Rpc/HermesRpcHost.cs"
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using HermesIpc.Contracts;
using HermesIpc.Contracts.Transports;
using HermesServiceEngine.Log;
using Nerdbank.Streams;
using StreamJsonRpc;

namespace HermesServiceEngine.Rpc;

public sealed class HermesRpcHost : IAsyncDisposable
{
    private readonly CancellationTokenSource _cts = new();
    private Task? _runLoop;

    public Task StartAsync()
    {
        _runLoop = Task.Run(() => RunAsync(_cts.Token));
        return Task.CompletedTask;
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var transport = IpcTransportFactory.CreateServer();
        HelpReport.LogInfo($"[RPC] Host listening...");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var stream = await transport.AcceptAsync(ct).ConfigureAwait(false);
                _ = Task.Run(() => HandleClientAsync(stream, ct), ct);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                HelpReport.LogInfo($"[RPC] Accept error: {ex.Message}");
                await Task.Delay(500, ct).ConfigureAwait(false);
            }
        }
    }

    private async Task HandleClientAsync(Stream stream, CancellationToken ct)
    {
        try
        {
            // Verifikasi peer (Step 7) — diisi nanti
            // PeerVerifier.Verify(stream);

            var formatter = new SystemTextJsonFormatter();
            var handler = new LengthHeaderMessageHandler(stream, stream, formatter);

            using var rpc = new JsonRpc(handler);

            // Notifier yang membungkus rpc.NotifyAsync
            var notifier = new JsonRpcClientNotifier(rpc);
            var target = new HermesRpcServer(notifier);

            rpc.AddLocalRpcTarget<IHermesRpc>(target, new JsonRpcTargetOptions
            {
                AllowNonPublicInvocation = false,
                NotifyClientOfEvents = true,
            });

            rpc.StartListening();
            await rpc.Completion.ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            HelpReport.LogInfo($"[RPC] Client session error: {ex.Message}");
        }
        finally
        {
            try { stream.Dispose(); } catch { }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_runLoop is not null)
        {
            try { await _runLoop.ConfigureAwait(false); } catch { }
        }
        _cts.Dispose();
    }
}

/// <summary>
/// Notifier implementasi yang me-forward ke JsonRpc.NotifyAsync.
/// Method name harus match IHermesRpcClient di sisi UI.
/// </summary>
internal sealed class JsonRpcClientNotifier : IClientNotifier
{
    private readonly JsonRpc _rpc;
    public JsonRpcClientNotifier(JsonRpc rpc) => _rpc = rpc;

    public Task OnSaseStatusChangedAsync(SaseStatus status) =>
        _rpc.NotifyAsync(nameof(IHermesRpcClient.OnSaseStatusChangedAsync), status);

    public Task OnKcptunLogAsync(string line) =>
        _rpc.NotifyAsync(nameof(IHermesRpcClient.OnKcptunLogAsync), line);

    public Task OnXdrStatusChangedAsync(bool running) =>
        _rpc.NotifyAsync(nameof(IHermesRpcClient.OnXdrStatusChangedAsync), running);
}
```

## 4.4 Wiring di service entry point

Cari file entry point Hermes service (cari `static class Program` atau `ServiceBase.Run` di `HermesServiceEngine`). Tambahkan startup:

```csharp title="HermesServices/HermesServiceEngine/Program.cs (atau HermesService.cs)"
// di startup, sebelum service main loop:
var rpcHost = new HermesRpcHost();
await rpcHost.StartAsync();

// ... existing service loop ...

// pada shutdown:
await rpcHost.DisposeAsync();
```

## 4.5 Hapus kode lama (HATI-HATI)

**JANGAN hapus dulu** — sampai sisi client juga migrasi (Step 5) dan sudah ditest. Gunakan feature flag atau pertahankan paralel sementara:

```csharp
// HermesService.cs
if (FeatureFlags.UseStreamJsonRpc)
    await rpcHost.StartAsync();
else
    _ = oldIpcComService.StartIpcLoopAsync();  // legacy
```

Setelah semua green di staging (Step 8), baru hapus:

- `HermesServiceEngine/Conn/IpcComService.cs` (456 baris)
- Switch dispatcher `ProcessMessage` (~150 baris)

## Checklist

- [ ] `HermesRpcServer.cs` mengimplementasikan `IHermesRpc`
- [ ] `IClientNotifier.cs` interface
- [ ] `HermesRpcHost.cs` accept loop + per-client task
- [ ] `JsonRpcClientNotifier` forward ke `rpc.NotifyAsync`
- [ ] Wiring di service startup
- [ ] Feature flag untuk paralel run dengan kode lama
- [ ] `WgRename` diekstrak ke `WgFileManager` dengan `lock`

Lanjut: [Step 5: Client](./step-5-client).
