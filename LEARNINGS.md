# Öğrenilenler

## 2026-10-14 — Skill'in model ve effort ayarı yalnızca o tur için geçerli
`SKILL.md`'deki `model` ve `effort` alanları yalnızca skill'in çağrıldığı turu etkiler; kullanıcı yeni mesaj yazınca oturumun modeline dönülür. Çok turlu `plans-brainstorm` sohbeti Opus 5.5 xhigh'da kalsın diye aynı ayar `.claude/settings.json`'da da verilir. Tek turda biten `plans-development` ise kendi `opusplan` ve `high` ayarını frontmatter'dan alır.

## 2026-10-14 — Bulut oturumları kullanıcı düzeyindeki CLAUDE.md'yi yüklemez
Claude Code bulut oturumlarında `~/.claude/CLAUDE.md` bulunmaz. Yalnızca repodaki `CLAUDE.md`, `.claude/skills` ve `.claude/settings.json` gelir. Bu yüzden planlama ve geliştirme skill'leri uyulması gereken kuralları (credential'lar, git, doküman güncelliği, geriye dönük uyumluluk) kendi içinde taşır. Bulut ortamı `CLAUDE_CODE_REMOTE=true` ile tanınır.

## 2026-10-14 — MinIO resmi imajı kalktı; CI'da S3Proxy
`minio/minio` Docker Hub'dan kaldırıldı (MinIO ücretsiz imaj dağıtımını durdurdu, repo arşivlendi). S3 entegrasyon testleri CI'da `andrewgaul/s3proxy` (filesystem backend, kimlik env ile) servis container'ına karşı çalışır; yerelde aynı sunucu Maven Central'daki `org.gaul:s3proxy` fat jar'ıyla (Java yeterli, Docker gerekmez) başlatılır. Kullanıcıların kendi barındırdığı MinIO hâlâ desteklenen bir S3 uç noktasıdır.

## 2026-10-14 — AWS SDK v3 varsayılan olarak CRC32 sağlama toplamı ekler
Üçüncü parti S3 servisleri bu başlıkları reddedebildiği için istemci `requestChecksumCalculation` ve `responseChecksumValidation` için `WHEN_REQUIRED` ile oluşturulur (K-035); `DeleteObjects` gibi zorunlu kılan işlemler yine sağlama toplamı gönderir.

## 2026-10-14 — LFS testleri için sunucu gerekmez: standalone file transfer
`git-lfs` yerleşik `lfs-standalone-file` aktarımıyla `lfs.url=file://<dizin>` bir LFS sunucusu gibi kullanılabilir (`lfs.standalonetransferagent=lfs-standalone-file`). Dizin var olan bir git dizini (ör. `git init --bare`) olmalıdır; aksi halde "chdir" veya "not a git repository" hatası gelir. Nesneler `<dizin>/lfs/objects` altına yazılır. Bare mirror'da `git lfs fetch --all` LFS'siz repoda da hata vermez ve boş bir `lfs/` bırakır; "LFS var mı" kontrolü dizinin değil dosyanın varlığına bakmalıdır.
