# Faz 6 — İlk kurulum soruları

**Durum:** Tamamlandı

## Amaç

Kullanıcı elle JSON yazmadan ilk yedeğini alır: config dosyası yoksa `backup` hedefleri terminalde sorar, dosyayı yazar ve aynı çalıştırmada devam eder.

## Ön koşullar

- Faz 3 tamamlandı (`checkAccess`, S3 hedefi).

## Kapsam

- `backup` başında eksik config için sorular; K-038'deki koşullar.
- S3 sağlayıcı seçenekleri: Cloudflare R2, AWS S3, Backblaze B2, diğer; `local` hedefi.
- Hedef hatalarında (`no targets configured`, `unknown target`) aranan config yolunun gösterilmesi.

## Kapsam dışı

- Ayrı `init` komutu (K-011).
- Hedef dışındaki ayarların (`include`, `keep` vb.) sorulması.
- Var olan config dosyasının düzenlenmesi.

## Görevler

- [x] `util/prompt.ts`: gizli girişli terminal soruları.
- [x] `TargetSetup` ve `TARGET_SETUPS`; `local` ve `s3` soruları.
- [x] `commands/setup.ts`: akış, doğrulama, erişim denemesi, `0600` yazma.
- [x] Hedef hatalarında eksik config yolu.
- [x] Birim testleri ve pty ile gerçek terminal denemesi.
- [x] README, `CONTRIBUTING.md`, `REPO.md`, plan belgeleri.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 Config dosyası yokken `backup --target r2` çalıştırıp soruları gerçek R2 bilgileriyle yanıtla.

## Kabul kriterleri

- Terminalde config yokken `backup` sorar, dosyayı `0600` izinle yazar ve yedeğe devam eder.
- TTY yokken soru sorulmaz; çıkış 2 ve hata mesajı eksik dosyanın yolunu içerir.
- `--local`, `list` ve var olan config dosyası soru açmaz.
- Secret yazılırken görünmez; iptalde dosya yazılmaz ve çıkış 130 olur.

## Açık sorular

- Yok.

## Devam notları

Faz tamamlandı; kalan tek iş yukarıdaki 💻 maddesi. Gerçek terminal akışı pty ile yerel hedef ve sahte R2 hesabıyla denendi; gerçek R2 bucket'ına bağlanılmadı.
