# Senden beklenenler

Claude'un yapamadığı işler burada toplanır: hesap açma, onay ve karar gibi yalnızca senin yapabileceklerin (👤) ve yerel bilgisayar gerektiren işler (💻). `/plans-development` her oturumda bu listeyi günceller.

- Bitirdiğin maddeyi `[x]` yap ya da oturumda "şunu yaptım" de.
- 💻 maddeleri, `/plans-development`'ı bilgisayarında çalıştırdığında Claude kendisi yapmaya çalışır.

## Şimdi

Sıradaki fazı engelleyen işler.

- Yok.

## Faza göre

### Faz 1 — İskelet, config ve `list`

- [ ] 💻 `npm ci && npm run build && node dist/cli.js list` ile listenin kişisel ve tüm org repolarını içerdiğini kontrol et: bulutta senin `gh` oturumun yok.

### Faz 2 — Mirror, snapshot ve `local` hedefi

- [ ] 💻 `npm ci && npm run build && node dist/cli.js backup --local ~/git-backup-test --include '<kendi-kullanıcın>/*'` çalıştır, bir bundle'ı `git clone <bundle> /tmp/x` ile aç ve private repo dahil olduğunu kontrol et; komutu tekrar çalıştırınca özetin `unchanged` göstermesini doğrula: gerçek `gh` oturumu gerekir, bulutta yok.

### Faz 3 — `s3` hedefi

- [ ] 👤 S3 uyumlu servisi seç, bucket oluştur, yalnızca o bucket'a yetkili erişim anahtarı üret ve config'ine ekle.
- [ ] 💻 Gerçek bucket'a yedek alıp bir bundle'ı indirerek doğrula.

### Faz 4 — Git LFS

- [ ] 💻 LFS kullanan bir repo varsa yedekleyip README'deki adımlarla geri yükle.

### Faz 5 — Dokümantasyon ve son kontrol

- [ ] 💻 README'deki cron örneğiyle zamanlanmış yedeği kur ve ertesi gün özeti kontrol et.
