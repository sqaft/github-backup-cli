# github-backup-cli — Plan

`gh` ile oturum açılmış hesabın kişisel repolarını ve üyesi olduğu tüm organizasyonların repolarını (wiki'leriyle birlikte) yerel diske ve/veya S3 uyumlu bir bucket'a yedekleyen, her çalıştırmada yedeği güncelleyen bir Node.js/TypeScript CLI. Amaç, GitHub hesabı veya repo kaybına karşı tüm git geçmişinin bağımsız bir kopyasını tutmak.

**Planlama:** Devam ediyor

## Özellikler

- **Repo keşfi:** `gh` ile kişisel ve üye olunan tüm org repoları (private dahil) listelenir. (Faz TBD)
- **Yerel mirror:** her repo bare mirror olarak klonlanır, sonraki çalıştırmalarda artımlı fetch edilir; silinen branch ve repolar yedekte kalır. (Faz TBD)
- **Wiki yedeği:** wiki'si olan repoların wiki reposu da mirror edilir. (Faz TBD)
- **S3 yedeği:** her repo git bundle olarak S3 uyumlu bucket'a (AWS S3, Cloudflare R2, Backblaze B2, MinIO vb.) yüklenir; ref'ler değişmediyse yükleme atlanır; repo başına son N snapshot tutulur. (Faz TBD)

- **Genişletilebilir yapı:** kaynaklar (git servisleri) ve hedefler (depolama) eklenti arayüzleriyle ayrılır; ilk sürümde `github`, `local`, `s3`. (Faz TBD)
- **Git LFS:** LFS nesneleri snapshot başına tar olarak yedeklenir; `git-lfs` yoksa hata, `--no-lfs` ile atlanır. (Faz TBD)

## Kapsam dışı

- GitHub dışındaki git servisleri ve S3/yerel dışındaki depolamalar: ilk sürümde yok, mimari bunlara hazır.

- Issue, PR, yorum, release ve asset gibi GitHub metadata'sı: ilk sürüm yalnızca git verisi + wiki.
- GitHub Enterprise: yalnızca github.com.
- Dahili zamanlayıcı/daemon: zamanlama kullanıcının cron/launchd'si ile yapılır.
- GitHub ile birebir eşitleme (silinen repo/branch'i yedekten silme): yedeğin amacı kaybı önlemek.

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

## Çalışma kuralları

- Henüz netleşmedi.

## Açık noktalar

- Config alanlarının ve bayrakların tam listesi.
- Paralellik, hata yönetimi, loglama, çıkış kodları.
- Node sürümü, paket yöneticisi, dağıtım (npm yayını mı, repodan çalıştırma mı).
- Test, lint, format, typecheck ve CI.
- Dil kuralları; `REPO.md` durum ve tür satırları.
- Fazlar.
