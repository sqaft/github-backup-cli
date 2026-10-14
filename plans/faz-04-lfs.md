# Faz 4 — Git LFS

**Durum:** Tamamlandı

## Amaç

LFS kullanan repoların LFS nesneleri de yedeklenir: her yeni snapshot'ın yanına `<stamp>.lfs.tar` yazılır.

## Ön koşullar

- Faz 3 tamamlandı.

## Kapsam

- Ön koşul: LFS açıksa (`lfs: true`, varsayılan) `git lfs version` başarısızsa çıkış 2 ve mesaj: git-lfs kurulum linki (https://git-lfs.com) + "or rerun with --no-lfs to skip LFS objects".
- Yeni snapshot gerektiğinde (bundle sonrası) `git lfs fetch --all origin` (kaynağın `gitEnv()`'i ile); wiki birimlerinde LFS yoktur.
- Snapshot: mirror'daki `lfs/objects` dizini boş değilse `tar` paketiyle `lfs/objects/...` yolunu koruyan `<stamp>.lfs.tar`; manifest'e `lfsTarBytes`.
- Ref'ler değişmediyse LFS ayrıca kontrol edilmez (LFS nesneleri ref'lere bağlıdır).
- `--no-lfs` / `lfs: false` / `GHBACKUP_LFS=false`: LFS adımları atlanır, ön koşul kontrol edilmez.
- Geri yükleme yöntemi (Faz 5 README'si için): bundle'dan klon, tar'ı klonun `.git/` dizinine açma, `git lfs checkout`.

## Kapsam dışı

- Snapshot'lar arası LFS tekilleştirme (K-018 gereği her snapshot kendi tar'ını taşır).

## Görevler

- [x] Doğrulama: `git lfs fetch --all` komutunun bare repoda çalıştığını ve nesneleri `<gitdir>/lfs/objects` altına yazdığını resmi kaynaktan veya deneyle doğrula; farklıysa mimari.md ve bu fazı güncelle.
- [x] Doğrulama: yerel test için LFS sunucusu gerektirmeyen bir senaryo bul (ör. `lfs.url` ile `file://` LFS deposu, git-lfs ≥ 3 standalone file transfer); yoksa entegrasyon testini atlanabilir yap ve elle doğrulamaya bırak.
- [x] LFS ön koşulu ve `--no-lfs` + birim testleri.
- [x] Mirror'a `git lfs fetch --all`.
- [x] `lfs.tar` üretimi, iki hedefe yükleme, saklamada birlikte silme.
- [x] Entegrasyon testi (mümkünse): LFS dosyalı repo → snapshot → geri yükleme → dosya içeriği doğru.
- [x] CI'da `git-lfs` kurulu olduğundan emin ol (ubuntu runner'da yoksa `apt-get install git-lfs`).

## 👤 Kullanıcı aksiyonları

- [ ] 💻 LFS kullanan gerçek bir GitHub reposunu kendi makinende yedekle (`github-backup backup --local ~/git-backup-test --include '<owner>/<repo>'`) ve aşağıdaki geri yükleme adımlarıyla bir LFS dosyasını aç, sha256'sını orijinalle karşılaştır: gerçek `gh` oturumu ve gerçek bir LFS sunucusu gerekir, bulutta yok.

## Kabul kriterleri

- `git-lfs` yokken `backup` çıkış 2 verir; `--no-lfs` ile başarılı çalışır.
- LFS'siz repolarda `.lfs.tar` oluşmaz.
- LFS'li test reposunda geri yüklenen dosya orijinalle aynı sha256'ya sahiptir (otomatik test veya elle doğrulama notu).

## Açık sorular

- Yok.

## Devam notları

Faz tamamlandı; kalan tek iş yukarıdaki 💻 maddesi (gerçek GitHub LFS reposuyla elle doğrulama).

Yapılan: `src/core/lfs.ts` (`fetchLfs`, `hasLfsObjects`, `createLfsTar`), `core/run.ts` (`BackupInput.lfs`, LFS yalnızca yeni snapshot gerektiğinde ve `kind === "repo"` için), `commands/backup.ts` (`checkLfs`, `git lfs version` başarısızsa çıkış 2), `test/integration/lfs.test.ts` (sunucusuz düzen: `lfs.url=file://<bare repo>` + `lfs.standalonetransferagent=lfs-standalone-file`), CI'da `git-lfs` kontrolü.

Doğrulananlar: `git lfs fetch --all origin` bare mirror'da çalışır ve nesneleri `<mirror>/lfs/objects` altına yazar; LFS'siz repoda çıkış 0 verir ve `lfs/` boş kalır (bu yüzden `hasLfsObjects` dizinin değil dosyanın varlığına bakar).

Faz 5 README'si için geri yükleme adımları (entegrasyon testindekiyle aynı):

```bash
git clone <stamp>.bundle restored
tar -xf <stamp>.lfs.tar -C restored/.git     # lfs/objects/... klonun .git/lfs/objects altına açılır
cd restored && git lfs install --local && git lfs checkout
```

`.lfs.tar` yalnızca repoda LFS nesnesi varsa vardır; wiki'lerde hiç yoktur. Test düzenini kuran yardımcılar `test/helpers/git.ts` içinde: `enableLfs`, `hasGitLfs`.
