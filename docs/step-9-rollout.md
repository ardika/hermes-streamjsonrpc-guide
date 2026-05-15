---
sidebar_position: 12
title: 'Step 9 — Rollout Plan'
---

# Step 9 — Rollout Plan

Migrasi IPC privileged berisiko: salah konfigurasi = service tidak bisa diperintah, atau worse — exposed ke proses non-trusted.

## 9.1 Strategi: dual-stack dengan feature flag

Selama 1–2 release cycle, jalankan **dua-duanya** paralel.

```csharp title="Shared/FeatureFlags.cs"
public static class FeatureFlags
{
    // Toggle via registry, env var, atau config file
    public static bool UseStreamJsonRpc =>
        Environment.GetEnvironmentVariable("HERMES_USE_RPC") == "1";
}
```

Di service startup:

```csharp
if (FeatureFlags.UseStreamJsonRpc)
    await rpcHost.StartAsync();
else
    _ = legacyIpc.StartIpcLoopAsync();
```

Di UI:

```csharp
if (FeatureFlags.UseStreamJsonRpc)
    await HermesRpcClient.Instance.StartAsync();
else
    _ = legacyIpcReceiver.StartListening();
```

## 9.2 Tahap rollout

| Tahap | Audiens | Kriteria pindah ke tahap berikutnya |
|---|---|---|
| **0. Dev** | Engineer aktif | Unit + integration test green di Windows |
| **1. Internal alpha** | Tim Hermes (10 user) | 1 minggu tanpa regresi; metric: 0 disconnect tak terjelaskan, < 100ms p95 RPC |
| **2. Closed beta** | 50 user pilihan (flag ON via installer override) | 2 minggu; bug rate ≤ legacy |
| **3. GA opt-in** | Semua user, flag default OFF, dapat di-toggle | 4 minggu, ≥ 30% opt-in tanpa bug critical |
| **4. GA default ON** | Default ON, legacy masih bisa di-toggle | 4 minggu |
| **5. Legacy removed** | Semua | Tidak ada bug report yang butuh legacy |

## 9.3 Observability selama rollout

Tambah metrics:

- `hermes_rpc_connect_duration_ms` (histogram)
- `hermes_rpc_call_duration_ms{method}` (histogram)
- `hermes_rpc_call_total{method,result}` (counter: success / fail / cancelled)
- `hermes_rpc_disconnects_total{reason}` (counter)
- `hermes_rpc_reconnects_total` (counter)
- `hermes_rpc_event_pushed_total{event}` (counter)

Log struktural dengan correlation id (gunakan `Activity` / `System.Diagnostics.ActivitySource`).

## 9.4 Rollback plan

**Skenario kegagalan & action:**

| Gejala | Action |
|---|---|
| UI tidak bisa connect | Set `HERMES_USE_RPC=0` via remote config; restart UI |
| Service crash terus-menerus saat RPC active | Toggle env var di service, restart Windows Service |
| Bug security ditemukan di transport | Hotfix release; rollback flag ke OFF |
| Performance regression | Profile dulu, jangan rollback otomatis |

Selama feature flag masih ada, rollback < 5 menit.

## 9.5 Cleanup setelah GA stabil

Setelah tahap 5:

- [ ] Hapus `HermesNetwork/Conn/IpcComService.cs` (141 baris)
- [ ] Hapus `HermesServices/HermesServiceEngine/Conn/IpcComService.cs` (456 baris)
- [ ] Hapus `HermesNetwork/Models/IpcMessageCommand.cs` & `IpcMessageResult.cs` (kalau tidak dipakai event bus lagi)
- [ ] Hapus konstanta `IpcConst` yang hanya untuk routing
- [ ] Hapus `FeatureFlags.UseStreamJsonRpc` & semua branch `if (flag)`
- [ ] Update dokumentasi internal & onboarding

## 9.6 Komunikasi

- **Release notes**: "Improved IPC reliability with industry-standard JSON-RPC framing. No user action required."
- **Internal docs**: link ke guide ini di Confluence/Notion tim.
- **Support team brief**: cara baca log baru, cara toggle flag manual.

## Checklist final

- [ ] Feature flag wired di kedua sisi
- [ ] Metrics + struktur log siap
- [ ] Rollback drill di staging — < 5 menit
- [ ] Release notes draft
- [ ] Support team trained
- [ ] Go/no-go meeting per tahap
