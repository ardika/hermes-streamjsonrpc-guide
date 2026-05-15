---
sidebar_position: 4
title: 'Step 1 — Add Packages'
---

# Step 1 — Add NuGet Packages

Kita akan tambah package ke dua project utama:

- `HermesNetwork` (UI / client)
- `HermesServices/HermesServiceEngine` (service / server)

## 1.1 Locate the csproj files

Dari root repo:

```bash
HermesNetwork/HermesNetwork.csproj
HermesServices/HermesServiceEngine/HermesServiceEngine.csproj
```

## 1.2 Tambah PackageReference

Buka **`HermesNetwork/HermesNetwork.csproj`** dan tambahkan di `<ItemGroup>` PackageReference yang sudah ada:

```xml title="HermesNetwork/HermesNetwork.csproj"
<ItemGroup>
  <!-- ... existing references ... -->
  <PackageReference Include="StreamJsonRpc" Version="2.19.27" />
  <PackageReference Include="Nerdbank.Streams" Version="2.11.74" />
</ItemGroup>
```

Lakukan hal yang sama di **`HermesServices/HermesServiceEngine/HermesServiceEngine.csproj`**.

## 1.3 Restore & verify

```powershell
dotnet restore HermesNetwork/HermesNetwork.csproj
dotnet restore HermesServices/HermesServiceEngine/HermesServiceEngine.csproj
```

Pastikan **target framework** kedua project minimal **`net8.0`** (StreamJsonRpc 2.19+ butuh net6.0+; net8.0 direkomendasikan untuk Hermes karena sudah pakai Avalonia 11).

Cek di csproj:

```xml
<TargetFramework>net8.0</TargetFramework>
```

## 1.4 Buat shared contract project (opsional tapi sangat direkomendasikan)

Saat ini DTO di-duplicate di 3 tempat:

- `HermesNetwork/Models/IpcMessageCommand.cs`
- `HermesServices/HermesServiceEngine/Models/IpcMessageCommand.cs`
- `HermesServices/SaseService/Models/IpcMessageCommand.cs`

Buat project baru **`HermesIpc.Contracts`** yang akan jadi single source of truth untuk:

- Interface RPC (`IHermesRpc`)
- DTO domain (kalau perlu)
- Konstanta (menggantikan `IpcConst.cs` yang juga duplicated)

```powershell
cd HermesServices
dotnet new classlib -n HermesIpc.Contracts -f net8.0
cd ..
dotnet sln HermesNetwork360.sln add HermesServices/HermesIpc.Contracts/HermesIpc.Contracts.csproj
```

Tambahkan reference di kedua project:

```xml title="HermesNetwork/HermesNetwork.csproj"
<ItemGroup>
  <ProjectReference Include="..\HermesServices\HermesIpc.Contracts\HermesIpc.Contracts.csproj" />
</ItemGroup>
```

```xml title="HermesServices/HermesServiceEngine/HermesServiceEngine.csproj"
<ItemGroup>
  <ProjectReference Include="..\HermesIpc.Contracts\HermesIpc.Contracts.csproj" />
</ItemGroup>
```

## 1.5 Sanity check build

```powershell
dotnet build HermesNetwork360.sln
```

Tidak ada error → lanjut ke [Step 2: Define Contracts](./step-2-contracts).

## Checklist

- [ ] Package `StreamJsonRpc` 2.19.27 ditambahkan ke `HermesNetwork`
- [ ] Package `StreamJsonRpc` 2.19.27 ditambahkan ke `HermesServiceEngine`
- [ ] Package `Nerdbank.Streams` 2.11.74 ditambahkan
- [ ] Target framework `net8.0` di kedua project
- [ ] Project `HermesIpc.Contracts` dibuat & direferensikan
- [ ] `dotnet build` sukses tanpa error
