---
name: plans-development
description: plans/ altındaki planı kalınan yerden uygular. Her çalıştırmada önce plan moduna girip bu oturumun uygulama planını çıkarır, onaydan sonra kodlar, doğrular ve planı günceller. Bulutta ve yerelde çalışır. "geliştirmeye devam", "sonraki faz", "planı uygula" gibi isteklerde de tetiklenir.
model: opusplan
effort: high
---

# Planı uygula

`plans/` altındaki planın sıradaki işini uygula. Kullanıcıyla Türkçe ve kısa konuş.

Bu skill argüman beklemez. `$ARGUMENTS` boş değilse onu bu oturum için ek yönlendirme olarak kullan (ör. belirli bir görev veya faz).

Plan formatı: [plan-yapisi.md](../plans-brainstorm/plan-yapisi.md).

## 1. Ön kontrol

Plan moduna girmeden önce yalnızca şunları yap:

1. **Ortam:** `echo "${CLAUDE_CODE_REMOTE:-}"` çıktısı `true` ise buluttasın, değilse yereldesin.
2. **Merge edilmemiş iş (yalnızca bulutta):** bu oturumun kodunda olmayan ve `plans/` klasörünü değiştiren uzak branch var mı bak:

   ```bash
   git fetch origin --prune
   for b in $(git branch -r --no-merged HEAD --format='%(refname:short)' | grep -v -x -e origin -e origin/HEAD); do
     git diff --quiet "HEAD...$b" -- plans/ || git log -1 --format="$b  %cs  %s" "$b"
   done
   ```

   Varsa önceki bir oturumun işi merge edilmemiş olabilir. Kullanıcıya branch adlarını ve tarihlerini söyle, sonra sor: o branch bu oturuma merge edilsin mi (`git merge`), yoksa mevcut koddan mı devam edilsin? Artık gerekmeyen branch'leri GitHub'dan silebileceğini de söyle.
3. **Plan:** `plans/README.md` yoksa dur ve söyle: "Henüz plan yok. Önce `/plans-brainstorm` ile planlayalım."
4. **Yapılacak iş:** faz tablosunda `Devam ediyor` veya `Bekliyor` faz yoksa ve yerelde yapılacak 💻 maddesi de yoksa dur. "Tüm fazlar tamamlandı" de ve yeni iş için `/plans-brainstorm` öner.

## 2. Plan moduna gir

Plan modunda değilsen `EnterPlanMode` ile plan moduna gir. Bölüm 3 ve 4 plan modunda yapılır. Bu aşamada plan modunun verdiği plan dosyası dışında hiçbir dosyayı değiştirme.

## 3. Durumu oku

1. **Plan dosyaları:**
   - `plans/README.md`: planlama durumu, faz tablosu, çalışma kuralları.
   - `plans/kararlar.md`: kararlar. Bunlara uy, yeniden tartışma.
   - `plans/mimari.md` ve README'deki Belgeler tablosunda listelenen, fazla ilgili diğer belgeler.
   - Kökteki `developer-todos.md`: kullanıcının bitirdiği (`[x]`) ve bekleyen işler.
   - Kökteki `CLAUDE.md`, `REPO.md`, `LEARNINGS.md` (varsa).
2. **Planlama durumu:** `**Planlama:** Tamamlandı` değilse kullanıcıya söyle ve `AskUserQuestion` ile sor:
   - "Önce `/plans-brainstorm` ile planlamayı bitirelim" (Önerilen)
   - "Açık sorusu olmayan sıradaki fazla devam et"

   Kullanıcı planlamayı seçerse dur.
3. **Sıradaki faz:**
   - Tabloda `Devam ediyor` faz varsa onu al. **Devam notları**'nı oku ve işaretlenmemiş görevlerden devam et.
   - Yoksa tablodaki ilk `Bekliyor` fazı al.
   - Faz dosyasını tamamen oku.
4. **Git:** `git status` ve `git log --oneline -20` çalıştır. Commit edilmemiş değişiklik varsa ne olduklarını anla ve oturum planında hesaba kat.
5. **Plan ile kod tutarlı mı?** Örneğin görev işaretli ama kodu yok ya da kod var ama görev işaretsiz. Tutarsızlığı oturum planına yaz; planı gerçeğe göre düzeltmek de bu oturumun işidir.
6. **Ön koşullar ve engeller:**
   - Önceki faz `Tamamlandı` mı?
   - Engelleyici bir 👤 kullanıcı işi var mı (hesap, credential, onay)? Engellenmeyen görevlerle ilerle. Credential gerektiren doğrulamalarda mock veya yerel ortam kullan.
   - Bulutta yapılamayacak işler hangileri? Gerçek cihazda deneme, yerel servis, bulutta derlenemeyen paket, yalnızca yerelde kurulu araçlar (ör. `updeps`, Postman CLI) bu gruptadır.
7. **Yerelde:** `developer-todos.md`'deki işaretsiz 💻 maddelerinden bu bilgisayarda yapılabilecek olanları da bu oturumun işine ekle.
8. **Dış API'ler:** fazın kullandığı dış servislerin (izinler, uç noktalar, limitler, payload alanları, kütüphane API'leri) belirsiz ayrıntılarını resmi dokümantasyondan doğrula (context7, WebSearch, WebFetch).

## 4. Oturum planını onaya sun

1. Fazın **Açık sorular** bölümünde madde varsa:
   - Kullanıcı kararı gerektirenleri `AskUserQuestion` ile tek seferde sor. Önerilen seçenek ilk sırada olsun.
   - Önerilen varsayılanı olan küçük sorularda varsayılanı kullan ve uygulama sırasında `plans/kararlar.md`'ye yaz.
2. Oturum planını plan modunun verdiği plan dosyasına yaz. Kısa ve uygulanabilir olsun:
   - **Faz ve hedef:** hangi faz; bu oturumda fazın tamamı mı, bir kısmı mı bitecek?
   - **Adımlar:** görevler sırasıyla; her biri için değişecek dosyalar ve yaklaşım.
   - **Bu ortamda yapılamayacaklar:** hangi işler `developer-todos.md`'ye 👤 veya 💻 olarak gidecek?
   - **Doğrulama:** çalıştırılacak test, lint, typecheck ve build komutları; doğrulanacak kabul kriterleri.
   - **Plan güncellemesi:** hangi plan dosyaları değişecek?
3. `ExitPlanMode` ile planı kullanıcının onayına sun. Kullanıcı değişiklik isterse planı düzelt ve yeniden sun.

## 5. Uygula

Onaydan sonra:

- Faz dosyasının ve README tablosundaki fazın durumunu `Devam ediyor` yap.
- **Kapsam:** fazın **Kapsam** bölümüne sadık kal.
  - Kapsam dışı ama gerekli küçük bir iş çıkarsa yap ve **Devam notları**'na yaz.
  - Büyük bir iş çıkarsa ilgili faza görev olarak ekle ve kullanıcıya söyle.
- **Kurallar:** `CLAUDE.md`, `REPO.md`, `plans/README.md`'deki **Çalışma kuralları** ve `plans/kararlar.md` bağlayıcıdır.
- **Test:** testleri kodla birlikte yaz. Saf iş mantığını saf fonksiyonlara ayır ve tablo tabanlı test et.
- **Credential'lar:** config veya env dosyalarında hardcoded tanımlanır ve repoda durur. GitHub Actions dışında hiçbir platformun secret yönetimini kullanma. Kullanıcının verdiği credential'ları doğrudan ilgili config dosyasına yaz.
- **Geriye dönük uyumluluk:** `REPO.md`'deki `**Durum:**` satırına göre davran:
  - `Geliştirme aşamasında`: alias, fallback veya geçiş katmanı ekleme; doğrudan yeni yapıya geç. Mevcut veriyi silecek veya kullanılamaz hale getirecek bir değişiklikte önce sor.
  - `Yayında`: uyumluluğu koru. Kırıcı bir değişiklik gerekiyorsa önce sor.
  - Satır yoksa `Yayında` kabul et.
- **Doküman ve yorumlar:** değişiklikten etkilenen README, `docs/`, `CLAUDE.md` ve yorum satırlarını aynı işte güncelle. Projenin şu anki halini anlat; "eskiden şöyleydi" gibi geçmiş notları yazma.
- **`LEARNINGS.md`:** geliştirme sırasında yeni bir şey öğrenildiyse ve bir değişiklik bu yüzden yapıldıysa kökteki `LEARNINGS.md`'ye ekle (yoksa oluştur):

  ```markdown
  ## YYYY-MM-DD — Kısa başlık
  Ne öğrenildi ve neden önemli (1–3 cümle).
  ```

  Bu dosya değişiklik günlüğü değildir; yalnızca öğrenilenleri yaz.
- **Bağlı repolar:** başka repoların bağımlılık olarak kullandığı bir pakette değişiklik yaptıysan:
  - Yerelde: `updeps graph` ile kullanan repoları bul, etkilenen kullanımları incele ve kırılacak kodu güncelle.
  - Bulutta: `developer-todos.md`'ye 💻 maddesi olarak ekle: hangi değişiklik, hangi repolar etkilenebilir.
- **Postman:** dışarıdan çağrılan bir uç nokta eklendi, değişti veya silindiyse:
  - Yerelde: `REPO.md`'deki Postman workspace'ini güncelle.
  - Bulutta: `developer-todos.md`'ye 💻 maddesi olarak ekle: uç nokta, metot, değişiklik.
- **Bu ortamda yapılamayanlar:** mümkünse mock veya yerel bir alternatifle ilerle. Gerçek doğrulamayı `developer-todos.md`'ye 💻 olarak yaz: ne yapılacak, nasıl yapılacak, neden yerel gerekiyor.
- **Bitirmeden önce:** projenin lint, typecheck, test ve build komutlarını çalıştır. Kırmızı bırakma; düzeltemiyorsan nedenini **Devam notları**'na ve kapanış mesajına yaz.

## 6. Planı güncelle

Fazı bitirirken veya oturum faz bitmeden sona ererken:

- **Faz dosyası:**
  - Tamamlanan görevleri `[x]` yap.
  - Kabul kriterlerini tek tek doğrula. Doğrulanamayanları gerekçesiyle **Devam notları**'na yaz (ör. gerçek deploy, kullanıcı hesabı, gerçek cihaz gerekiyor).
  - Tüm görevler ve bu ortamda doğrulanabilen tüm kabul kriterleri tamamsa durumu `Tamamlandı`, değilse `Devam ediyor` yap.
  - **Devam notları**'nı baştan yaz: kalan işler, dikkat edilecekler, sonraki oturum için ipuçları. Sonraki oturum hiçbir bağlam olmadan devam edebilmeli.
- **README tablosu:** faz durumunu faz dosyasıyla aynı yap.
- **Plan gerçeği anlatsın:** uygulama plandan farklı olduysa plan dosyalarını (faz, `mimari.md`, diğer belgeler) gerçeğe göre güncelle. "Plandan sapıldı" notu tutma.
- **Kararlar:** yeni kararları `plans/kararlar.md`'ye sıradaki numarayla ekle. Değişen kararın satırını güncelle.
- **Sonraki fazlar:** öğrenilenler sonraki fazları etkiliyorsa o faz dosyalarını güncelle (görev, ön koşul, açık soru).
- **`developer-todos.md`:**
  - Yeni 👤 ve 💻 işleri ilgili faz başlığı altına ekle. Faz dosyalarındaki **👤 Kullanıcı aksiyonları** bölümüyle senkron tut.
  - Kullanıcının yaptığını söylediği veya senin doğruladığın maddeleri `[x]` yap. Yerelde yaptığın 💻 maddelerini de işaretle.
  - Sıradaki fazı engelleyenleri **Şimdi** bölümüne taşı.

## 7. Git

- **Bulutta:** her anlamlı adımı ayrı commit et. Commit mesajları İngilizce ve açıklayıcı olsun. Plan güncellemelerini de commit et. Oturumun çalıştığı branch'e push et. Pull request'i yalnızca kullanıcı isterse aç.
- **Yerelde:** commit atma, branch açma, push etme. Değişiklikler çalışma ağacında kalır.

## 8. Kapanış mesajı

Kısa ve Türkçe olsun:

- Tamamlanan faz veya görevler.
- Doğrulama sonuçları: test, lint, typecheck ve build; doğrulanamayan kabul kriterleri ve nedenleri.
- Senden beklenenler: `developer-todos.md`'ye eklenen veya hâlâ açık olan 👤 ve 💻 maddeleri.
- Bulutta: branch adı ve bir sonraki oturumdan önce varsayılan branch'e merge edilmesi gerektiği.
- Sıradaki faz veya iş.
