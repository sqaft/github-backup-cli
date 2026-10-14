# Faz 5 — Dokümantasyon ve son kontrol

**Durum:** Bekliyor

## Amaç

Kullanıcı README'yi okuyarak aracı kurup, yapılandırıp, cron ile zamanlayıp yedekten geri yükleyebilir.

## Ön koşullar

- Faz 4 tamamlandı. Geri yükleme (LFS dahil) adımları [faz-04-lfs.md](faz-04-lfs.md) **Devam notları**'nda.

## Kapsam

- Kök `README.md` (İngilizce): ne yapar, gereksinimler (`node >=22`, `git`, `gh` + `gh auth login`, `git-lfs`), kurulum (clone, `npm ci`, `npm run build`, `npm link`), hızlı başlangıç (`github-backup list`, `github-backup backup --local ~/backups`), config referansı (tüm alanlar, env değişkenleri, bayraklar, öncelik), hedef düzeni ve manifest, saklama, çıkış kodları, cron ve launchd örnekleri, geri yükleme (bundle'dan klon, wiki, LFS tar), S3 sağlayıcı örnekleri (AWS, R2, B2, MinIO), sınırlamalar (metadata yok, GHE yok, `refs/pull/*` yok), plana bağlantı.
- Yeni kaynak/hedef ekleme rehberi: `CONTRIBUTING.md` (arayüzler, kayıt, şema dalı, test beklentisi).
- `--help` metinlerinin README ile tutarlılığı.
- `REPO.md` güncellenir (birlikte güncellenecek dosyalar listesi).

## Kapsam dışı

- Yeni özellik.

## Görevler

- [ ] README.
- [ ] `CONTRIBUTING.md`.
- [ ] `--help` çıktılarını gözden geçir.
- [ ] Planı ve `REPO.md`'yi kodla karşılaştır; tutarsızlıkları düzelt.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 README'deki cron örneğiyle zamanlanmış yedeği kendi makinende kur ve bir gece sonra özetini kontrol et.

## Kabul kriterleri

- README'deki her komut ve config alanı kodda vardır (gözden geçirme ile).
- README'deki geri yükleme adımları entegrasyon testindeki adımlarla aynıdır.
- CI yeşil.

## Açık sorular

- Yok.

## Devam notları

_Henüz yok._
