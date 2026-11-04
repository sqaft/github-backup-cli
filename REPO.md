**Durum:** Geliştirme aşamasında
**Tür:** Bağımsız kütüphane / ürün

# github-backup-cli

GitHub repolarını (wiki ve LFS dahil) yerel diske ve S3 uyumlu depolamaya git bundle snapshot'ları olarak yedekleyen Node.js/TypeScript CLI.

## İlişkili repolar

- Yok.

## Postman

- Gerekmiyor: proje HTTP API sunmuyor.

## Derleme

- `node dist/cli.js` derlenmiş çıktıyı çalıştırır; `dist/` git'e girmez ve kendiliğinden güncellenmez.
- `.claude/settings.json` içindeki `Stop` hook'u, Claude Code bir turu bitirdiğinde `src/` veya tsconfig dosyaları `dist/cli.js`'ten yeniyse `npm run build` çalıştırır. Elle yapılan değişikliklerde `npm run build` gerekir ya da `npm run dev` kullanılır.

## Birlikte güncellenmesi gereken dosyalar

- Config şeması (`src/config/schema.ts`) değişirse: `config.example.json`, kök `README.md` config referansı.
- Bayrak veya env değişkeni eklenirse: `src/cli.ts`, `src/config/load.ts`, kök `README.md`.
- Hedef düzeni veya manifest değişirse: `src/core/snapshot.ts`, `src/targets/*`, kök `README.md` geri yükleme bölümü.
- `--help` metinleri (`src/program.ts`) değişirse: kök `README.md` bayrak tablosu ve `test/unit/commands.test.ts` içindeki yardım testi.
- Yeni kaynak/hedef eklenirse: `src/sources/index.ts` veya `src/targets/index.ts`, şema, `CONTRIBUTING.md`, README. Yeni hedef `TARGET_SETUPS` listesine de eklenir.
- İlk kurulum soruları (`src/commands/setup.ts`, `src/targets/*`) değişirse: `test/unit/setup.test.ts`, kök `README.md` First-run setup bölümü.
