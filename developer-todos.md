# Senden beklenenler

Claude'un yapamadığı işler burada toplanır: hesap açma, onay ve karar gibi yalnızca senin yapabileceklerin (👤) ve yerel bilgisayar gerektiren işler (💻). `/plans-development` her oturumda bu listeyi günceller.

- Bitirdiğin maddeyi `[x]` yap ya da oturumda "şunu yaptım" de.
- 💻 maddeleri, `/plans-development`'ı bilgisayarında çalıştırdığında Claude kendisi yapmaya çalışır.

## Şimdi

Sıradaki fazı engelleyen işler.

- Yok.

## Faza göre

### Faz 1 — İskelet, config ve `list`

- [x] 💻 `npm ci && npm run build && node dist/cli.js list` ile listenin kişisel ve tüm org repolarını içerdiğini kontrol et: bulutta senin `gh` oturumun yok.

### Faz 2 — Mirror, snapshot ve `local` hedefi

- [x] 💻 `npm ci && npm run build && node dist/cli.js backup --local ~/git-backup-test --include '<kendi-kullanıcın>/*'` çalıştır, bir bundle'ı `git clone <bundle> /tmp/x` ile aç ve private repo dahil olduğunu kontrol et; komutu tekrar çalıştırınca özetin `unchanged` göstermesini doğrula: gerçek `gh` oturumu gerekir, bulutta yok.

### Faz 3 — `s3` hedefi

- [ ] 👤 S3 uyumlu servisi seç, bucket oluştur, yalnızca o bucket'a yetkili (`s3:ListBucket`, `GetObject`, `PutObject`, `DeleteObject`, isteğe bağlı `ListBucketMultipartUploads`/`AbortMultipartUpload`) erişim anahtarı üret ve config'ine ekle (`chmod 600`).
- [ ] 💻 Gerçek bucket'a `node dist/cli.js backup --target <s3-adın> --include '<kendi-kullanıcın>/*'` çalıştır, bir bundle'ı indirip `git clone <bundle> /tmp/x` ile doğrula; komutu tekrarlayınca özetin `unchanged` göstermesini kontrol et: gerçek bucket ve `gh` oturumu gerekir, bulutta yok.

### Faz 4 — Git LFS

- [ ] 💻 LFS kullanan gerçek bir GitHub reposunu yedekle (erişimin olan repolarda GitHub kod aramasıyla LFS kullanan repo bulunamadı; böyle bir repon olursa dene) (`node dist/cli.js backup --local ~/git-backup-test --include '<owner>/<repo>'`), `<stamp>.lfs.tar` oluştuğunu gör ve [faz-04-lfs.md](plans/faz-04-lfs.md) **Devam notları**'ndaki adımlarla bir LFS dosyasını geri yükleyip sha256'sını orijinalle karşılaştır: gerçek `gh` oturumu ve gerçek LFS sunucusu gerekir, bulutta yok.

### Faz 5 — Dokümantasyon ve son kontrol

- [ ] 💻 README'deki "Scheduling" bölümündeki cron (macOS için launchd) örneğiyle zamanlanmış yedeği kur ve ertesi gün özeti ile çıkış kodunu kontrol et: gerçek makine ve `gh` oturumu gerekir, bulutta yok.
