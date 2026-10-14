# Faz 1 — İskelet, config ve `list`

**Durum:** Tamamlandı

## Amaç

Çalışan bir TypeScript CLI iskeleti, config yükleme ve `github-backup list` komutu. Faz sonunda kullanıcı, `gh` oturumuyla yedeklenecek tüm repoları filtreleriyle birlikte listeleyebilir.

## Ön koşullar

- Yok.

## Kapsam

- Proje iskeleti: `package.json` (`"type": "module"`, `engines.node: ">=22"`, `bin.github-backup: dist/cli.js`), `tsconfig.json` (strict, NodeNext), `biome.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc` (24). npm script'leri: `build`, `dev` (`tsx src/cli.ts`), `lint`, `format`, `typecheck`, `test`.
- [mimari.md](mimari.md) dizin yapısındaki `cli.ts`, `commands/list.ts`, `config/*`, `core/discover.ts`, `sources/*`, `util/exec.ts`, `util/log.ts`, `util/filter.ts`.
- `commands/backup.ts` bu fazda yalnızca komut kaydı ve "not implemented" hatası (çıkış 2) içerir; bayraklar tanımlı olur.
- Config: [mimari.md](mimari.md) Yapılandırma bölümündeki şema, varsayılanlar, env eşlemeleri, bayrak > env > dosya > varsayılan önceliği, `~`/env genişletme, `XDG_CONFIG_HOME`. Hatalı config'te zod hatası alan yoluyla birlikte okunur biçimde yazılır, çıkış 2. Config dosyası yoksa varsayılanlarla devam edilir; `--config` ile verilen dosya yoksa hata.
- Config dosyası grup/diğer okunabilir ve S3 anahtarı içeriyorsa uyarı.
- `Source` arayüzü ve `github` kaynağı ([mimari.md](mimari.md) Kaynak: `github`): ön koşul kontrolü (`gh` yok → kurulum linkiyle hata; `gh auth status` başarısız → `gh auth login` talimatıyla hata), kullanıcı + org'lar + `gh repo list` ile listeleme, `gitEnv()`.
- Org listelenemezse (ör. SSO) uyarı, diğerleri devam, `list` çıkış kodu 1.
- Aynı `fullName` birden çok kez gelirse tekilleştirilir.
- Filtreler: include/exclude glob (büyük/küçük harf duyarsız), `archived`, `forks`.
- `list` çıktısı: hizalı tablo (`REPO`, `ARCHIVED`, `FORK`, `WIKI`, `EMPTY`), sonda `N repositories`. `--json` ile `RepoInfo[]`.
- `config.example.json` repoda.
- CI: `.github/workflows/ci.yml`, Node 22 ve 24 matrisinde `npm ci`, lint, typecheck, test, build.

## Kapsam dışı

- Mirror, snapshot, hedefler (Faz 2–3), LFS (Faz 4), README kullanım kılavuzu (Faz 5).

## Görevler

- [x] Doğrulama: `gh repo list --json` alanlarının (`nameWithOwner`, `isArchived`, `isFork`, `hasWikiEnabled`, `isEmpty`, `url`) mevcut `gh` sürümünde olduğunu `gh repo list --json` (alan listesi yazdırır) veya resmi kılavuzdan doğrula; farklıysa mimari.md'yi güncelle.
- [x] İskelet ve araç yapılandırması; `npm run lint/typecheck/test/build` boş projede geçer.
- [x] `util/exec.ts`: komut, argüman dizisi, env, timeout; stdout/stderr yakalama; sıfır olmayan çıkışta komut adını ve stderr'i içeren hata.
- [x] `util/log.ts`: seviye (`quiet`/`normal`/`verbose`), stderr'e zaman damgalı satırlar, gizli değer maskeleme.
- [x] Config şeması, yükleme ve birleştirme + birim testleri (öncelik, env boolean ayrıştırma, `~` genişletme, hatalı alan mesajı).
- [x] `util/filter.ts` + birim testleri.
- [x] `sources/github.ts` + sahte `exec` ile birim testleri (sayfalı org çıktısı, boş org, org hatası, tekilleştirme).
- [x] `commands/list.ts` (tablo ve `--json`) + birim testi.
- [x] `commands/backup.ts` iskeleti ve tüm bayrakların tanımı.
- [x] `config.example.json`.
- [x] `ci.yml`.

## 👤 Kullanıcı aksiyonları

- [ ] 💻 Kendi makinende `npm ci && npm run build && node dist/cli.js list` çalıştırıp listenin beklediğin repoları (kişisel + tüm org'lar) içerdiğini kontrol et.

## Kabul kriterleri

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` hatasız; CI yeşil.
- Birim testleri config önceliğini (bayrak > env > dosya > varsayılan) kanıtlar.
- `gh` yokken veya oturum kapalıyken `list` anlaşılır mesaj ve çıkış 2 verir (sahte `exec` ile test).
- `node dist/cli.js list --json --exclude 'org/*'` filtrelenmiş JSON üretir (birim testinde sahte kaynakla).
- `node dist/cli.js backup` "not implemented" ile çıkış 2 verir.

## Açık sorular

- Yok.

## Devam notları

Kod tarafı bitti; bu ortamda doğrulanabilen tüm kabul kriterleri sağlandı (lint, typecheck, test, build temiz; `gh` yokken ve oturum kapalıyken `list` çıkış 2; `backup` "not implemented" ile çıkış 2; `list --json --exclude 'org/*'` birim testinde filtrelenmiş JSON üretir; config önceliği testli).

- Açık kalan: gerçek `gh` oturumuyla `list` denemesi (kullanıcı aksiyonu 💻, bulutta `gh` oturumu yok). `node dist/cli.js list` kişisel repoları ve tüm org'ları göstermeli; bir org SSO yetkisi istiyorsa uyarı + çıkış 1 beklenir.
- Faz 2 için hazır olanlar: `Exec` tipi (`util/exec.ts`, git komutları için de kullanılacak; `ExecError.code` `ENOENT`/`ETIMEDOUT` dönebilir), `Logger` (`debug` yalnızca `--verbose`), `CommandDeps` (`commands/context.ts`), `prepare()` (config + logger), `discoverRepos()` (`sources` haritası `gitEnv()` için), `ConfigError`/`PrerequisiteError`/`CliError`/`ExitCode` (`util/errors.ts`; `program.ts` bunları çıkış koduna çevirir).
- `commands/backup.ts` yalnızca stub; `BackupOptions` şimdilik `CommonOptions` ile aynı, Faz 2'de `ConfigFlags`'in (cacheDir, concurrency, keep, wiki, lfs, target, local) zaten kapsadığı alanlar kullanılır. `git` varlığının kontrolü (`git --version`) `backup`'ın ön koşul adımına Faz 2'de eklenecek (`list` yalnızca `gh` ister).
- Config'te `keep` çözümü (hedef `keep` > genel `keep`) henüz bir yardımcıya bağlanmadı; hedef şemasında `keep` isteğe bağlı kalır. Faz 2'de tek fonksiyonla çözülmeli.
- Araç sürümleri: TypeScript 7, Vitest 5, Biome 2.5, commander 15, zod 4. Hepsi sorunsuz çalıştı. Biome'da `rules.preset` kullanılır (`recommended` alanı kaldırılıyor).
- CI yalnızca `.github/workflows/ci.yml` ile Node 22/24 matrisinde çalışır; MinIO servisi Faz 3'te eklenecek.
- Test `config.example.json`'un şemaya uyduğunu doğrular; şema değişirse örnek dosya, mimari.md ve README birlikte güncellenmeli (`REPO.md`).
