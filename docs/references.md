---
sidebar_position: 14
title: References
---

# References

## StreamJsonRpc

- [GitHub repo](https://github.com/microsoft/vs-streamjsonrpc)
- [Getting started guide](https://github.com/microsoft/vs-streamjsonrpc/blob/main/doc/getting_started.md)
- [Sending requests](https://github.com/microsoft/vs-streamjsonrpc/blob/main/doc/sendrequest.md)
- [Receiving requests](https://github.com/microsoft/vs-streamjsonrpc/blob/main/doc/recvrequest.md)
- [Cancellation](https://github.com/microsoft/vs-streamjsonrpc/blob/main/doc/cancellation.md)
- [Resiliency (disconnection handling)](https://github.com/microsoft/vs-streamjsonrpc/blob/main/doc/resiliency.md)

## Nerdbank.Streams

- [GitHub](https://github.com/AArnott/Nerdbank.Streams)
- [`FullDuplexStream.CreatePair()`](https://github.com/AArnott/Nerdbank.Streams/blob/main/doc/FullDuplexStream.md)
- [`MultiplexingStream` (kalau butuh banyak channel)](https://github.com/AArnott/Nerdbank.Streams/blob/main/doc/MultiplexingStream.md)

## JSON-RPC 2.0 Specification

- [Spec resmi](https://www.jsonrpc.org/specification)

## Windows Named Pipes

- [Named Pipes overview (learn.microsoft.com)](https://learn.microsoft.com/windows/win32/ipc/named-pipes)
- [`NamedPipeServerStreamAcl`](https://learn.microsoft.com/dotnet/api/system.io.pipes.namedpipeserverstreamacl)
- [`GetNamedPipeClientProcessId`](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid)
- [`WinVerifyTrust`](https://learn.microsoft.com/windows/win32/api/wintrust/nf-wintrust-winverifytrust)

## Unix Domain Sockets

- [`UnixDomainSocketEndPoint` (.NET)](https://learn.microsoft.com/dotnet/api/system.net.sockets.unixdomainsocketendpoint)
- [`File.SetUnixFileMode`](https://learn.microsoft.com/dotnet/api/system.io.file.setunixfilemode)
- [macOS `LOCAL_PEERCRED`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man4/unix.4.html)
- [Linux `SO_PEERCRED`](https://man7.org/linux/man-pages/man7/unix.7.html)

## macOS privileged helper

- [`SMAppService.daemon` (Ventura+)](https://developer.apple.com/documentation/servicemanagement/smappservice)
- [Code signing & `SecCodeCheckValidity`](https://developer.apple.com/documentation/security/seccodecheckvalidity)

## Alternatif (untuk eksplorasi lanjutan)

- [gRPC over UDS](https://learn.microsoft.com/aspnet/core/grpc/interprocess-uds)
- [gRPC over Named Pipes](https://learn.microsoft.com/aspnet/core/grpc/named-pipes)
- [MagicOnion (gRPC + C# interface)](https://github.com/Cysharp/MagicOnion)

## Hermes codebase (path referensi di guide ini)

- `HermesNetwork/Conn/IpcComService.cs` — IPC client lama
- `HermesServices/HermesServiceEngine/Conn/IpcComService.cs` — IPC server lama
- `HermesServices/HermesServiceEngine/Modules/ServiceSase.cs` — domain SASE / WireGuard
- `HermesServices/HermesServiceEngine/TunnelService/AppService.cs` — WireGuard tunnel service host
