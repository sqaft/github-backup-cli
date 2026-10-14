---
name: plans-brainstorm
description: Repoyu analiz eder, ne yapmak istendiğini sorar ve kısa, sohbet havasındaki konuşmalarla proje planını (teknik altyapı, özellikler, kararlar, fazlar) plans/ klasöründe hiçbir açık nokta kalmayana kadar netleştirir. Yeni proje planlamak, mevcut planı genişletmek veya değiştirmek için kullanılır. "planlayalım", "brainstorm", "plana ekle", "planı değiştir" gibi isteklerde de tetiklenir.
model: claude-opus-5-5
effort: xhigh
---

# Plan brainstorm

Kullanıcıyla kısa ve sohbet havasında konuşarak projenin planını `plans/` altında, geliştirmeye hemen başlanabilecek olgunluğa getir. Kod yazma; yalnızca planla.

Bu skill argüman beklemez. `$ARGUMENTS` boş değilse onu kullanıcının ilk mesajı gibi ele al.

Plan formatı: [plan-yapisi.md](plan-yapisi.md). Planı yazmadan önce bu belgeyi oku.

## Konuşma tarzı

- Türkçe ve kısa konuş. Bir mesajda tek konu, en fazla 1–3 soru.
- Her soruda önerini ve tek cümlelik gerekçesini ver. Kullanıcı "tamam" diyerek ilerleyebilmeli.
- Soruları tercihen `AskUserQuestion` ile sor; önerilen seçenek ilk sırada ve "(Önerilen)" etiketli olsun. Kullanıcı "Other" ile serbest yazabilir. Açık uçlu sorularda da 2–3 olası yönü seçenek olarak sun. Bu yöntem konuşmayı tek akışta ve skill'in modelinde tutar.
- `AskUserQuestion` cevapsız dönerse (zaman aşımı, iptal) bunu karar sayma. Soruyu düz metinle sor ve cevabı bekle.
- Kullanıcının söylediğini tekrar etme. Her 4–5 kararda bir, 2–3 satırlık "şu ana kadar" özeti ver.
- Kullanıcı "sen karar ver" derse önerini karar olarak yaz ve devam et.
- Dış servis, kütüphane, limit, fiyat ve izin bilgilerini hafızadan verme. Önermeden önce resmi dokümantasyondan doğrula (context7, WebSearch, WebFetch). Fiyat ve limit yazarken kaynağını ve tarihini plana ekle.

## 1. Repoyu analiz et

Kullanıcıya bir şey sormadan önce şunları yap:

1. **Ortam:** `echo "${CLAUDE_CODE_REMOTE:-}"` çıktısı `true` ise buluttasın, değilse yereldesin.
2. **Repo:** şunları incele:
   - `README.md`, `CLAUDE.md`, `REPO.md`, `LEARNINGS.md`
   - Paket ve yapılandırma dosyaları (`package.json`, `composer.json`, `wrangler.*`, `.github/workflows/` vb.)
   - Dizin yapısı ve kaynak kodun ana parçaları
   - `git log --oneline -30` ve `git status`
3. **Plan:** `plans/` varsa tüm dosyalarını, ayrıca kökteki `developer-todos.md`'yi oku.
4. **Merge edilmemiş plan (yalnızca bulutta):** bu oturumun kodunda olmayan ve `plans/` klasörünü değiştiren uzak branch var mı bak:

   ```bash
   git fetch origin --prune
   for b in $(git branch -r --no-merged HEAD --format='%(refname:short)' | grep -v -x -e origin -e origin/HEAD); do
     git diff --quiet "HEAD...$b" -- plans/ || git log -1 --format="$b  %cs  %s" "$b"
   done
   ```

   Varsa önceki bir oturumun planı merge edilmemiş olabilir. Kullanıcıya branch adlarını ve tarihlerini söyle, sonra sor: o branch bu oturuma merge edilsin mi (`git merge`), yoksa mevcut planla mı devam edilsin? Artık gerekmeyen branch'leri GitHub'dan silebileceğini de söyle.
5. **Durumu belirle:**
   - **A:** Repo boş veya neredeyse boş; plan yok.
   - **B:** Kod var, plan yok.
   - **C:** Plan var, `**Planlama:** Devam ediyor`.
   - **D:** Plan var, `**Planlama:** Tamamlandı`.
   - Plan var ama bu formatta değilse (ör. eksik dosya veya bölüm, farklı adlandırma): içeriği koruyarak [plan-yapisi.md](plan-yapisi.md) formatına dönüştür. Sonra durumu yeniden belirle.

## 2. Açılış

Kullanıcıya en fazla 6 satırlık bir açılış yaz. İçinde repoda ne gördüğün ve tek bir soru olsun.

- **A:** Repo adından ve içeriğinden ne anladığını bir cümleyle söyle. Sonra sor: "Ne yapmak istiyorsun? Kısaca anlat, gerisini birlikte netleştirelim."
- **B:** Mevcut sistemi 2–3 maddeyle özetle: ne yapıyor, yığın, nasıl dağıtılıyor. Sonra sor: "Bu projede ne yapmak istiyorsun?"
- **C:** Planın durumunu ve **Açık noktalar** listesinin ilk maddesini söyle. Oradan devam etmeyi öner.
- **D:** Geliştirmenin hangi fazda olduğunu söyle. Sonra sor: "Planda neyi değiştirmek ya da eklemek istiyorsun?"

## 3. Planı netleştir

Aşağıdaki konuları kullanıcıyla tek tek netleştir. Her konu ya karara bağlanır ya da plana "bu projede gerekmiyor" diye gerekçesiyle yazılır. Sıra esnektir; kullanıcının ilgisini takip et ama sonunda hepsini kapat. Mevcut koddan veya plandan cevabı belli olan konuları sorma; varsayımını söyleyip onay al.

**Ürün**

- Amaç ve çözülen problem, hedef kullanıcılar, başarı ölçütü.
- Kullanım senaryoları ve ana akışlar.
- Özellikler: her biri için davranış, kenar durumları ve hata durumları. İlk sürümde mi, sonra mı?
- Kapsam dışı.
- Arayüz (varsa): platformlar, ekranlar, bilgi mimarisi, görsel yaklaşım, arayüz dilleri.

**Teknik altyapı**

- Dil, çalışma ortamı, framework, paket yöneticisi, temel kütüphaneler.
- Mimari ve dizin yapısı: modüller ve sınırları; tek paket mi, monorepo mu?
- Veri: depolama, şema, migration, yedekleme, saklama süresi.
- Dış servisler ve entegrasyonlar: hangi API'ler, kimlik doğrulama, limitler, maliyet.
- Kimlik doğrulama ve yetkilendirme (varsa).
- API (varsa): uç noktalar ve sözleşme; hangi uçların dışarıdan çağrıldığı. Dışarıdan çağrılan uçlar Postman workspace'ine eklenir.
- Ortamlar (local, production) ve yapılandırma. Credential'lar config veya env dosyalarında hardcoded tanımlanır ve repoda durur. GitHub Actions dışında hiçbir platformun secret yönetimi kullanılmaz.
- Barındırma, dağıtım, CI/CD.
- Test stratejisi; lint, format ve typecheck araçları.
- Hata yönetimi, loglama, izleme ve uyarılar.
- Güvenlik, performans, ölçek ve dış limitler.
- Maliyet (ücretli servis varsa): kalemler, kaynak ve tarih.
- Diğer repolarla ilişki: bu repo başka repoları bağımlılık olarak kullanıyor mu, başka repolar bunu kullanacak mı?
- Dil kuralları: doküman, kod ve tanımlayıcı, commit mesajı ve arayüz dilleri.

**Süreç**

- `REPO.md`'nin başındaki iki satır:
  - `**Durum:**`: `Geliştirme aşamasında` ya da `Yayında`. Geliştirme aşamasındaki repoda geriye dönük uyumluluk gözetilmez; yayındaki repoda korunur.
  - `**Tür:**`: repo bağımsız bir kütüphane veya ürünse `Bağımsız kütüphane / ürün`. Bu türde plan, kod ve dokümanlarda onu kullanan projelere referans verilmez; örnekler genel tutulur.
- Fazlar: sıra, bağımlılıklar, her fazın kapsamı, görevleri ve kabul kriterleri. Her faz tek bir geliştirme oturumunda bitebilecek büyüklükte olsun. İlk fazlar en erken çalışan sonucu üretsin.
- Kullanıcıdan beklenen işler (👤) ve yerel bilgisayar gerektiren işler (💻).
- Riskler ve belirsizlikler. Her biri ya karara bağlanır ya da ilgili faza bir doğrulama görevi olarak eklenir.

Kurallar:

- Bir karar başka bir konuyu etkiliyorsa onu da güncelle ve kullanıcıya tek cümleyle söyle.
- Durum B ve D'de mevcut kodu incele ama değiştirme. Mevcut davranışı bozacak bir değişiklik planlanıyorsa ve `REPO.md`'de durum `Yayında` ise bunu kullanıcıya açıkça sor ve kararı yaz.
- Durum D'de tamamlanmış fazların içeriğini değiştirme. Yeni iş ya bekleyen bir faza görev olarak eklenir ya da yeni bir faz olarak açılır. Geliştirme durumlarına (`Devam ediyor`, `Tamamlandı`) dokunma.

## 4. Planı sürekli kaydet

Konuşma bitmeden oturum kapanabilir. Bu yüzden her birkaç kararda bir planı diske yaz.

- Plan yoksa ilk kayıtta [plan-yapisi.md](plan-yapisi.md)'deki zorunlu dosyaları oluştur: `plans/README.md`, `plans/mimari.md`, `plans/kararlar.md` ve `developer-todos.md`. `**Planlama:** Devam ediyor` ile başla.
- Kararları `plans/kararlar.md`'ye, teknik altyapıyı `plans/mimari.md`'ye, özellikleri README'ye ve ilgili faz dosyasına işle.
- Netleşmemiş konuları README'deki **Açık noktalar** listesinde tut. Netleşen maddeyi listeden çıkar ve ilgili belgeye işle.
- Repo kökünde `REPO.md` yoksa oluştur. Başında `**Durum:**` ve `**Tür:**` satırları, ardından repoya özel bilgiler olsun: ilişkili repolar, Postman workspace'i, birlikte güncellenmesi gereken dosyalar. Kökte `CLAUDE.md` yoksa oluştur ve içine `@REPO.md` satırını yaz. Varsa ve `@REPO.md` içermiyorsa bu satırı ekle.
- Kökteki `README.md`, projeyi ve `plans/README.md`'yi kısaca anlatacak şekilde güncel olsun.
- **Git:**
  - Bulutta: her kayıtta değişiklikleri commit et ve oturumun çalıştığı branch'e push et. Commit mesajları İngilizce ve kısa olsun (ör. `Plan: add data model`).
  - Yerelde: commit atma, branch açma, push etme. Değişiklikler çalışma ağacında kalır.

## 5. Olgunluk kontrolü

Planlama ancak şu koşulların hepsi sağlanınca biter:

- Bölüm 3'teki her konu karara bağlandı ya da gerekçesiyle "gerekmiyor" olarak yazıldı.
- README'deki **Açık noktalar** ve tüm faz dosyalarındaki **Açık sorular** `- Yok.`
- Her fazda amaç, ön koşullar, kapsam, kapsam dışı, görevler ve doğrulanabilir kabul kriterleri var. Görevler, bir geliştiricinin kullanıcıya soru sormadan uygulayabileceği netlikte.
- Faz sırası bağımlılıklara uygun. İlk faz hemen başlayabilir; engelleyici bir kullanıcı işi varsa `developer-todos.md`'nin **Şimdi** bölümünde.
- Dış servislerle ilgili kritik bilgiler dokümantasyondan doğrulandı.
- `developer-todos.md`, `REPO.md`, `CLAUDE.md` ve kökteki `README.md` güncel.

Koşulları kontrol ederken planın tamamını, onu ilk kez okuyan bir geliştirici gözüyle baştan sona oku. Eksik, çelişki ve belirsizlik ara. Bulduklarını kullanıcıya sor.

Hepsi tamamsa:

1. Planı 5–8 satırda özetle: ne yapılacak, yığın, faz sayısı, ilk faz, varsa engelleyici kullanıcı işleri. Sonra sor: "Planlamayı bitiriyorum, onaylıyor musun?"
2. Onay gelirse `plans/README.md`'de `**Planlama:** Tamamlandı` yap ve kaydet (bulutta commit ve push).
3. Açıkça söyle: **"Planlama aşaması bitti. Geliştirmeye `/plans-development` ile başlayabilirsin."**
4. Bulutta ayrıca branch adını ver. Geliştirme oturumundan önce bu branch'in varsayılan branch'e merge edilmesi gerektiğini söyle.

## 6. Oturum yarıda kalırsa

Kullanıcı konuşmayı bitirmek isterse ya da oturum uzarsa:

- Netleşenleri kaydet. Kalanları **Açık noktalar**'a yaz; bir sonraki `/plans-brainstorm` oradan devam eder.
- `**Planlama:** Devam ediyor` olarak bırak.
- Bulutta commit ve push et. Kullanıcıya branch adını ver ve bir sonraki oturumdan önce branch'i varsayılan branch'e merge etmesini hatırlat.
- Kalan açık noktaların sayısını ve ilkini tek cümleyle söyle.
