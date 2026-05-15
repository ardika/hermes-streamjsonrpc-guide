---
sidebar_position: 6
title: 'Step 3 — Transport Factory'
---

# Step 3 — Per-OS Transport Factory

StreamJsonRpc agnostic terhadap transport — ia butuh `Stream` duplex. Kita buat factory yang return `Stream` berbeda per OS.

## 3.1 Interface abstraksi

```csharp title="HermesServices/HermesIpc.Contracts/IIpcTransport.cs"
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace HermesIpc.Contracts;

/// <summary>
/// Abstraksi transport. Server: AcceptAsync(). Client: ConnectAsync().
/// </summary>
public interface IIpcTransport
{
    /// <summary>Server side: tunggu koneksi client, kembalikan duplex Stream.</summary>
    Task<Stream> AcceptAsync(CancellationToken ct);

    /// <summary>Client side: connect ke server, kembalikan duplex Stream.</summary>
    Task<Stream> ConnectAsync(CancellationToken ct);
}
```

## 3.2 Konfigurasi endpoint

```csharp title="HermesServices/HermesIpc.Contracts/IpcEndpoint.cs"
using System;
using System.IO;
using System.Runtime.InteropServices;

namespace HermesIpc.Contracts;

public static class IpcEndpoint
{
    public const string PipeName = "HermesRpc.v1";

    /// <summary>Path Unix Domain Socket pada macOS/Linux.</summary>
    public static string UnixSocketPath
    {
        get
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                return "/var/run/hermes-rpc.sock";
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                return "/run/hermes-rpc.sock";

            // fallback dev environment
            return Path.Combine(Path.GetTempPath(), "hermes-rpc.sock");
        }
    }
}
```

## 3.3 Implementasi Windows — Named Pipe

```csharp title="HermesServices/HermesIpc.Contracts/Transports/WindowsPipeTransport.cs"
using System;
using System.IO;
using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;

namespace HermesIpc.Contracts.Transports;

[SupportedOSPlatform("windows")]
public sealed class WindowsPipeTransport : IIpcTransport
{
    private readonly string _pipeName;
    private readonly bool _isServer;
    private readonly PipeSecurity? _serverSecurity;

    public WindowsPipeTransport(string pipeName, bool isServer, PipeSecurity? security = null)
    {
        _pipeName = pipeName;
        _isServer = isServer;
        _serverSecurity = security;
    }

    public async Task<Stream> AcceptAsync(CancellationToken ct)
    {
        if (!_isServer) throw new InvalidOperationException("Configured as client");

        var server = NamedPipeServerStreamAcl.Create(
            pipeName: _pipeName,
            direction: PipeDirection.InOut,
            maxNumberOfServerInstances: NamedPipeServerStream.MaxAllowedServerInstances,
            transmissionMode: PipeTransmissionMode.Byte,
            options: PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            inBufferSize: 64 * 1024,
            outBufferSize: 64 * 1024,
            pipeSecurity: _serverSecurity ?? DefaultSecurity());

        await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
        return server;
    }

    public async Task<Stream> ConnectAsync(CancellationToken ct)
    {
        if (_isServer) throw new InvalidOperationException("Configured as server");

        var client = new NamedPipeClientStream(
            serverName: ".",
            pipeName: _pipeName,
            direction: PipeDirection.InOut,
            options: PipeOptions.Asynchronous | PipeOptions.WriteThrough);

        await client.ConnectAsync(ct).ConfigureAwait(false);
        return client;
    }

    /// <summary>
    /// ACL default: hanya user yang sedang interactive logon + LocalSystem.
    /// MENGGANTIKAN WorldSid (rawan) dari implementasi lama.
    /// </summary>
    private static PipeSecurity DefaultSecurity()
    {
        var sec = new PipeSecurity();

        // LocalSystem (untuk service helper itu sendiri)
        sec.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            PipeAccessRights.FullControl,
            AccessControlType.Allow));

        // Interactive users (user yang punya UI session)
        sec.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.InteractiveSid, null),
            PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance,
            AccessControlType.Allow));

        return sec;
    }
}
```

## 3.4 Implementasi macOS/Linux — Unix Domain Socket

```csharp title="HermesServices/HermesIpc.Contracts/Transports/UnixSocketTransport.cs"
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace HermesIpc.Contracts.Transports;

public sealed class UnixSocketTransport : IIpcTransport, IDisposable
{
    private readonly string _path;
    private readonly bool _isServer;
    private Socket? _listener;

    public UnixSocketTransport(string socketPath, bool isServer)
    {
        _path = socketPath;
        _isServer = isServer;
    }

    public async Task<Stream> AcceptAsync(CancellationToken ct)
    {
        if (!_isServer) throw new InvalidOperationException("Configured as client");

        if (_listener is null)
        {
            // Hapus socket file lama kalau ada
            if (File.Exists(_path)) File.Delete(_path);

            _listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            _listener.Bind(new UnixDomainSocketEndPoint(_path));
            _listener.Listen(backlog: 16);

            // Set mode 0600: owner-only RW. Hindari WorldRW di filesystem.
            // Pada .NET 7+: File.SetUnixFileMode
            try
            {
                File.SetUnixFileMode(_path,
                    UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
            catch (PlatformNotSupportedException) { /* Windows fallback */ }
        }

        var clientSocket = await _listener.AcceptAsync(ct).ConfigureAwait(false);
        return new NetworkStream(clientSocket, ownsSocket: true);
    }

    public async Task<Stream> ConnectAsync(CancellationToken ct)
    {
        if (_isServer) throw new InvalidOperationException("Configured as server");

        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await socket.ConnectAsync(new UnixDomainSocketEndPoint(_path), ct).ConfigureAwait(false);
        return new NetworkStream(socket, ownsSocket: true);
    }

    public void Dispose()
    {
        _listener?.Dispose();
        try { if (File.Exists(_path)) File.Delete(_path); } catch { /* ignore */ }
    }
}
```

## 3.5 Factory aggregator

```csharp title="HermesServices/HermesIpc.Contracts/Transports/IpcTransportFactory.cs"
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace HermesIpc.Contracts.Transports;

public static class IpcTransportFactory
{
    public static IIpcTransport CreateServer()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return CreateWindowsServer();

        return new UnixSocketTransport(IpcEndpoint.UnixSocketPath, isServer: true);
    }

    public static IIpcTransport CreateClient()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return CreateWindowsClient();

        return new UnixSocketTransport(IpcEndpoint.UnixSocketPath, isServer: false);
    }

    [SupportedOSPlatform("windows")]
    private static IIpcTransport CreateWindowsServer() =>
        new WindowsPipeTransport(IpcEndpoint.PipeName, isServer: true);

    [SupportedOSPlatform("windows")]
    private static IIpcTransport CreateWindowsClient() =>
        new WindowsPipeTransport(IpcEndpoint.PipeName, isServer: false);
}
```

## 3.6 Sanity build

```powershell
dotnet build HermesServices/HermesIpc.Contracts/HermesIpc.Contracts.csproj
```

Catatan: `NamedPipeServerStreamAcl` ada di package `System.IO.Pipes.AccessControl` (sudah otomatis di Windows .NET 8 SDK).

## Checklist

- [ ] `IIpcTransport.cs`
- [ ] `IpcEndpoint.cs`
- [ ] `WindowsPipeTransport.cs` dengan ACL ketat (no `WorldSid`!)
- [ ] `UnixSocketTransport.cs` dengan mode 0600
- [ ] `IpcTransportFactory.cs`
- [ ] Build sukses di Windows
- [ ] (Optional) Build cross-compile cek di Linux runner CI

Lanjut: [Step 4: Server](./step-4-server).
