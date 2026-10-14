# Kararlar

Projenin güncel kararları. Bir karar değişirse satırı güncellenir ve tarihi yenilenir. Geçersiz kalan karar silinir. Numaralar yeniden kullanılmaz.

| # | Tarih | Karar | Gerekçe |
| --- | --- | --- | --- |
| K-001 | 2026-10-14 | Yedeklenecek repolar `gh` ile kimliği doğrulanmış hesabın kişisel repoları ve üye olduğu tüm org'ların repolarıdır (private dahil). | Kullanıcı isteği; `gh` zaten kurulu ve oturum açık olduğundan ayrı token yönetimi gerekmez. |
| K-002 | 2026-10-14 | Yedek içeriği: tüm git verisi (branch, tag, geçmiş) ve varsa wiki reposu. Metadata kapsam dışı. | İlk sürüm hızlı çıksın; metadata API limitleri ve süreyi artırır. |
| K-003 | 2026-10-14 | Hedefler: yerel disk ve S3 uyumlu her servis (endpoint ayarlanabilir). | AWS S3, R2, B2, MinIO aynı kodla desteklenir. |
| K-004 | 2026-10-14 | Dil ve ortam: Node.js + TypeScript. | Kullanıcı tercihi. |
| K-005 | 2026-10-14 | Çalıştırma elle veya kullanıcının cron/launchd'si ile; araç içinde zamanlayıcı yok. | En basit ve her ortamda çalışır. |
| K-006 | 2026-10-14 | S3'e repo başına tek git bundle yüklenir; ref'leri değişmeyen repo yeniden yüklenmez. | Tek dosya, `git clone x.bundle` ile kolay geri yükleme; yerel mirror sayesinde fetch artımlı. |
| K-007 | 2026-10-14 | S3'te tarihli snapshot'lar tutulur, eskileri araç siler (son N). | Kullanıcı tercihi; bucket versioning'e bağımlı kalmaz. |
| K-008 | 2026-10-14 | GitHub'da silinen repo ve branch'ler yedekte kalır; fetch prune yapmaz. | Yedeğin amacı kaybı önlemek. |
