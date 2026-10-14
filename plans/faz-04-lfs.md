# Faz 4 — Git LFS

**Durum:** Bekliyor

## Amaç

LFS kullanan repoların LFS nesneleri de yedeklenir: her yeni snapshot'ın yanına `<stamp>.lfs.tar` yazılır.

## Ön koşullar

- Faz 3 tamamlandı.

## Kapsam

- Ön koşul: LFS açıksa (`lfs: true`, varsayılan) `git lfs version` başarısızsa çıkış 2 ve mesaj: git-lfs kurulum linki (https://git-lfs.com) + "or rerun with --no-lfs to skip LFS objects".
- Mirror sonrası `git lfs fetch --all origin` (kaynağın `gitEnv()`'i ile).
- Snapshot: mirror'daki `lfs/objects` dizini boş değilse `tar` paketiyle `lfs/objects/...` yolunu koruyan `<stamp>.lfs.tar`; manifest'e `lfsTarBytes`.
- Ref'ler değişmediyse LFS ayrıca kontrol edilmez (LFS nesneleri ref'lere bağlıdır).
- `--no-lfs` / `lfs: false` / `GHBACKUP_LFS=false`: LFS adımları atlanır, ön koşul kontrol edilmez.
- Geri yükleme yöntemi (Faz 5 README'si için): bundle'dan klon, tar'ı klonun `.git/` dizinine açma, `git lfs checkout`.

## Kapsam dışı

- Snapshot'lar arası LFS tekilleştirme (K-018 gereği her snapshot kendi tar'ını taşır).

## Görevler

- [ ] Doğrulama: `git lfs fetch --all` komutunun bare repoda çalıştığını ve nesneleri `<gitdir>/lfs/objects` altına yazdığını resmi kaynaktan veya deneyle doğrula; farklıysa mimari.md ve bu fazı güncelle.
- [ ] Doğrulama: yerel test için LFS sunucusu gerektirmeyen bir senaryo bul (ör. `lfs.url` ile `file://` LFS deposu, git-lfs ≥ 3 standalone file transfer); yoksa entegrasyon testini atlanabilir yap ve elle doğrulamaya bırak.
- [ ] LFS ön koşulu ve `--no-lfs` + birim testleri.
- [ ] Mirror'a `git lfs fetch --all`.
- [ ] `lfs.tar` üretimi, iki hedefe yükleme, saklamada birlikte silme.
- [ ] Entegrasyon testi (mümkünse): LFS dosyalı repo → snapshot → geri yükleme → dosya içeriği doğru.
- [ ] CI'da `git-lfs` kurulu olduğundan emin ol (ubuntu runner'da yoksa `apt-get install git-lfs`).

## 👤 Kullanıcı aksiyonları

- [ ] 💻 LFS kullanan bir repo varsa kendi makinende yedekleyip README'deki geri yükleme adımlarıyla bir LFS dosyasını açarak doğrula.

## Kabul kriterleri

- `git-lfs` yokken `backup` çıkış 2 verir; `--no-lfs` ile başarılı çalışır.
- LFS'siz repolarda `.lfs.tar` oluşmaz.
- LFS'li test reposunda geri yüklenen dosya orijinalle aynı sha256'ya sahiptir (otomatik test veya elle doğrulama notu).

## Açık sorular

- Yok.

## Devam notları

_Henüz yok._
