# Faz 1 — İskelet, config ve `list`

**Durum:** Bekliyor

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

- [ ] Doğrulama: `gh repo list --json` alanlarının (`nameWithOwner`, `isArchived`, `isFork`, `hasWikiEnabled`, `isEmpty`, `url`) mevcut `gh` sürümünde olduğunu `gh repo list --json` (alan listesi yazdırır) veya resmi kılavuzdan doğrula; farklıysa mimari.md'yi güncelle.
- [ ] İskelet ve araç yapılandırması; `npm run lint/typecheck/test/build` boş projede geçer.
- [ ] `util/exec.ts`: komut, argüman dizisi, env, timeout; stdout/stderr yakalama; sıfır olmayan çıkışta komut adını ve stderr'i içeren hata.
- [ ] `util/log.ts`: seviye (`quiet`/`normal`/`verbose`), stderr'e zaman damgalı satırlar, gizli değer maskeleme.
- [ ] Config şeması, yükleme ve birleştirme + birim testleri (öncelik, env boolean ayrıştırma, `~` genişletme, hatalı alan mesajı).
- [ ] `util/filter.ts` + birim testleri.
- [ ] `sources/github.ts` + sahte `exec` ile birim testleri (sayfalı org çıktısı, boş org, org hatası, tekilleştirme).
- [ ] `commands/list.ts` (tablo ve `--json`) + birim testi.
- [ ] `commands/backup.ts` iskeleti ve tüm bayrakların tanımı.
- [ ] `config.example.json`.
- [ ] `ci.yml`.

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

_Henüz yok._
