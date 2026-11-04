**Durum:** Yayında
**Tür:** Bağımsız kütüphane / ürün

# github-backup-cli

GitHub repolarını (wiki ve LFS dahil) yerel diske ve S3 uyumlu depolamaya git bundle snapshot'ları olarak yedekleyen Node.js/TypeScript CLI.

## İlişkili repolar

- Yok.

## Postman

- Gerekmiyor: proje HTTP API sunmuyor.

## Derleme

- `node dist/cli.js` derlenmiş çıktıyı çalıştırır; `dist/` git'e girmez ve kendiliğinden güncellenmez. `npm run build` `dist/`'i silip yeniden üretir.
- `.claude/settings.json` içindeki `Stop` hook'u, Claude Code bir turu bitirdiğinde `src/` veya tsconfig dosyaları `dist/cli.js`'ten yeniyse `npm run build` çalıştırır. Elle yapılan değişikliklerde `npm run build` gerekir ya da `npm run dev` kullanılır.

## Yayın

- npm paketi `@sqaft/github-backup-cli` (`publishConfig.access: public`), kurduğu komut `github-backup`. Pakette tek `bin` kalmalı: `npx @sqaft/github-backup-cli` buna dayanır. npm'deki `github-backup` başka birinin paketidir.
- Pakete yalnızca `dist/`, `config.example.json`, README, LICENSE ve `package.json` girer (`files`). `prepack`, `npm run build` ile `dist/`'i sıfırdan üretir.
- Yayın, GitHub Actions'taki `Publish` workflow'u (`.github/workflows/publish.yml`) elle tetiklenerek yapılır; `bump` girdisi `patch`, `minor` veya `major` olur. Workflow önce CI'ı çalıştırır, sonra yeni sürümü npm'deki son sürümden hesaplar ve npm trusted publishing ile yayınlar. Commit ve tag üretmez.
- Yayınlanan sürümün kaynağı npm'dir; `package.json`'daki `version` güncel sürümü göstermez.
- npm paket ayarlarındaki trusted publisher: org `sqaft`, repo `github-backup-cli`, workflow `publish.yml`, izin verilen işlem `npm publish`. Workflow dosyasının adı değişirse bu ayar da değişmelidir.

## Birlikte güncellenmesi gereken dosyalar

- Config şeması (`src/config/schema.ts`) değişirse: `config.example.json`, kök `README.md` config referansı.
- Bayrak veya env değişkeni eklenirse: `src/cli.ts`, `src/config/load.ts`, kök `README.md`.
- Hedef düzeni veya manifest değişirse: `src/core/snapshot.ts`, `src/targets/*`, kök `README.md` geri yükleme bölümü.
- Komut veya `--help` metinleri (`src/program.ts`) değişirse: kök `README.md` komut ve bayrak tabloları ile `test/unit/commands.test.ts` içindeki yardım testi.
- `backup` çıktısı (`src/util/progress.ts`, özet, renkler) değişirse: kök `README.md` Progress bölümü.
- Yeni kaynak/hedef eklenirse: `src/sources/index.ts` veya `src/targets/index.ts`, şema, `CONTRIBUTING.md`, README. Yeni hedef `TARGET_SETUPS` listesine de eklenir.
- İlk kurulum soruları (`src/commands/setup.ts`, `src/targets/*`) değişirse: `test/unit/setup.test.ts`, kök `README.md` First-run setup bölümü.
