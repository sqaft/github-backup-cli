# Mimari

## Yığın

- Dil: TypeScript, çalışma ortamı Node.js.
- Dış araçlar: `gh` (kimlik doğrulama ve repo listesi), `git` (mirror, fetch, bundle). İkisi de kullanıcının makinesinde kurulu olmalıdır.
- S3: S3 uyumlu her servis; endpoint ayarlanabilir.

## Genişletilebilirlik

- `Source` arayüzü: bir git servisinden yedeklenecek repoları listeler ve klon URL'sini ve kimlik bilgisini sağlar. İlk uygulama: `github` (`gh` CLI).
- `Target` arayüzü: bundle yükleme, mevcut snapshot'ları listeleme, silme. İlk uygulamalar: `local`, `s3`.
- Çekirdek (keşif → mirror → bundle → hedeflere yükleme → saklama) kaynak ve hedef türünden bağımsızdır. Yeni kaynak/hedef yalnızca yeni bir modül ve config türü ekler.

## Akış

1. `gh` ile kişisel repolar ve üye olunan org'ların repoları listelenir.
2. Her repo için yerel bare mirror güncellenir (yoksa `git clone --mirror`, varsa prune'suz fetch). Wiki varsa aynısı wiki reposu için yapılır.
3. S3 hedefi açıksa, ref'leri son yüklenen bundle'dan farklı olan repolar için `git bundle` oluşturulup yüklenir; eski snapshot'lar saklama sayısına göre silinir.

## Veri

- Yerel: bare mirror klasörleri. Yerel hedef aynı zamanda S3 için önbellektir.
- S3: repo başına tarihli git bundle'lar.
- Silinen repo ve branch'ler yedekten silinmez.
