# github-backup-cli — Plan

`gh` ile oturum açılmış hesabın kişisel repolarını ve üyesi olduğu tüm organizasyonların repolarını (wiki'leriyle birlikte) yerel diske ve/veya S3 uyumlu bir bucket'a yedekleyen, her çalıştırmada yedeği güncelleyen bir Node.js/TypeScript CLI. Amaç, GitHub hesabı veya repo kaybına karşı tüm git geçmişinin bağımsız bir kopyasını tutmak.

**Planlama:** Devam ediyor

## Özellikler

- **Repo keşfi:** `gh` ile kişisel ve üye olunan tüm org repoları (private dahil) listelenir. (Faz TBD)
- **Yerel mirror:** her repo bare mirror olarak klonlanır, sonraki çalıştırmalarda artımlı fetch edilir; silinen branch ve repolar yedekte kalır. (Faz TBD)
- **Wiki yedeği:** wiki'si olan repoların wiki reposu da mirror edilir. (Faz TBD)
- **S3 yedeği:** her repo git bundle olarak S3 uyumlu bucket'a (AWS S3, Cloudflare R2, Backblaze B2, MinIO vb.) yüklenir; ref'ler değişmediyse yükleme atlanır; repo başına son N snapshot tutulur. (Faz TBD)

## Kapsam dışı

- Issue, PR, yorum, release ve asset gibi GitHub metadata'sı: ilk sürüm yalnızca git verisi + wiki.
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

- S3 anahtar düzeni ve snapshot saklama: önerilen `<prefix>/<owner>/<repo>/<UTC zaman damgası>.bundle`, ref'ler değiştiyse yeni bundle, repo başına son N (varsayılan 7).
- Yapılandırma: config dosyası biçimi ve yeri, CLI komutları ve bayrakları.
- Filtreler: arşivlenmiş repolar, fork'lar, include/exclude desenleri.
- Git kimlik doğrulaması (private repo klonlama için `gh` token'ının git'e verilmesi), Git LFS.
- Paralellik, hata yönetimi, loglama, çıkış kodları.
- Node sürümü, paket yöneticisi, dağıtım (npm yayını mı, repodan çalıştırma mı).
- Test, lint, format, typecheck ve CI.
- Dil kuralları; `REPO.md` durum ve tür satırları.
- Fazlar.
