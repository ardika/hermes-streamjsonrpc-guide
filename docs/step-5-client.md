---
sidebar_position: 8
title: 'Step 5 — Refactor Client'
---

# Step 5 — Refactor HermesNetwork (Client UI)

Ganti `HermesNetwork/Conn/IpcComService.cs` dengan proxy StreamJsonRpc.

## 5.1 Implementasikan `IHermesRpcClient` (target untuk event server)

```csharp title="HermesNetwork/Rpc/HermesRpcClientTarget.cs"
using System.Threading.Tasks;
using HermesIpc.Contracts;
using HermesNetwork.Bus;
using HermesNetwork.Models;

namespace HermesNetwork.Rpc;

/// <summary>
/// Implementasi sisi UI dari event push server.
/// Forward semua event ke MessageBusProvider.IpcMessageBus
/// supaya kode konsumer existing (ViewModel dst.) tidak perlu diubah.
/// </summary>
public sealed class HermesRpcClientTarget : IHermesRpcClient
{
    public Task OnSaseStatusChangedAsync(SaseStatus status)
    {
        MessageBusProvider.IpcMessageBus.SendMessage(new IpcMessageResult
        {
            Service = "Sase",
            Arg = status.ToString(),
            Status = status == SaseStatus.Connected,
            Message = $"SASE status: {status}"
        });
        return Task.CompletedTask;
    }

    public Task OnKcptunLogAsync(string line)
    {
        MessageBusProvider.IpcMessageBus.SendMessage(new IpcMessageResult
        {
            Service = "Kcptun",
            Arg = "Log",
            Status = true,
            Message = line
        });
        return Task.CompletedTask;
    }

    public Task OnXdrStatusChangedAsync(bool running)
    {
        MessageBusProvider.IpcMessageBus.SendMessage(new IpcMessageResult
        {
            Service = "Xdr",
            Arg = running ? "Started" : "Stopped",
            Status = running
        });
        return Task.CompletedTask;
    }

    public Task OnLogEntryAsync(LogLevel level, string source, string message)
    {
        MessageBusProvider.IpcMessageBus.SendMessage(new IpcMessageResult
        {
            Service = source,
            Arg = level.ToString(),
            Message = message
        });
        return Task.CompletedTask;
    }
}
```

## 5.2 RPC connection manager dengan auto-reconnect

```csharp title="HermesNetwork/Rpc/HermesRpcClient.cs"
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using HermesIpc.Contracts;
using HermesIpc.Contracts.Transports;
using HermesNetwork.Log;
using StreamJsonRpc;

namespace HermesNetwork.Rpc;

public sealed class HermesRpcClient : IAsyncDisposable
{
    private static HermesRpcClient? _instance;
    private static readonly object _lock = new();

    public static HermesRpcClient Instance
    {
        get { lock (_lock) return _instance ??= new HermesRpcClient(); }
    }

    private readonly SemaphoreSlim _connectGate = new(1, 1);
    private readonly CancellationTokenSource _cts = new();
    private JsonRpc? _rpc;
    private IHermesRpc? _proxy;
    private Stream? _stream;
    private Task? _reconnectLoop;

    private HermesRpcClient() { }

    public IHermesRpc Proxy
    {
        get => _proxy ?? throw new InvalidOperationException("Not connected. Call StartAsync first.");
    }

    public bool IsConnected => _rpc is { IsDisposed: false };

    public async Task StartAsync()
    {
        await ConnectOnceAsync(_cts.Token).ConfigureAwait(false);

        _reconnectLoop = Task.Run(async () =>
        {
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    if (_rpc is not null) await _rpc.Completion.ConfigureAwait(false);
                }
                catch { /* connection dropped */ }

                if (_cts.IsCancellationRequested) break;

                HelpReport.LogInfo("[RPC] Disconnected. Reconnecting in 2s...");
                await Task.Delay(2000, _cts.Token).ConfigureAwait(false);

                try { await ConnectOnceAsync(_cts.Token).ConfigureAwait(false); }
                catch (Exception ex) { HelpReport.LogInfo($"[RPC] Reconnect failed: {ex.Message}"); }
            }
        });
    }

    private async Task ConnectOnceAsync(CancellationToken ct)
    {
        await _connectGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            DisposeRpc();

            var transport = IpcTransportFactory.CreateClient();

            using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            connectCts.CancelAfter(TimeSpan.FromSeconds(5));

            _stream = await transport.ConnectAsync(connectCts.Token).ConfigureAwait(false);

            var formatter = new SystemTextJsonFormatter();
            var handler = new LengthHeaderMessageHandler(_stream, _stream, formatter);

            _rpc = new JsonRpc(handler);

            // Daftarkan client target untuk terima event push dari server
            _rpc.AddLocalRpcTarget<IHermesRpcClient>(
                new HermesRpcClientTarget(),
                new JsonRpcTargetOptions { AllowNonPublicInvocation = false });

            // Buat proxy bertipe untuk panggil method server
            _proxy = _rpc.Attach<IHermesRpc>();

            _rpc.StartListening();
            HelpReport.LogInfo("[RPC] Connected to HermesServiceEngine");
        }
        finally { _connectGate.Release(); }
    }

    private void DisposeRpc()
    {
        try { _rpc?.Dispose(); } catch { }
        try { _stream?.Dispose(); } catch { }
        _rpc = null;
        _stream = null;
        _proxy = null;
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_reconnectLoop is not null) try { await _reconnectLoop.ConfigureAwait(false); } catch { }
        DisposeRpc();
        _cts.Dispose();
    }
}
```

## 5.3 Pemanggilan dari ViewModel

```csharp
// Sebelum:
// await IpcComService.SendMessage(new IpcMessageCommand {
//     Code = StringHelper.GetRandomString(6),
//     Service = IpcConst.Services.Xdr,
//     Arg = IpcConst.Arguments.Start,
//     Config = "..."
// });

// Sesudah:
var result = await HermesRpcClient.Instance.Proxy
    .StartXdrAsync(config: "...", cancellationToken);

if (!result.Success)
    ShowError(result.Message);
```

Atau untuk SASE:

```csharp
var sw = Stopwatch.StartNew();
try
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
    var result = await HermesRpcClient.Instance.Proxy
        .StartSaseAsync(wireGuardConfig, cts.Token);

    Log.Info($"SASE start: {result.Success} in {sw.ElapsedMilliseconds}ms");
}
catch (TaskCanceledException)
{
    Log.Warn("SASE start timed out after 30s");
}
catch (RemoteInvocationException ex)
{
    // Exception yang di-throw dari sisi server
    Log.Error($"Server error: {ex.Message}");
}
catch (ConnectionLostException)
{
    Log.Error("Lost connection to service");
    // HermesRpcClient akan auto-reconnect
}
```

## 5.4 Lifecycle wiring di App

```csharp title="HermesNetwork/App.axaml.cs"
public override async void OnFrameworkInitializationCompleted()
{
    // ... existing init ...

    await HermesRpcClient.Instance.StartAsync();
}

protected override async void OnExiting()
{
    await HermesRpcClient.Instance.DisposeAsync();
    base.OnExiting();
}
```

## 5.5 Hapus pipe receiver lama

Setelah event handler berjalan via `HermesRpcClientTarget`, server pipe lama `HermesNetwork360Guard` di `HermesNetwork/Conn/IpcComService.cs:50-67` **tidak lagi diperlukan**. Hapus saat rollout final.

## Checklist

- [ ] `HermesRpcClientTarget.cs` forward event ke MessageBus
- [ ] `HermesRpcClient.cs` dengan singleton + auto-reconnect
- [ ] ViewModel migrasi dari `SendMessage(IpcMessageCommand)` ke `Proxy.XxxAsync(...)`
- [ ] App lifecycle wired (`StartAsync` di init, `DisposeAsync` di exit)
- [ ] Pipe receiver lama dihapus setelah verified

Lanjut: [Step 6: Push Events](./step-6-events-push).
