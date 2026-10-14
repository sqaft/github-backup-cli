# Faz 5 — Dokümantasyon ve son kontrol

**Durum:** Tamamlandı

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

- [x] README.
- [x] `CONTRIBUTING.md`.
- [x] `--help` çıktılarını gözden geçir.
- [x] Planı ve `REPO.md`'yi kodla karşılaştır; tutarsızlıkları düzelt.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 README'deki cron örneğiyle zamanlanmış yedeği kendi makinende kur ve bir gece sonra özetini kontrol et.

## Kabul kriterleri

- README'deki her komut ve config alanı kodda vardır (gözden geçirme ile).
- README'deki geri yükleme adımları entegrasyon testindeki adımlarla aynıdır.
- CI yeşil.

## Açık sorular

- Yok.

## Devam notları

Faz tamamlandı; kalan tek iş yukarıdaki 💻 maddesi (cron örneğiyle zamanlanmış yedeği gerçek makinede kurmak) ve Faz 1–4'ten kalan 💻 elle doğrulamalar (`developer-todos.md`).

Yapılan: kök `README.md` baştan yazıldı (kurulum, hızlı başlangıç, bayrak ve çıkış kodu tabloları, config ve env referansı, S3 sağlayıcı tablosu, snapshot düzeni ve manifest, cron ve launchd örnekleri, geri yükleme, sınırlamalar); `CONTRIBUTING.md` eklendi (yeni kaynak/hedef rehberi); `src/program.ts` yardım metinlerine varsayılanlar eklendi ve `test/unit/commands.test.ts`'e yardım bayrağı testi konuldu; `mimari.md` dizin yapısına belgeler, `REPO.md`'ye `--help` ↔ README bağı eklendi.

Doğrulananlar: README'deki config örneği ve `config.example.json` `configSchema`'dan geçer; README'deki `GHBACKUP_*` değişkenleri `load.ts`'dekilerle birebir aynı; bayraklar `--help` çıktısıyla eşleşir; geri yükleme adımları `test/integration/lfs.test.ts` (klon, tar'ı `.git`'e açma, `git lfs checkout`) ve `local-target.test.ts` ile aynıdır. lint, typecheck, test, build temiz. S3 testleri bu ortamda sunucu olmadığı için atlandı (CI'da çalışır).

Doğrulanamayanlar: cron ve launchd örnekleri gerçek bir makinede denenmedi (README'deki `aws s3 cp` geri yükleme komutu ve B2/R2 endpoint biçimleri de gerçek servisle denenmedi).
