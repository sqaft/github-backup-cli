# Faz 3 — `s3` hedefi

**Durum:** Bekliyor

## Amaç

Snapshot'lar S3 uyumlu bir bucket'a (AWS S3, R2, B2, MinIO) `local` ile aynı düzende yüklenir ve saklama uygulanır.

## Ön koşullar

- Faz 2 tamamlandı.

## Kapsam

- `targets/s3.ts` (`targets/index.ts`'teki yer tutucunun yerine; `Target` arayüzü `cleanupIncomplete` dahil): `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` `Upload` (stream). Config: `bucket`, `prefix`, `endpoint`, `region` (varsayılan `us-east-1`), `forcePathStyle`, `accessKeyId`, `secretAccessKey`, `keep`.
- Kimlik önceliği: config → `GHBACKUP_S3_*` env → SDK varsayılan zinciri.
- `latestManifest`: `ListObjectsV2` (sayfalı) ile `<prefix>/<repoKey>/` altındaki `.json`'lar, en yenisi `GetObject`.
- Yükleme sırası: bundle, lfs.tar (varsa), manifest.
- Silme: `DeleteObjects` (1000'lik gruplar).
- Ön kontrol: `backup` başında her s3 hedefi için `HeadBucket`; erişim yoksa hedef adı ve hata ile çıkış 2.
- Hata mesajlarında anahtarlar maskelenir.
- CI: `ci.yml`'e MinIO servis container'ı (`minio/minio`, `minioadmin`/`minioadmin`), test bucket'ı test kurulumu oluşturur.

## Kapsam dışı

- LFS (Faz 4). Sunucu tarafı şifreleme, storage class gibi ileri S3 ayarları.

## Görevler

- [ ] Doğrulama: MinIO'nun GitHub Actions servis container'ı olarak çalıştırılma biçimini (komut argümanı `server /data` verilemiyorsa `bitnami/minio` gibi alternatif veya adım içinde `docker run`) resmi dokümandan doğrula ve `ci.yml`'i buna göre yaz.
- [ ] `targets/s3.ts`.
- [ ] `GHBACKUP_TEST_S3_ENDPOINT` varsa çalışan entegrasyon testleri: yükleme, `latestManifest`, değişmeyen repo, saklama, 1000+ anahtar sayfalama (sahte küçük dosyalarla), path-style.
- [ ] Birim testi: kimlik önceliği, prefix normalizasyonu (baş/son `/`).
- [ ] `HeadBucket` ön kontrolü + hata mesajı.
- [ ] CI'da MinIO.

## 👤 Kullanıcı aksiyonları

- [ ] 👤 Kullanacağın S3 uyumlu servisi seç, bucket oluştur, yalnızca o bucket'a okuma/yazma/silme yetkili erişim anahtarı üret ve config'ine ekle.
- [ ] 💻 Kendi makinende gerçek bucket'a `backup --target <s3-adın> --include '<kendi-kullanıcın>/*'` çalıştır; bir bundle'ı indirip `git clone` ile doğrula.

## Kabul kriterleri

- MinIO entegrasyon testleri CI'da geçer.
- Aynı repo için `local` ve `s3` hedeflerinde dosya adları ve manifest içerikleri aynı düzendedir.
- Yanlış kimlikle `backup` çıkış 2 ve maskelenmiş anlaşılır mesaj verir.

## Açık sorular

- Yok.

## Devam notları

_Henüz başlanmadı._ Faz 2'den devralınanlar için [faz-02-mirror-ve-local.md](faz-02-mirror-ve-local.md) **Devam notları**'na bak: `Target` arayüzü (`targets/types.ts`, `cleanupIncomplete` dahil), `createTarget`'taki `s3` yer tutucusu, `applyRetention`, `HeadBucket` ön kontrolünün takılacağı yer ve test yardımcıları.
