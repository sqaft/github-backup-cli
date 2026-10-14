# Faz 3 — `s3` hedefi

**Durum:** Tamamlandı

## Amaç

Snapshot'lar S3 uyumlu bir bucket'a (AWS S3, R2, B2, MinIO vb.) `local` ile aynı düzende yüklenir ve saklama uygulanır.

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
- CI: `ci.yml`'e S3Proxy servis container'ı (`andrewgaul/s3proxy`, kimlik `test-access`/`test-secret`; `minio/minio` Docker Hub'dan kalktığı için, bkz. K-025); test bucket'ını entegrasyon testleri oluşturur.

## Kapsam dışı

- LFS (Faz 4). Sunucu tarafı şifreleme, storage class gibi ileri S3 ayarları.

## Görevler

- [x] Doğrulama: `minio/minio` imajı kalktığı için CI'da S3Proxy; `services.<id>` `command`/`entrypoint`/`options` destekler, S3Proxy argümansız çalışır.
- [x] `targets/s3.ts`.
- [x] `GHBACKUP_TEST_S3_ENDPOINT` varsa çalışan entegrasyon testleri: yükleme, `latestManifest`, değişmeyen repo, saklama, 1000+ anahtar sayfalama (sahte küçük dosyalarla), path-style.
- [x] Birim testi: kimlik önceliği, prefix normalizasyonu (baş/son `/`).
- [x] `HeadBucket` ön kontrolü + hata mesajı.
- [x] CI'da S3Proxy.

## 👤 Kullanıcı aksiyonları

- [ ] 👤 Kullanacağın S3 uyumlu servisi seç, bucket oluştur, yalnızca o bucket'a okuma/yazma/silme yetkili erişim anahtarı üret ve config'ine ekle.
- [ ] 💻 Kendi makinende gerçek bucket'a `backup --target <s3-adın> --include '<kendi-kullanıcın>/*'` çalıştır; bir bundle'ı indirip `git clone` ile doğrula.

## Kabul kriterleri

- S3 entegrasyon testleri (S3Proxy) CI'da geçer.
- Aynı repo için `local` ve `s3` hedeflerinde dosya adları ve manifest içerikleri aynı düzendedir.
- Yanlış kimlikle `backup` çıkış 2 ve maskelenmiş anlaşılır mesaj verir.

## Açık sorular

- Yok.

## Devam notları

Kod tarafı bitti. Doğrulananlar:

- Lint, typecheck, test ve build temiz. S3 entegrasyon testleri (15 test) yerelde S3Proxy 4.1.1'e karşı geçti. CI (Node 22 ve 24, S3Proxy servis container'ı) yeşil.
- Kabul kriterleri: `local` ve `s3` aynı dosya adları/manifest içeriği (`test/integration/s3-target.test.ts`), yanlış kimlikle `backup` çıkış 2 ve maskelenmiş mesaj (hem sunucusuz `test/unit/s3-target.test.ts` hem entegrasyon).
- Açık kalan tek madde gerçek bir bucket'la elle deneme (yukarıdaki 👤/💻; bulutta gerçek bucket ve `gh` oturumu yok).

Sonraki faz (Faz 4, LFS) için:

- `Target` arayüzü ve `local`/`s3` hedefleri `lfsTar`'ı zaten yazıyor, siliyor ve manifest'siz bırakılanı temizliyor (`s3`'te `.lfs.tar` büyük nesne için multipart'tan geçer; 20 MiB'lık dosya testle doğrulandı). Faz 4'te yalnızca üretim kalıyor: Faz 2 devam notlarındaki "Faz 4 (LFS) için" bölümüne bak.
- S3 entegrasyon testlerini yerelde koşmak için: Docker olmadan `java -jar s3proxy-4.1.1-jar-with-dependencies.jar --properties s3proxy.conf` (conf: `s3proxy.endpoint=http://127.0.0.1:9000`, `s3proxy.authorization=aws-v2-or-v4`, `s3proxy.identity=test-access`, `s3proxy.credential=test-secret`, `jclouds.provider=filesystem`, `jclouds.filesystem.basedir=<dizin>`), sonra `GHBACKUP_TEST_S3_ENDPOINT=http://127.0.0.1:9000 GHBACKUP_TEST_S3_ACCESS_KEY_ID=test-access GHBACKUP_TEST_S3_SECRET_ACCESS_KEY=test-secret npm test`.
- Yarım multipart temizliği en iyi çabadır (K-036); S3Proxy `ListMultipartUploads`'ı destekliyor mu, testlerde ayrıca doğrulanmadı (yalnızca hatanın saklamayı bozmadığı sahte istemciyle test edildi).
