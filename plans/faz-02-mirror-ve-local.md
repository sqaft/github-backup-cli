# Faz 2 — Mirror, snapshot ve `local` hedefi

**Durum:** Tamamlandı

## Amaç

`github-backup backup` uçtan uca çalışır: repolar ve wiki'ler önbellekte mirror edilir, değişenler için bundle snapshot'ı `local` hedefe yazılır, eski snapshot'lar temizlenir.

## Ön koşullar

- Faz 1 tamamlandı.

## Kapsam

- [mimari.md](mimari.md) `backup` akışının 1, 3–10. adımları (LFS adımı hariç; LFS Faz 4).
- `core/mirror.ts`: bare init, remote ve refspec ayarı (`refs/heads/*`, `refs/tags/*`), prune'suz fetch; kaynaktan gelen `gitEnv()` ile.
- Wiki: `hasWiki` ise `<repo>.wiki`; "not found" → `skipped: no wiki`.
- `core/snapshot.ts`: ref özeti, `git bundle create --all`, manifest üretimi.
- `Target` arayüzü ve `targets/local.ts` (`.partial` + `rename`; manifest en son).
- Saklama: hedef/repo başına `keep`; manifest'siz yarım dosyaların temizliği.
- `core/run.ts`: `concurrency` sınırlı paralellik, 2 yeniden deneme (1 sn, 5 sn), repo × hedef sonuçları, özet, çıkış kodları.
- `core/lock.ts`: PID'li kilit; canlı kilitte çıkış 3; ölü PID devralma.
- SIGINT/SIGTERM temizliği.
- `--target`, `--local`, `--keep`, `--no-wiki`, `--cache-dir`, `--concurrency`, `--json` bayrakları çalışır.
- Hedef yoksa çıkış 2 ("no targets configured; use --local <path> or add targets to config").

## Kapsam dışı

- `s3` hedefi (Faz 3), LFS (Faz 4).

## Görevler

- [x] Test kaynağı (`test/helpers/git.ts`: `TestRemote`, `repoInfo`, `fakeSource`, `isolatedExec`): verilen `file://` bare repolarını `RepoInfo` olarak döndüren sahte `Source`.
- [x] `core/mirror.ts` + entegrasyon testi: ilk clone, yeni commit sonrası fetch, uzakta silinen branch'in mirror'da kalması, `refs/pull/*`'ın alınmaması.
- [x] `core/snapshot.ts` + testler: aynı ref'ler → aynı özet; bundle'dan `git clone` ile geri yüklenen repoda tüm branch ve tag'ler.
- [x] `targets/local.ts` + testler: yazma, `latestManifest`, listeleme, silme, yarım dosya temizliği.
- [x] Saklama mantığı + birim testi.
- [x] `core/lock.ts` + test.
- [x] `core/run.ts` + entegrasyon testi: 3 repo, biri bozuk URL → diğer ikisi yedeklenir, çıkış 1, özet doğru; ikinci çalıştırmada değişiklik yoksa yeni snapshot yok (`unchanged`).
- [x] Wiki akışı + test (wiki repo var / yok).
- [x] `commands/backup.ts` bağlanır; `--json` özeti.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 Kendi makinende `node dist/cli.js backup --local ~/git-backup-test --include '<kendi-kullanıcın>/*'` çalıştır; bir bundle'ı `git clone <bundle> /tmp/x` ile açıp doğrula. Private bir repo da dahil olsun (gh kimlik doğrulamasının çalıştığını kanıtlar). İkinci çalıştırmada özetin `unchanged` göstermesini kontrol et.

## Kabul kriterleri

- Entegrasyon testleri: geri yüklenen repo, kaynak repoyla aynı `git for-each-ref` çıktısına sahip.
- Değişmeyen repo ikinci çalıştırmada yeni dosya üretmez; `keep: 2` ile 3 değişiklikten sonra 2 snapshot kalır.
- Bozuk repo diğerlerini durdurmaz; çıkış kodu 1; `--json` özeti başarısız repoyu listeler.
- Eşzamanlı ikinci çalıştırma çıkış 3 verir.
- Global git config'e dokunulmaz (test, `HOME`'u geçici dizine alıp `~/.gitconfig` oluşmadığını kontrol eder).
- CI yeşil.

## Açık sorular

- Yok.

## Devam notları

Kod tarafı bitti. Lint, typecheck, test (178) ve build temiz. Kabul kriterlerinin tamamı otomatik testlerle doğrulandı (`test/integration/backup.test.ts`, `mirror-snapshot.test.ts`, `local-target.test.ts`; `test/unit/lock|retention|async.test.ts`). Açık kalan tek madde gerçek `gh` oturumuyla elle deneme (yukarıdaki 💻; bulutta `gh` oturumu yok). Bu denemede `refs/pull/*` yüzünden beklenmedik bir şey çıkarsa `core/mirror.ts` refspec'lerine bak.

Faz 3 (s3) için:

- `Target` arayüzü `targets/types.ts`'te: `latestManifest`, `putSnapshot` (bundle/lfsTar yerel yol, manifest nesne; manifest en son yazılır), `listSnapshots` (yalnızca manifest'i olanlar, eskiden yeniye), `deleteSnapshot` (manifest önce), `cleanupIncomplete`. S3 uygulaması aynısını yapmalı; saklama mantığı `core/retention.ts` `applyRetention`'da ve hedeften bağımsız.
- `targets/index.ts` `createTarget`'ta `s3` dalı şimdilik `ConfigError("... s3 targets are not available yet")` fırlatır; Faz 3'te `createS3Target` ile değiştirilecek. `HeadBucket` ön kontrolü için `commands/backup.ts`'te `createTarget`'tan sonra, `checkGit` yanına (kilitten önce, çıkış 2) bir `checkAccess` adımı eklenmeli; arayüze isteğe bağlı `checkAccess?()` eklenebilir.
- `local` hedefinin `.partial` + `rename` mantığının S3 karşılığı: `Upload` tamamlanana kadar nesne görünmez; sıra aynı (bundle, lfs.tar, manifest). `cleanupIncomplete` S3'te yalnızca manifest'siz bundle/lfs.tar nesnelerini silmeli (tamamlanmamış multipart yüklemeler ayrıca `AbortMultipartUpload` ister).
- Test yardımcıları: `test/helpers/git.ts` (`TestRemote`, `fakeSource`, `isolatedExec`); `test/integration/backup.test.ts` içindeki `setup()` `--local` kullanıyor, S3 testleri aynı kalıbı config dosyası veya env ile kurabilir. Her `now()` çağrısı sahte saatte 1 sn ilerler; gerçek saatte aynı saniyede iki snapshot aynı `stamp`'i alırdı (repo başına çalıştırma başına tek snapshot olduğundan sorun değil).

Faz 4 (LFS) için:

- Takılacak yerler `core/run.ts` `processUnit`: `syncMirror`'dan sonra `git lfs fetch --all origin` (git zaten kaynağın `gitEnv()`'iyle çalışıyor); `createBundle` çağrısının yanında `lfs.tar` üretimi ve `SnapshotFiles.lfsTar` / `ManifestInput.lfsTarBytes` (ikisi de hazır). `BackupInput`'a `lfs: boolean` eklenmeli; `commands/backup.ts` `config.lfs`'i geçirmeli ve `checkGit` yanına `git lfs version` ön koşulunu eklemeli (çıkış 2, `--no-lfs` önerisi).
- `local` hedefi `.lfs.tar`'ı bundle ile birlikte yazar, siler ve manifest'siz bırakılanı temizler (testli); LFS tarafında yalnızca üretim kalıyor. Wiki repolarında LFS adımı atlanmalı (`unit.kind === "wiki"`).
- Bu ortamda `git-lfs` 3.4.1 kurulu; Faz 4 entegrasyon testi yerelde çalıştırılabilir.

Genel notlar: `--keep` yalnızca genel değeri belirler, hedefteki `keep` onu ezer (K-032). `exec`'in `signal` seçeneği Node'un `spawn({signal})`'ini kullanır; iptalde hata kodu `ABORT_ERR`'dir. Özet, repo ve wiki'yi ayrı birim sayar. Mirror dizini `<cacheDir>/<source>/<owner>/<repo>.git`, wiki `<repo>.wiki.git`; geçici bundle'lar `<cacheDir>/tmp/unit-*` altındadır ve her çalıştırma sonunda silinir.
