# Öğrenilenler

## 2026-10-14 — MinIO resmi imajı kalktı; CI'da S3Proxy
`minio/minio` Docker Hub'dan kaldırıldı (MinIO ücretsiz imaj dağıtımını durdurdu, repo arşivlendi). S3 entegrasyon testleri CI'da `andrewgaul/s3proxy` (filesystem backend, kimlik env ile) servis container'ına karşı çalışır; yerelde aynı sunucu Maven Central'daki `org.gaul:s3proxy` fat jar'ıyla (Java yeterli, Docker gerekmez) başlatılır. Kullanıcıların kendi barındırdığı MinIO hâlâ desteklenen bir S3 uç noktasıdır.

## 2026-10-14 — AWS SDK v3 varsayılan olarak CRC32 sağlama toplamı ekler
Üçüncü parti S3 servisleri bu başlıkları reddedebildiği için istemci `requestChecksumCalculation` ve `responseChecksumValidation` için `WHEN_REQUIRED` ile oluşturulur; `DeleteObjects` gibi zorunlu kılan işlemler yine sağlama toplamı gönderir.

## 2026-10-14 — LFS testleri için sunucu gerekmez: standalone file transfer
`git-lfs` yerleşik `lfs-standalone-file` aktarımıyla `lfs.url=file://<dizin>` bir LFS sunucusu gibi kullanılabilir (`lfs.standalonetransferagent=lfs-standalone-file`). Dizin var olan bir git dizini (ör. `git init --bare`) olmalıdır; aksi halde "chdir" veya "not a git repository" hatası gelir. Nesneler `<dizin>/lfs/objects` altına yazılır. Bare mirror'da `git lfs fetch --all` LFS'siz repoda da hata vermez ve boş bir `lfs/` bırakır; "LFS var mı" kontrolü dizinin değil dosyanın varlığına bakmalıdır.

## 2026-11-04 — LFS'li bundle düz `git clone` ile açılmaz
`git lfs install` yapılmış makinede `filter.lfs` global ve `required=true` olduğu için bundle'dan klon checkout sırasında LFS nesnesini indirmeye çalışır; bundle'da LFS sunucusu olmadığından "smudge filter lfs failed" ile düşer. Klon `GIT_LFS_SKIP_SMUDGE=1` ile alınır, tar `.git` altına açılır, sonra `git lfs checkout` çalıştırılır. İzole `HOME` kullanan test global filtreyi görmediği için hatayı kaçırıyordu; test artık `git lfs install --skip-repo` ile gerçek koşulu kurar.

## 2026-11-04 — Küçük `git fetch` `--progress` ile bile yüzde yazmaz
`fetch.unpackLimit` (varsayılan 100) altındaki fetch'lerde git nesneleri `unpack-objects` ile açar ve iş hızlı bittiği için yüzde satırı çıkmaz; yalnızca büyük fetch'ler `Receiving objects: N%` yazar. Yüzdeye bağlı test küçük depoda `fetch.unpackLimit=1` ister. Bu satırlar çevrilebildiği için `--progress` çağrıları `LC_ALL=C` ile çalışır.
