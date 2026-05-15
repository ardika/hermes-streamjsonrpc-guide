---
sidebar_position: 10
title: 'Step 7 — Security Hardening'
---

# Step 7 — Security Hardening

Setelah transport jalan, tutup celah keamanan utama.

## 7.1 ACL pipe ketat (Windows)

Sudah dilakukan di Step 3 — hapus `WorldSid`. Verifikasi:

```csharp
// HARUS BEGINI:
sec.AddAccessRule(new PipeAccessRule(
    new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
    PipeAccessRights.FullControl,
    AccessControlType.Allow));
sec.AddAccessRule(new PipeAccessRule(
    new SecurityIdentifier(WellKnownSidType.InteractiveSid, null),
    PipeAccessRights.ReadWrite,
    AccessControlType.Allow));

// HARUS TIDAK ADA:
// new SecurityIdentifier(WellKnownSidType.WorldSid, null)  ← HAPUS
```

## 7.2 Verify caller process (Windows)

ACL melindungi pipe **access**, tapi tidak verifikasi **identitas binary** yang connect. Tambahkan:

```csharp title="HermesServices/HermesServiceEngine/Rpc/PeerVerifier.cs"
using System;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace HermesServiceEngine.Rpc;

[SupportedOSPlatform("windows")]
public static class PeerVerifier
{
    /// <summary>
    /// Verifikasi proses yang terhubung adalah HermesNetwork.exe yang ditandatangani.
    /// </summary>
    public static void Verify(Stream stream)
    {
        if (stream is not NamedPipeServerStream pipe)
            throw new InvalidOperationException("Not a NamedPipeServerStream");

        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var clientPid))
            throw new InvalidOperationException("Cannot get client PID");

        var process = System.Diagnostics.Process.GetProcessById((int)clientPid);
        var exePath = process.MainModule?.FileName
            ?? throw new InvalidOperationException("Cannot read client exe path");

        // 1. Whitelist nama executable
        var fileName = Path.GetFileName(exePath);
        if (!string.Equals(fileName, "HermesNetwork.exe", StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException($"Unexpected client: {fileName}");

        // 2. Verifikasi signature Authenticode
        if (!AuthenticodeVerifier.IsSignedByExpectedPublisher(exePath))
            throw new UnauthorizedAccessException($"Client not properly signed: {exePath}");
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeClientProcessId(IntPtr Pipe, out uint ClientProcessId);
}
```

```csharp title="HermesServices/HermesServiceEngine/Rpc/AuthenticodeVerifier.cs"
using System.Security.Cryptography.X509Certificates;

namespace HermesServiceEngine.Rpc;

public static class AuthenticodeVerifier
{
    // Replace dengan thumbprint sertifikat code signing milik tim
    private const string ExpectedThumbprint = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";

    public static bool IsSignedByExpectedPublisher(string filePath)
    {
        try
        {
            var cert = X509Certificate.CreateFromSignedFile(filePath);
            var cert2 = new X509Certificate2(cert);
            return string.Equals(cert2.Thumbprint, ExpectedThumbprint,
                System.StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }
}
```

> Untuk verifikasi penuh chain trust + revocation, gunakan `WinVerifyTrust` Win32 API (lebih ketat tapi kompleks). Untuk MVP, thumbprint check cukup.

Panggil `PeerVerifier.Verify(stream)` di `HermesRpcHost.HandleClientAsync` **sebelum** `rpc.StartListening()`.

## 7.3 Verify caller (macOS / Linux)

Untuk UDS, gunakan **`SO_PEERCRED`** (Linux) atau **`LOCAL_PEERCRED`** (macOS) via `Socket.GetSocketOption`:

```csharp title="HermesServices/HermesServiceEngine/Rpc/UnixPeerVerifier.cs"
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace HermesServiceEngine.Rpc;

public static class UnixPeerVerifier
{
    public static void Verify(Socket socket, int expectedUid)
    {
        // Linux: SO_PEERCRED returns ucred {pid, uid, gid}
        // macOS: LOCAL_PEERCRED returns xucred
        // Gunakan getsockopt P/Invoke — code disesuaikan per OS

        var peerUid = GetPeerUid(socket);
        if (peerUid != expectedUid)
            throw new System.UnauthorizedAccessException(
                $"Peer uid {peerUid} mismatch (expected {expectedUid})");
    }

    private static int GetPeerUid(Socket socket)
    {
        // Implementasi platform-specific via P/Invoke ke getsockopt
        // (detail diluar scope — ada library Mono.Posix atau snippet di referensi)
        throw new System.NotImplementedException("See references for implementation");
    }
}
```

Pada macOS modern, kombinasikan dengan **`SecCodeCheckValidity`** untuk verifikasi code signature dari pid client.

## 7.4 Logging dengan redaksi

Tambahkan trace listener custom:

```csharp title="HermesServices/HermesServiceEngine/Rpc/RedactingTraceSource.cs"
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace HermesServiceEngine.Rpc;

public sealed class RedactingTraceListener : TraceListener
{
    private static readonly Regex PrivateKeyRegex =
        new(@"PrivateKey\s*=\s*[A-Za-z0-9+/=]+", RegexOptions.Compiled);
    private static readonly Regex Base64SecretRegex =
        new(@"[A-Za-z0-9+/]{40,}={0,2}", RegexOptions.Compiled);

    public override void Write(string? message) =>
        HermesServiceEngine.Log.HelpReport.LogInfo(Redact(message));
    public override void WriteLine(string? message) =>
        HermesServiceEngine.Log.HelpReport.LogInfo(Redact(message));

    private static string Redact(string? input)
    {
        if (string.IsNullOrEmpty(input)) return input ?? "";
        input = PrivateKeyRegex.Replace(input, "PrivateKey=<REDACTED>");
        input = Base64SecretRegex.Replace(input, "<REDACTED_SECRET>");
        return input;
    }
}
```

Pasang di host:

```csharp
var rpc = new JsonRpc(handler)
{
    TraceSource = new TraceSource("HermesRpc", SourceLevels.Information)
};
rpc.TraceSource.Listeners.Add(new RedactingTraceListener());
```

## 7.5 Rate limiting (opsional)

Untuk mitigasi DoS dari proses lokal yang sah-tapi-buggy, tambahkan throttle di server:

```csharp
private readonly SemaphoreSlim _rateLimit = new(initialCount: 10, maxCount: 10);

public async Task<RpcResult> StartXdrAsync(string config, CancellationToken ct)
{
    if (!await _rateLimit.WaitAsync(0, ct))
        return RpcResult.Fail("Rate limit exceeded");
    try { /* ... */ }
    finally { _rateLimit.Release(); }
}
```

## Checklist

- [ ] `WorldSid` benar-benar dihapus dari ACL
- [ ] `PeerVerifier.Verify(stream)` dipanggil sebelum `StartListening`
- [ ] Thumbprint sertifikat di-config (jangan hardcode di repo public!)
- [ ] `RedactingTraceListener` aktif
- [ ] (macOS) `UnixPeerVerifier` diimplementasikan
- [ ] Rate limit di method yang sensitif
