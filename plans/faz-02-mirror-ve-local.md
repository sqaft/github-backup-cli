# Faz 2 — Mirror, snapshot ve `local` hedefi

**Durum:** Bekliyor

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

- [ ] Test kaynağı (`test/` altında): verilen `file://` bare repolarını `RepoInfo` olarak döndüren sahte `Source`.
- [ ] `core/mirror.ts` + entegrasyon testi: ilk clone, yeni commit sonrası fetch, uzakta silinen branch'in mirror'da kalması, `refs/pull/*`'ın alınmaması.
- [ ] `core/snapshot.ts` + testler: aynı ref'ler → aynı özet; bundle'dan `git clone` ile geri yüklenen repoda tüm branch ve tag'ler.
- [ ] `targets/local.ts` + testler: yazma, `latestManifest`, listeleme, silme, yarım dosya temizliği.
- [ ] Saklama mantığı + birim testi.
- [ ] `core/lock.ts` + test.
- [ ] `core/run.ts` + entegrasyon testi: 3 repo, biri bozuk URL → diğer ikisi yedeklenir, çıkış 1, özet doğru; ikinci çalıştırmada değişiklik yoksa yeni snapshot yok (`unchanged`).
- [ ] Wiki akışı + test (wiki repo var / yok).
- [ ] `commands/backup.ts` bağlanır; `--json` özeti.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 Kendi makinende `node dist/cli.js backup --local ~/git-backup-test --include '<kendi-kullanıcın>/*'` çalıştır; bir bundle'ı `git clone <bundle> /tmp/x` ile açıp doğrula. Private bir repo da dahil olsun (gh kimlik doğrulamasının çalıştığını kanıtlar).

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

_Henüz yok._
