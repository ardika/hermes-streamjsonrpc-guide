---
sidebar_position: 9
title: 'Step 6 — Push Events (Replace Polling)'
---

# Step 6 — Push Events Menggantikan Polling

Sisi server saat ini polling status WG/Kcptun tiap 30 detik (`ServiceSase.cs:189-211`). Ganti dengan push event langsung ke UI.

## 6.1 Hook event dari domain

Di `ServiceSase`, expose event saat status berubah:

```csharp title="HermesServiceEngine/Modules/ServiceSase.cs (patch)"
public static event Action<SaseStatus>? StatusChanged;
public static event Action<string>? KcptunLogReceived;

// Saat connect:
StatusChanged?.Invoke(SaseStatus.Connected);

// Saat Kcptun stdout line keluar (StartKcptunProcess ProcessOutputDataReceived):
KcptunLogReceived?.Invoke(args.Data);
```

## 6.2 Bridge ke notifier di `HermesRpcHost`

Saat per-client session dibuat, subscribe ke event dan forward ke `_notifier`:

```csharp title="HermesServices/HermesServiceEngine/Rpc/HermesRpcHost.cs (additions)"
private async Task HandleClientAsync(Stream stream, CancellationToken ct)
{
    var formatter = new SystemTextJsonFormatter();
    var handler = new LengthHeaderMessageHandler(stream, stream, formatter);
    using var rpc = new JsonRpc(handler);

    var notifier = new JsonRpcClientNotifier(rpc);
    var target = new HermesRpcServer(notifier);
    rpc.AddLocalRpcTarget<IHermesRpc>(target, new JsonRpcTargetOptions());

    // === SUBSCRIBE EVENT SAAT KONEKSI AKTIF ===
    void OnSaseStatus(SaseStatus s) => _ = notifier.OnSaseStatusChangedAsync(s);
    void OnKcptunLog(string line) => _ = notifier.OnKcptunLogAsync(line);

    ServiceSase.StatusChanged += OnSaseStatus;
    ServiceSase.KcptunLogReceived += OnKcptunLog;

    try
    {
        rpc.StartListening();
        await rpc.Completion.ConfigureAwait(false);
    }
    finally
    {
        ServiceSase.StatusChanged -= OnSaseStatus;
        ServiceSase.KcptunLogReceived -= OnKcptunLog;
        stream.Dispose();
    }
}
```

> **Penting**: Unsubscribe di `finally` mencegah memory leak kalau client disconnect.

## 6.3 Hapus polling timer

Hapus seluruh blok polling di `ServiceSase.cs:189-211` (`ProcessDataTransferAsync` timer + exponential backoff loop). UI sekarang dapat event real-time.

## 6.4 Multi-client broadcast (opsional)

Kalau ada 2 UI instance (developer scenario), kedua-duanya harus dapat event. Caranya: simpan list connected notifier di `HermesRpcHost`:

```csharp
private readonly ConcurrentBag<IClientNotifier> _connectedClients = new();

// di HandleClientAsync setelah create notifier:
_connectedClients.Add(notifier);

// di server start, subscribe sekali aja:
ServiceSase.StatusChanged += status =>
{
    foreach (var c in _connectedClients)
        _ = c.OnSaseStatusChangedAsync(status);
};
```

Tapi untuk Hermes (1 UI per session) cara per-koneksi di atas sudah cukup.

## 6.5 UI throttling

Kcptun bisa log puluhan baris per detik. Di `HermesRpcClientTarget.OnKcptunLogAsync`, tambahkan throttle/batch sebelum push ke MessageBus untuk hindari UI thread spam:

```csharp
private readonly Channel<string> _logChannel = Channel.CreateBounded<string>(1000);

public Task OnKcptunLogAsync(string line)
{
    _logChannel.Writer.TryWrite(line);
    return Task.CompletedTask;
}

// di constructor:
_ = Task.Run(async () =>
{
    var batch = new List<string>(50);
    await foreach (var line in _logChannel.Reader.ReadAllAsync())
    {
        batch.Add(line);
        if (batch.Count >= 50) { Flush(batch); batch.Clear(); }
        else await Task.Delay(100);
    }
});
```

## Checklist

- [ ] `StatusChanged`, `KcptunLogReceived` event di `ServiceSase`
- [ ] Subscribe di `HermesRpcHost.HandleClientAsync` + unsubscribe di `finally`
- [ ] Polling timer dihapus
- [ ] UI throttle Kcptun log
- [ ] Verifikasi event muncul di UI saat tunnel up/down
