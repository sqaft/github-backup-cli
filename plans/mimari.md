# Mimari

## Yığın

- Dil: TypeScript (strict), ESM. Çalışma ortamı Node.js `>=22` (geliştirme Node 24 LTS ile). Kaynak: nodejs.org/en/about/previous-releases, 2026-10-14 itibarıyla 22 ve 24 LTS.
- Paket yöneticisi: npm (`package-lock.json` repoda).
- Bağımlılıklar:
  - `commander`: komut ve bayrak ayrıştırma.
  - `zod`: config şeması doğrulama.
  - `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`: S3 işlemleri ve multipart yükleme (`Upload` sınıfı; part boyutu en az 5 MB, varsayılan `queueSize` 4 — kaynak: aws-sdk-js-v3 `lib/lib-storage/README.md`, 2026-10-14).
  - `tar`: LFS nesnelerinin tar'lanması (sistem `tar`'ına bağımlı kalmamak için).
- Geliştirme: `typescript`, `vitest`, `@biomejs/biome`, `tsx` (geliştirmede doğrudan çalıştırma), `@types/node` (en düşük desteklenen sürüm olan 22'ye göre).
- Dış araçlar (kullanıcının makinesinde kurulu olmalı): `gh` (oturum açık), `git`, `git-lfs` (LFS açıksa).
- Desteklenen OS: Linux ve macOS. Windows test edilmez.

## Dizin yapısı

```text
src/
  cli.ts                 # giriş noktası (bin: github-backup); programı çalıştırıp çıkış kodunu verir
  program.ts             # commander tanımı, bayraklar, hata → çıkış kodu eşlemesi
  commands/
    context.ts           # CommandDeps (exec, env, stdout/stderr), config + logger hazırlığı
    list.ts
    backup.ts
  config/
    schema.ts            # zod şeması ve varsayılanlar
    load.ts              # dosya + env + bayrak birleştirme
  core/
    discover.ts          # kaynaklardan repo listesi + filtreler
    mirror.ts            # bare mirror clone/fetch, wiki, LFS fetch
    snapshot.ts          # ref özeti, bundle ve lfs.tar üretimi, manifest
    run.ts               # paralel iş akışı, yeniden deneme, özet
    lock.ts              # eşzamanlı çalıştırma kilidi
  sources/
    types.ts             # Source arayüzü
    github.ts            # gh tabanlı GitHub kaynağı
    index.ts             # tür → uygulama kaydı
  targets/
    types.ts             # Target arayüzü
    local.ts
    s3.ts
    index.ts
  util/
    exec.ts              # child_process sarmalayıcısı (timeout, stderr yakalama)
    log.ts               # stderr logger (normal/verbose/quiet)
    filter.ts            # glob eşleştirme
    time.ts              # snapshot zaman damgası
    errors.ts            # ExitCode, CliError, ConfigError, PrerequisiteError
test/
  unit/
  integration/           # geçici git repoları, local hedef, MinIO
```

## Genişletilebilirlik

- `Source` arayüzü:
  - `id`: kaynak türü (`github`). Hedef yollarında ve önbellekte klasör adı olur.
  - `checkPrerequisites()`: gerekli araç ve oturum kontrolü.
  - `listRepos(): Promise<{ repos: RepoInfo[]; failures: { owner, message }[] }>`: `RepoInfo` = `{ source, owner, name, fullName, cloneUrl, wikiUrl?, hasWiki, isArchived, isFork, isEmpty }`. Bir sahibin (ör. SSO'lu org) repoları listelenemezse hata fırlatılmaz, `failures`'a eklenir; çağıran uyarı verir ve çıkış kodu 1 olur.
  - `gitEnv(): Record<string,string>`: git alt süreçlerine verilecek kimlik doğrulama env'i.
- `Target` arayüzü:
  - `name`, `type`, `keep`.
  - `latestManifest(repoKey): Promise<Manifest | null>`
  - `putSnapshot(repoKey, stamp, files: { bundle, manifest, lfsTar? })`
  - `listSnapshots(repoKey): Promise<string[]>` (zaman damgaları)
  - `deleteSnapshot(repoKey, stamp)`
- `repoKey` = `<source.id>/<owner>/<repo>` (wiki için `<source.id>/<owner>/<repo>.wiki`).
- Kaynak türü → uygulama eşlemesi `sources/index.ts` içindeki `createSource` fonksiyonundadır; `core/discover.ts` her kaynak yapılandırması için ön koşulları kontrol eder, listeler ve o kaynağın filtrelerini uygular.
- Dış komut çağıran modüller `Exec` fonksiyon tipini (`util/exec.ts`) bağımlılık olarak alır; testlerde sahte `exec` verilir. Komutlar `CommandDeps` ile `exec`, `env`, `stdout`, `stderr` alır.
- Çekirdek kaynak ve hedef türünden bağımsızdır. Yeni kaynak/hedef: yeni modül + `index.ts` kaydı + zod şemasında yeni `type` dalı.

## Akış

### `list`

1. Config yüklenir, kaynak ön koşulları kontrol edilir.
2. Kaynaklardan repolar listelenir, filtreler uygulanır.
3. Her repo için `fullName`, arşiv/fork/wiki/boş bilgisi (`yes`/`-`) hizalı tablo olarak stdout'a yazılır; sonda toplam (`N repositories`). `--json` ile `RepoInfo[]`.
4. Çıkış kodu: bir sahip listelenemediyse 1, ön koşul/config hatasında 2, aksi halde 0.

### `backup`

1. Config yüklenir. En az bir hedef yoksa hata (çıkış 2).
2. Ön koşullar: `git`, `gh` kurulu ve `gh auth status` başarılı; LFS açıksa `git lfs version` başarılı. Biri eksikse kurulum/oturum talimatıyla hata (çıkış 2). `git-lfs` yoksa mesaj `--no-lfs` seçeneğini de söyler.
3. Önbellek dizininde kilit alınır (`<cacheDir>/.lock`, içinde PID). Kilit canlı bir süreçteyse çıkış 3. Ölü PID'ye ait kilit devralınır.
4. Repolar listelenir ve filtrelenir.
5. Her repo (ve wiki'si) `concurrency` sınırıyla paralel işlenir:
   1. **Mirror:** `<cacheDir>/<source>/<owner>/<repo>.git` yoksa `git init --bare`, `git remote add origin <url>` ve fetch refspec'leri `+refs/heads/*:refs/heads/*` ile `+refs/tags/*:refs/tags/*` olarak ayarlanır (`refs/pull/*` alınmaz). Sonra her çalıştırmada `git fetch origin` (prune yok). `isEmpty` olan repo atlanır (`skipped: empty`).
   2. **LFS:** LFS açıksa `git lfs fetch --all origin`. Repoda LFS nesnesi yoksa adım no-op'tur.
   3. **Ref özeti:** `git for-each-ref --format='%(objectname) %(refname)'` çıktısının sha256'sı.
   4. **Hedef karşılaştırma:** her hedef için `latestManifest`; `refsHash` aynıysa o hedef için `unchanged`.
   5. **Snapshot:** en az bir hedef değişiklik istiyorsa `<cacheDir>/tmp/` altında `git bundle create <file> --all` ve LFS nesnesi varsa `lfs/objects` klasörünün tar'ı oluşturulur.
   6. **Yükleme:** değişiklik isteyen her hedefe `putSnapshot`. Sıra: önce `.bundle` ve `.lfs.tar`, en son `.json` manifest (manifest, snapshot'ın tamamlandığının işaretidir).
   7. **Saklama:** hedefte manifest'i olan snapshot'lar zamana göre sıralanır, `keep`'ten eskiler (bundle, lfs.tar, json) silinir. Manifest'i olmayan yarım kalmış dosyalar da silinir.
   8. Geçici dosyalar silinir.
6. Her adım hata alırsa 2 kez yeniden denenir (1 sn, 5 sn bekleme). Yine başarısızsa repo `failed` olur, diğerleri devam eder.
7. Wiki: `hasWiki` true ise `<repo>.wiki.git` aynı adımlardan geçer. Wiki klonu "repository not found" ile başarısız olursa (wiki açık ama sayfa yok) `skipped: no wiki`, hata sayılmaz.
8. Sonda özet stderr'e: başarılı / değişmedi / atlanan / başarısız sayıları ve başarısızların listesi. `--json` ile özet JSON olarak stdout'a.
9. Çıkış kodu: `0` hepsi başarılı veya atlandı/değişmedi; `1` en az bir repo veya hedef başarısız; `2` config/ön koşul hatası; `3` başka bir çalıştırma sürüyor; `130` SIGINT.
10. SIGINT/SIGTERM: devam eden alt süreçler sonlandırılır, geçici dosyalar ve kilit silinir.

## Kaynak: `github`

- Oturum açan kullanıcı: `gh api user --jq .login`.
- Org'lar: `gh api user/orgs --paginate --jq '.[].login'` (en az `read:org` kapsamı gerekir; `gh auth login` için gereken asgari kapsamlar `repo`, `read:org`, `gist` — kaynak: cli.github.com/manual/gh_auth_login ve docs.github.com REST orgs, 2026-10-14).
- Repolar: her sahip (kullanıcı + org'lar) için `gh repo list <owner> --limit 100000 --json nameWithOwner,isArchived,isFork,hasWikiEnabled,isEmpty,url`. `gh repo list` yalnızca o sahibe ait repoları döndürür (kaynak: cli.github.com/manual/gh_repo_list).
- Başka kullanıcıların collaborator olunan repoları kapsam dışıdır.
- Git kimlik doğrulaması: git alt süreçlerine şu env verilir; global git config değişmez:
  - `GIT_CONFIG_COUNT=2`
  - `GIT_CONFIG_KEY_0=credential.https://github.com.helper`, `GIT_CONFIG_VALUE_0=` (önceki helper'ları sıfırlar)
  - `GIT_CONFIG_KEY_1=credential.https://github.com.helper`, `GIT_CONFIG_VALUE_1=!gh auth git-credential`
  - `GIT_TERMINAL_PROMPT=0`
- Bir org SSO yetkisi gerektiriyorsa ve token yetkili değilse o org'un repoları listelenemez. Bu durumda uyarı verilir, diğer sahipler devam eder ve çıkış kodu 1 olur.

## Hedefler

Ortak düzen (her iki hedefte aynı):

```text
<kök>/<source>/<owner>/<repo>/<stamp>.bundle
<kök>/<source>/<owner>/<repo>/<stamp>.lfs.tar   # yalnızca LFS nesnesi varsa
<kök>/<source>/<owner>/<repo>/<stamp>.json      # manifest
```

- `<stamp>`: UTC, `YYYYMMDDTHHMMSSZ` (sıralanabilir, S3 anahtarında güvenli).
- Manifest: `{ version: 1, source, fullName, stamp, refsHash, refs: [{name, sha}], bundleBytes, lfsTarBytes?, tool: { name, version } }`.
- `local`: `<kök>` = `path`. Dosyalar önce `.partial` uzantısıyla yazılır, sonra `rename`.
- `s3`: `<kök>` = `s3://<bucket>/<prefix>`. `@aws-sdk/lib-storage` `Upload` ile stream yükleme. `endpoint`, `region`, `forcePathStyle` ayarlanabilir (R2, B2, MinIO). Kimlik: config'teki `accessKeyId`/`secretAccessKey`, yoksa `GHBACKUP_S3_ACCESS_KEY_ID`/`GHBACKUP_S3_SECRET_ACCESS_KEY`, yoksa AWS SDK'nın varsayılan zinciri.

## Yapılandırma

Öncelik: CLI bayrağı > env > config dosyası > varsayılan.

Config dosyası: varsayılan `~/.config/github-backup-cli/config.json` (`XDG_CONFIG_HOME` varsa ona göre), `--config <path>` veya `GHBACKUP_CONFIG` ile değişir. Dosya yoksa ve bayraklar yeterliyse sorun değildir. Repoda `config.example.json` bulunur.

```json
{
  "cacheDir": "~/.cache/github-backup-cli",
  "concurrency": 4,
  "wiki": true,
  "lfs": true,
  "keep": 7,
  "sources": [
    {
      "type": "github",
      "include": ["*/*"],
      "exclude": [],
      "archived": true,
      "forks": true
    }
  ],
  "targets": [
    { "type": "local", "name": "disk", "path": "/backups/git" },
    {
      "type": "s3",
      "name": "r2",
      "bucket": "my-backups",
      "prefix": "git",
      "endpoint": "https://ACCOUNT_ID.r2.cloudflarestorage.com",
      "region": "auto",
      "forcePathStyle": false,
      "accessKeyId": "YOUR_ACCESS_KEY_ID",
      "secretAccessKey": "YOUR_SECRET_ACCESS_KEY",
      "keep": 14
    }
  ]
}
```

- `sources` verilmezse varsayılan tek `github` kaynağıdır.
- Hedef başına `keep` genel `keep`'i ezer.
- Şema katı (`strict`): bilinmeyen alan hata verir; hedef adları benzersiz olmalıdır. Hata mesajı alan yolunu içerir (ör. `targets.0.bucket`).
- Bayrak veya env ile verilen `include`/`exclude`/`archived`/`forks` her `github` kaynağının değerini ezer.
- S3 anahtarı için tek istisna: config'te yoksa `GHBACKUP_S3_ACCESS_KEY_ID`/`GHBACKUP_S3_SECRET_ACCESS_KEY` kullanılır (config önce gelir).
- `~` ve env genişletmesi `cacheDir` ve `path` alanlarında yapılır.
- Config dosyası başkaları tarafından okunabiliyorsa (`mode & 0o077`) ve içinde S3 anahtarı varsa uyarı verilir.

Env değişkenleri: `GHBACKUP_CONFIG`, `GHBACKUP_CACHE_DIR`, `GHBACKUP_CONCURRENCY`, `GHBACKUP_WIKI`, `GHBACKUP_LFS`, `GHBACKUP_KEEP`, `GHBACKUP_INCLUDE` / `GHBACKUP_EXCLUDE` (virgülle ayrılmış glob), `GHBACKUP_TARGETS` (çalıştırılacak hedef adları, virgülle), `GHBACKUP_S3_ACCESS_KEY_ID`, `GHBACKUP_S3_SECRET_ACCESS_KEY`. Boolean'lar `true/false/1/0`.

Bayraklar (her iki komutta ortak olanlar dahil):

- Ortak: `--config <path>`, `--include <glob>` (tekrarlanabilir), `--exclude <glob>` (tekrarlanabilir), `--no-archived`, `--no-forks`, `--json`, `--verbose`, `--quiet`.
- `backup`: `--cache-dir <dir>`, `--concurrency <n>`, `--keep <n>`, `--no-wiki`, `--no-lfs`, `--target <name>` (tekrarlanabilir; yalnızca seçilen hedefler), `--local <path>` (config'e geçici `local` hedefi ekler, hızlı kullanım için).
- Glob'lar `owner/repo` üzerinde, büyük/küçük harf duyarsız eşleşir: `*` ve `?` `/` karakterini geçmez, `**` geçer; `/` içermeyen desen hiçbir repoyla eşleşmez. Boş `include` her repoyu kabul eder. `exclude` `include`'dan sonra uygulanır.
- `--no-archived`, `--no-forks`, `--no-wiki`, `--no-lfs` yalnızca komut satırında yazıldıysa ayarı ezer (commander'ın varsayılan `true` değeri env/dosya ayarlarını bozmaz).
- `--local` eklediği `local` hedefi diğer hedeflere eklenir; yalnızca onu çalıştırmak için `--target local` da verilir. `--verbose` ile `--quiet` birlikte kullanılamaz (çıkış 2).

## Güvenlik

- Token hiçbir zaman loglanmaz ve komut satırına yazılmaz; git kimlik bilgisi `gh auth git-credential` üzerinden gelir.
- S3 anahtarları kullanıcının config dosyasında veya env'de durur; loglarda maskelenir.
- Hata mesajlarındaki URL'lerden kullanıcı bilgisi (`user:pass@`) temizlenir.

## Performans ve limitler

- Repo listesi sahip başına birkaç API çağrısıdır; GitHub REST limiti (oturum açmış kullanıcı için saatte 5000) pratikte sorun değildir.
- Mirror fetch artımlıdır. Bundle her değişiklikte repo'nun tamamını içerir; bu bilinen bir maliyettir (K-006).
- Geçici bundle dosyaları önbellek diskinde yer kaplar; tek seferde en fazla `concurrency` kadar bulunur.

## Test

- Birim (Vitest): config birleştirme ve öncelik, şema hataları, glob filtre, zaman damgası, ref özeti, saklama seçimi, `gh` çıktısının ayrıştırılması (sahte `exec` ile).
- Entegrasyon (Vitest): geçici dizinde `git init --bare` ile "uzak" repolar; `file://` URL'leri döndüren test kaynağı; mirror → bundle → `local` hedef → `git clone <bundle>` ile geri yükleme doğrulaması; değişmeyen repo için yeni snapshot oluşmaması; saklama.
- LFS entegrasyon: `git-lfs` kuruluysa yerel LFS deposu olmadan çalışan senaryo; mümkün değilse birim + elle doğrulama.
- S3 entegrasyon: `GHBACKUP_TEST_S3_ENDPOINT` tanımlıysa MinIO'ya karşı çalışır, değilse atlanır. CI'da MinIO servis container'ı ile çalışır (kimlik `minioadmin`/`minioadmin`, workflow'da sabit).
- Gerçek GitHub hesabıyla uçtan uca deneme elle yapılır (💻).

## Kalite ve CI

- `npm run lint` (Biome check), `npm run format` (Biome format --write), `npm run typecheck` (`tsc --noEmit`), `npm test` (Vitest), `npm run build` (`tsc` → `dist/`).
- GitHub Actions `ci.yml`: push ve PR'da Node 22 ve 24 matrisinde lint, typecheck, test, build; MinIO servis container'ı.
- Dağıtım yok: kullanıcı repoyu klonlar, `npm ci && npm run build`, `node dist/cli.js` veya `npm link` ile `github-backup` komutu.

## Loglama

- Log stderr'e satır satır: `[HH:MM:SS] <SEVİYE> <repoKey>: <mesaj>`. `--verbose` git komutlarını da yazar; `--quiet` yalnızca hata ve özet (uyarılar dahil değil). Kayıtlı gizli değerler (S3 anahtarları) `***` olarak maskelenir.
- Log dosyası tutulmaz; cron çıktıyı yönlendirir.

## Maliyet

- Projenin kendisi ücretli servis kullanmaz. S3 depolama ve trafik maliyeti kullanıcının seçtiği sağlayıcıya aittir.

## Diğer repolarla ilişki

- Yok. Bağımsız ürün; başka repolara bağımlı değil.
