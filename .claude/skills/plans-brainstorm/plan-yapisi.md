# Plan yapısı

Bu belge `plans-brainstorm`, `plan-summary` ve `plans-development` skill'lerinin ortak plan formatıdır. Planlar repo kökündeki `plans/` klasöründe, Türkçe Markdown olarak tutulur.

## Dosyalar

| Dosya | Zorunlu | İçerik |
| --- | --- | --- |
| `plans/README.md` | Evet | Proje özeti, planlama durumu, özellikler, kapsam dışı, belge listesi, faz tablosu, çalışma kuralları, açık noktalar |
| `plans/mimari.md` | Evet | Teknik altyapı: yığın, dizin yapısı, veri modeli, akışlar, entegrasyonlar, ortamlar ve yapılandırma, güvenlik, test, CI/CD, loglama |
| `plans/kararlar.md` | Evet | Güncel kararlar ve gerekçeleri |
| `plans/faz-NN-<slug>.md` | Evet | Her faz için bir dosya |
| `plans/<konu>.md` | Hayır | Gerektiğinde ek belge (ör. `maliyet.md`, `tasarim.md`, `api.md`). README'deki Belgeler tablosuna eklenir. |
| `developer-todos.md` (repo kökü) | Evet | Kullanıcının ve yerel bilgisayarın yapması gereken işler |

## Yazım kuralları

- Belgeler planın **şu anki** halini anlatır. "Eskiden şöyleydi", "X yerine Y'ye geçildi" gibi geçmiş notları yazma; değişen bilgiyi yerinde güncelle.
- Kısa cümleler ve madde işaretleri kullan. Dosya, komut, alan ve kod adlarını `backtick` içine al.
- Faz dosyası adlarında numara sıfır dolguludur: `faz-01-altyapi.md`. Alt fazlar: `faz-01.2-tasarim.md`.
- Durum değerleri:
  - Planlama (`plans/README.md`): `Devam ediyor`, `Tamamlandı`.
  - Faz: `Bekliyor`, `Devam ediyor`, `Tamamlandı`. Faz dosyasının başında ve README'deki faz tablosunda aynı tutulur.
- Kullanıcı işlerinin işaretleri:
  - 👤 Yalnızca kullanıcının yapabileceği iş: hesap açma, ödeme, onay, credential sağlama, karar.
  - 💻 Yerel bilgisayar gerektiren iş: gerçek cihazda deneme, yerel araç veya servis kullanma, bulutta derlenemeyen paket. Geliştirme yerelde çalışırken Claude bunları kendisi yapmaya çalışır.

## `plans/README.md` şablonu

```markdown
# <Proje adı> — Plan

<Proje 1–3 cümlede: ne yapar, kim için, neden.>

**Planlama:** Devam ediyor

## Özellikler

- **<Özellik>:** <tek cümle>. (Faz <N>)

## Kapsam dışı

- <Yapılmayacak şey ve kısa gerekçe>

## Belgeler

| Belge | İçerik |
| --- | --- |
| [mimari.md](mimari.md) | Teknik altyapı |
| [kararlar.md](kararlar.md) | Kararlar ve gerekçeleri |
| [developer-todos.md](../developer-todos.md) | Kullanıcıdan ve yerel bilgisayardan beklenen işler |

## Fazlar

Fazlar tablodaki sırayla uygulanır; sıranın tek kaynağı bu tablodur. Her faz tek bir geliştirme oturumunda bitirilebilecek büyüklüktedir. Geliştirme `/plans-development` ile kalınan yerden devam eder.

| Faz | Başlık | Durum | Dosya |
| --- | --- | --- | --- |
| 1 | <Başlık> | Bekliyor | [faz-01-<slug>.md](faz-01-<slug>.md) |

## Çalışma kuralları

- <Projeye özel kurallar: dil, mimari sınırlar, test, kod stili, credential'ların yeri vb.>

## Açık noktalar

- <Henüz netleşmemiş konu>: <kısa not ve önerilen yön>
```

Planlama bitince **Açık noktalar** bölümünde yalnızca `- Yok.` kalır.

## Faz dosyası şablonu

```markdown
# Faz <N> — <Başlık>

**Durum:** Bekliyor

## Amaç

<Faz sonunda elde edilecek sonuç, 1–3 cümle.>

## Ön koşullar

- <Tamamlanmış olması gereken fazlar; hazır olması gereken hesaplar ve erişimler. Yoksa "Yok.">

## Kapsam

- <Ne yapılacak. Davranış, kenar durumları ve hata durumları, geliştiricinin soru sormadan uygulayabileceği ayrıntıda.>

## Kapsam dışı

- <Bu fazda yapılmayacaklar ve hangi faza kaldıkları.>

## Görevler

- [ ] <Somut ve doğrulanabilir görev>

## 👤 Kullanıcı aksiyonları

- [ ] 👤 <Yalnızca kullanıcının yapabileceği iş>
- [ ] 💻 <Yerel bilgisayar gerektiren iş>

## Kabul kriterleri

- <Doğrulanabilir ölçüt ve nasıl doğrulanacağı.>

## Açık sorular

- Yok.

## Devam notları

_Henüz yok._
```

- **Açık sorular:** planlama bitmeden tüm fazlarda `- Yok.` olur. Geliştirme sırasında ortaya çıkan yeni sorular buraya yazılır.
- **Devam notları:** geliştirme sırasında doldurulur. Kalan işler, dikkat edilecekler ve sonraki oturum için ipuçları yazılır. Her oturumda baştan yazılır; günlük değildir. Faz tamamlanınca yalnızca sonraki fazları ilgilendiren notlar kalır, yoksa `_Yok._` yazılır.

## `plans/kararlar.md` şablonu

```markdown
# Kararlar

Projenin güncel kararları. Bir karar değişirse satırı güncellenir ve tarihi yenilenir. Geçersiz kalan karar silinir. Numaralar yeniden kullanılmaz.

| # | Tarih | Karar | Gerekçe |
| --- | --- | --- | --- |
| K-001 | YYYY-MM-DD | <Karar> | <Neden; değerlendirilen alternatifler> |
```

## `developer-todos.md` şablonu

```markdown
# Senden beklenenler

Claude'un yapamadığı işler burada toplanır: hesap açma, onay ve karar gibi yalnızca senin yapabileceklerin (👤) ve yerel bilgisayar gerektiren işler (💻). `/plans-development` her oturumda bu listeyi günceller.

- Bitirdiğin maddeyi `[x]` yap ya da oturumda "şunu yaptım" de.
- 💻 maddeleri, `/plans-development`'ı bilgisayarında çalıştırdığında Claude kendisi yapmaya çalışır.

## Şimdi

Sıradaki fazı engelleyen işler.

- [ ] 👤 <İş> (Faz <N>)

## Faza göre

### Faz <N> — <Başlık>

- [ ] 💻 <İş>: <neden yerel bilgisayar gerekiyor>
```

Boş kalan bölüme `- Yok.` yazılır.
