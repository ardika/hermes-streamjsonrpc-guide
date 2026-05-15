---
sidebar_position: 13
title: Troubleshooting
---

# Troubleshooting

## Connection issues

### `TimeoutException: Could not connect to pipe within 5000ms`

**Penyebab umum:**
- Service helper belum start. Cek: `sc query HermesServiceEngine` (Windows).
- ACL menolak. Cek event viewer Security log.
- Pipe name beda antara client & server. Pastikan `IpcEndpoint.PipeName` sama.

**Fix:**
```powershell
sc start HermesServiceEngine
# Tail log:
Get-Content "C:\ProgramData\Hermes\Logs\engine.log" -Wait
```

### `UnauthorizedAccessException` saat connect (Windows)

Pipe ACL Anda terlalu ketat dan user UI bukan `Interactive`. Cek:

```powershell
[System.Security.Principal.WindowsIdentity]::GetCurrent().Groups |
  ForEach-Object { $_.Translate([System.Security.Principal.NTAccount]) }
```

Pastikan ada `NT AUTHORITY\INTERACTIVE`. Kalau Anda run UI via `runas` atau scheduled task, user mungkin tidak interactive — gunakan SID user spesifik di ACL.

### macOS: `Permission denied` di `/var/run/hermes-rpc.sock`

- Pastikan helper jalan sebagai root.
- File mode harus `0600` dan owned by user yang sama dengan UI process. Kalau helper root tapi UI user biasa, gunakan group SID:
  ```csharp
  File.SetUnixFileMode(_path,
      UnixFileMode.UserRead | UnixFileMode.UserWrite |
      UnixFileMode.GroupRead | UnixFileMode.GroupWrite);
  // + chown ke group "hermes" yang berisi user UI
  ```

## Serialization issues

### `RemoteSerializationException: cannot deserialize ...`

DTO Anda punya field yang tidak supported (e.g., `IntPtr`, delegate). Pakai POCO sederhana atau `record` saja.

### Enum di-serialize sebagai number, bukan string

Tambahkan `JsonStringEnumConverter`:

```csharp
var formatter = new SystemTextJsonFormatter();
formatter.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
```

## Disconnect / reconnect

### Client reconnect loop tidak berhenti meskipun server up

Cek log: kemungkinan `ConnectAsync` lempar exception tipe khusus (e.g., timeout) yang Anda anggap retryable, padahal `UnauthorizedAccessException` harus stop-and-alert. Tambah classification di reconnect loop:

```csharp
catch (UnauthorizedAccessException) { /* don't retry, surface to user */ throw; }
catch (TimeoutException) { /* retry */ }
```

### Server log spam `Pipe broken` setiap 30 detik

Client lama (pre-migration) yang masih connect. Cek client process list:

```powershell
Get-Process | Where-Object { $_.Name -like "*Hermes*" }
```

Hentikan instance lama.

## Performance

### Latency tinggi per call (>50ms)

- Pastikan **tidak ada** `await Task.Delay()` di server side request handler kecuali memang diperlukan.
- Cek apakah pakai `LengthHeaderMessageHandler` (efisien) bukan `HeaderDelimitedMessageHandler` (sedikit lebih lambat).
- Profile dengan dotnet-trace.

### Throughput rendah saat Kcptun streaming log

Notification one-way (`NotifyAsync`) tidak menunggu ack — kalau lambat, kemungkinan UI thread saturated. Pakai `Channel<T>` + batch (lihat [Step 6](./step-6-events-push#64-ui-throttling)).

## Build / packaging

### `NamedPipeServerStreamAcl` tidak ditemukan di Linux build

ACL pipe Windows-only. Bungkus di `[SupportedOSPlatform("windows")]` dan kondisional di factory (sudah dilakukan di Step 3).

### Package conflict `System.Text.Json`

StreamJsonRpc transitively reference `System.Text.Json` versi tertentu. Kalau project Anda lock ke versi berbeda, tambah di csproj:

```xml
<PackageReference Include="System.Text.Json" Version="8.0.5" />
```

(samakan dengan minor version StreamJsonRpc).

## Logging

### Private key masih muncul di log

`RedactingTraceListener` belum aktif untuk source yang relevan. Pastikan:

```csharp
rpc.TraceSource.Listeners.Add(new RedactingTraceListener());
rpc.TraceSource.Switch.Level = SourceLevels.Information;
```

Dan pastikan domain log (`HelpReport.LogInfo`) juga di-redact — buat wrapper.
