---
sidebar_position: 11
title: 'Step 8 — Testing'
---

# Step 8 — Testing Strategy

## 8.1 Unit test — pakai in-memory stream

StreamJsonRpc punya helper `FullDuplexStream.CreatePair()` untuk test tanpa pipe nyata:

```csharp title="HermesServices.Tests/HermesRpcTests.cs"
using HermesIpc.Contracts;
using HermesServiceEngine.Rpc;
using Nerdbank.Streams;
using StreamJsonRpc;
using Xunit;

public class HermesRpcTests
{
    [Fact]
    public async Task StartXdr_ReturnsSuccess()
    {
        var (clientStream, serverStream) = FullDuplexStream.CreatePair();

        // Server
        var notifier = new TestNotifier();
        var serverRpc = JsonRpc.Attach(serverStream, new HermesRpcServer(notifier));

        // Client
        var proxy = JsonRpc.Attach<IHermesRpc>(clientStream);

        // Act
        var result = await proxy.StartXdrAsync("test-config", default);

        // Assert
        Assert.True(result.Success);
        Assert.True(notifier.XdrStatusEvents.Count > 0);

        serverRpc.Dispose();
    }
}

class TestNotifier : IClientNotifier
{
    public List<bool> XdrStatusEvents { get; } = new();
    public Task OnXdrStatusChangedAsync(bool running)
    {
        XdrStatusEvents.Add(running);
        return Task.CompletedTask;
    }
    public Task OnSaseStatusChangedAsync(SaseStatus s) => Task.CompletedTask;
    public Task OnKcptunLogAsync(string s) => Task.CompletedTask;
}
```

## 8.2 Integration test — real pipe

```csharp title="HermesServices.Tests/IntegrationTests.cs"
[Fact]
[Trait("Category", "Integration")]
public async Task EndToEnd_RoundTrip()
{
    using var host = new HermesRpcHost();
    await host.StartAsync();

    await using var client = HermesRpcClient.Instance;
    await client.StartAsync();

    var health = await client.Proxy.GetHealthAsync(default);
    Assert.True(health.ServiceRunning);
}
```

Jalankan di Windows host (CI: GitHub-hosted `windows-latest`).

## 8.3 Cross-platform smoke test

Tambah CI workflow yang test build & test pada Windows + macOS + Linux:

```yaml title=".github/workflows/test.yml"
name: Test
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet test --filter "Category!=Integration"
```

## 8.4 Backwards-compat test (selama feature flag aktif)

Selama kode lama masih ada, jalankan **dual mode test**:

```csharp
[Theory]
[InlineData(true)]   // StreamJsonRpc
[InlineData(false)]  // Legacy
public async Task XdrStart_BothImplementations(bool useRpc)
{
    FeatureFlags.UseStreamJsonRpc = useRpc;
    // ... act + assert ...
}
```

Pastikan output identik di kedua mode sebelum hapus legacy code.

## 8.5 Stress test

```csharp
[Fact]
public async Task ConcurrentCalls_NoRaceCondition()
{
    var tasks = Enumerable.Range(0, 100)
        .Select(_ => client.Proxy.GetHealthAsync(default))
        .ToArray();
    await Task.WhenAll(tasks);
    Assert.All(tasks, t => Assert.True(t.Result.ServiceRunning));
}
```

100 paralel — pipe lama akan **hang** karena single-message. StreamJsonRpc lewat tanpa masalah.

## 8.6 Manual test checklist (sebelum hapus legacy code)

- [ ] App start, RPC connect dalam < 2 detik
- [ ] Start/Stop XDR → status berubah di UI
- [ ] Install/Activate/Start/Stop RMM → semua sukses
- [ ] Start SASE dengan config WG valid → tunnel up, event `OnSaseStatusChanged(Connected)` muncul
- [ ] Stop SASE → tunnel down, event `Disconnected`
- [ ] Service restart saat UI running → UI auto-reconnect dalam < 5 detik
- [ ] Kill UI process saat RPC call in-flight → server tidak crash
- [ ] Multiple rapid Start/Stop SASE → tidak ada `WgRename` race
- [ ] Network namespace di Linux container (opsional, future macOS)
- [ ] Log file tidak mengandung private key

## Checklist

- [ ] Unit test pakai `FullDuplexStream.CreatePair()`
- [ ] Integration test di Windows CI
- [ ] Cross-platform smoke test matrix
- [ ] Stress test concurrent calls
- [ ] Manual test checklist 100% green
