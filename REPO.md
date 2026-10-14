**Durum:** Geliştirme aşamasında
**Tür:** Bağımsız kütüphane / ürün

# github-backup-cli

GitHub repolarını (wiki ve LFS dahil) yerel diske ve S3 uyumlu depolamaya git bundle snapshot'ları olarak yedekleyen Node.js/TypeScript CLI. Plan: [plans/README.md](plans/README.md).

## İlişkili repolar

- Yok.

## Postman

- Gerekmiyor: proje HTTP API sunmuyor.

## Birlikte güncellenmesi gereken dosyalar

- Config şeması (`src/config/schema.ts`) değişirse: `config.example.json`, kök `README.md` config referansı, `plans/mimari.md` Yapılandırma bölümü.
- Bayrak veya env değişkeni eklenirse: `src/cli.ts`, `src/config/load.ts`, kök `README.md`, `plans/mimari.md`.
- Hedef düzeni veya manifest değişirse: `src/core/snapshot.ts`, `src/targets/*`, kök `README.md` geri yükleme bölümü, `plans/mimari.md`.
- Yeni kaynak/hedef eklenirse: `src/sources/index.ts` veya `src/targets/index.ts`, şema, `CONTRIBUTING.md`, README.
