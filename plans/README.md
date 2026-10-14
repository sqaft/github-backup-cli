# github-backup-cli — Plan

`gh` ile oturum açılmış hesabın kişisel repolarını ve üyesi olduğu tüm organizasyonların repolarını (wiki ve LFS nesneleriyle) yerel diske ve/veya S3 uyumlu bir bucket'a yedekleyen, her çalıştırmada yalnızca değişenleri yeni snapshot olarak ekleyen bir Node.js/TypeScript CLI (`github-backup`). Amaç, GitHub hesabı veya repo kaybına karşı tüm git geçmişinin bağımsız, geri yüklenebilir bir kopyasını tutmak.

**Planlama:** Tamamlandı

## Özellikler

- **Repo keşfi ve `list`:** `gh` ile kişisel ve üye olunan tüm org repoları (private, arşivli, fork dahil) listelenir; include/exclude glob ve arşiv/fork filtreleri. (Faz 1)
- **Yapılandırma:** JSON config + `GHBACKUP_*` env + bayraklar; öncelik bayrak > env > dosya. (Faz 1)
- **Mirror önbelleği:** her repo bare mirror olarak tutulur ve artımlı fetch edilir; silinen branch/repo yedekte kalır; `refs/pull/*` alınmaz. (Faz 2)
- **Wiki yedeği:** wiki'si olan repoların wiki reposu da yedeklenir. (Faz 2)
- **Bundle snapshot'ları:** ref'ler değiştiyse `git bundle` + manifest; hedef ve repo başına son N snapshot tutulur. (Faz 2)
- **`local` hedefi:** snapshot'lar bir dizine yazılır. (Faz 2)
- **Dayanıklı çalışma:** paralel işleme, yeniden deneme, hata olunca devam, özet ve çıkış kodları, eşzamanlı çalıştırma kilidi. (Faz 2)
- **`s3` hedefi:** S3 uyumlu her servise multipart yükleme. (Faz 3)
- **Git LFS:** LFS nesneleri snapshot başına tar olarak yedeklenir; `git-lfs` yoksa hata, `--no-lfs` ile atlanır. (Faz 4)
- **Genişletilebilir yapı:** kaynaklar (git servisleri) ve hedefler (depolama) arayüzlerle ayrılır; yeni tür çekirdeği değiştirmeden eklenir. (Faz 1–3)
- **Dokümantasyon:** kurulum, config referansı, cron/launchd, geri yükleme. (Faz 5)

## Kapsam dışı

- Issue, PR, yorum, release ve asset gibi GitHub metadata'sı: ilk sürüm yalnızca git verisi, wiki ve LFS.
- GitHub dışındaki git servisleri ve `local`/`s3` dışındaki depolamalar: ilk sürümde yok, mimari bunlara hazır.
- GitHub Enterprise: yalnızca github.com.
- Collaborator olunan başka kullanıcıların repoları: yalnızca kendi hesabın ve üye olunan org'lar.
- `restore` komutu: geri yükleme README'de git komutlarıyla anlatılır.
- Dahili zamanlayıcı/daemon: zamanlama cron/launchd ile yapılır.
- GitHub ile birebir eşitleme (silinen repo/branch'i yedekten silme): yedeğin amacı kaybı önlemek.
- npm yayını: araç repodan kurulur.
- Windows desteği.

## Belgeler

| Belge | İçerik |
| --- | --- |
| [mimari.md](mimari.md) | Teknik altyapı |
| [kararlar.md](kararlar.md) | Kararlar ve gerekçeleri |
| [developer-todos.md](../developer-todos.md) | Kullanıcıdan ve yerel bilgisayardan beklenen işler |

## Fazlar

Fazlar tablodaki sırayla uygulanır; sıranın tek kaynağı bu tablodur. Her faz tek bir geliştirme oturumunda bitirilebilecek büyüklüktedir. Geliştirme `/plans-development` ile kalınan yerden devam eder.

| Faz | Başlık | Durum | Dosya |
| --- | --- | --- | --- |
| 1 | İskelet, config ve `list` | Tamamlandı | [faz-01-iskelet-ve-list.md](faz-01-iskelet-ve-list.md) |
| 2 | Mirror, snapshot ve `local` hedefi | Tamamlandı | [faz-02-mirror-ve-local.md](faz-02-mirror-ve-local.md) |
| 3 | `s3` hedefi | Bekliyor | [faz-03-s3.md](faz-03-s3.md) |
| 4 | Git LFS | Bekliyor | [faz-04-lfs.md](faz-04-lfs.md) |
| 5 | Dokümantasyon ve son kontrol | Bekliyor | [faz-05-dokuman-ve-son-kontrol.md](faz-05-dokuman-ve-son-kontrol.md) |

## Çalışma kuralları

- Dil: `plans/` Türkçe; kod, yorumlar, kök README, CLI çıktısı ve commit mesajları İngilizce.
- Çekirdek (`src/core`) belirli bir kaynak veya hedef türünü bilmez; türlere özel kod yalnızca `src/sources/*` ve `src/targets/*` içindedir.
- Dış komutlar yalnızca `util/exec.ts` üzerinden ve argüman dizisiyle çağrılır (shell yok).
- Kullanıcının global git config'i hiçbir koşulda değiştirilmez.
- Token ve S3 anahtarları loglanmaz, hata mesajlarında maskelenir.
- Her faz sonunda `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` temiz ve CI yeşil olmalı.
- Yeni davranış testle gelir; git işlemleri gerçek geçici repolarla test edilir.
- Test S3 kimliği (MinIO `minioadmin`) CI workflow'unda sabit yazılır; başka secret yönetimi kullanılmaz.

## Açık noktalar

- Yok.
