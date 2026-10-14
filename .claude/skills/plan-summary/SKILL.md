---
name: plan-summary
description: plans/ altındaki proje planının hızlı bir özetini verir; proje, planlama durumu, teknik yığın, fazlar ve ilerleme, sıradaki iş, kullanıcıdan beklenenler. Hiçbir dosyayı değiştirmez. "planın özeti", "plan ne durumda", "neredeyiz" gibi isteklerde de tetiklenir.
---

# Plan özeti

`plans/` altındaki planın hızlı bir özetini ver. Hiçbir dosyayı değiştirme, commit atma.

Bu skill argüman beklemez. `$ARGUMENTS` boş değilse özeti o konuya odakla (ör. tek bir faz).

## 1. Oku

- `plans/README.md`, `plans/kararlar.md`, `plans/mimari.md` ve tüm `plans/faz-*.md` dosyaları.
- Kökteki `developer-todos.md`.
- `git log --oneline -5`.

`plans/README.md` yoksa yalnızca şunu söyle: "Henüz plan yok. `/plans-brainstorm` ile başlayabilirsin."

Plan formatı: [plan-yapisi.md](../plans-brainstorm/plan-yapisi.md).

## 2. Özetle

Aşağıdaki yapıyı kullan. Toplam 40 satırı geçme; her madde tek satır olsun.

```markdown
## <Proje adı>

<Proje 1–2 cümlede.>

**Planlama:** <Devam ediyor / Tamamlandı> · **Geliştirme:** <tamamlanan faz> / <toplam faz> faz

**Yığın:** <dil, framework, veri, barındırma; tek satır>

**Özellikler**
- <Özellik> (Faz N)

**Fazlar**
| Faz | Başlık | Durum | Görev |
| --- | --- | --- | --- |
| 1 | ... | Tamamlandı | 8/8 |

**Şu an:** <Devam eden faz ve kalan görevler; yoksa sıradaki faz.>

**Öne çıkan kararlar**
- <En önemli 3–5 karar>

**Senden beklenenler**
- <developer-todos.md'deki Şimdi bölümü ve sıradaki fazın açık maddeleri>

**Açık noktalar:** <README'deki Açık noktalar ve fazlardaki Açık sorular; yoksa "Yok">
```

- **Görev** sütunu, faz dosyasındaki `[x]` ve `[ ]` görev sayılarından hesaplanır (yalnızca **Görevler** bölümü).
- Planlama `Devam ediyor` ise sonuna bir satır ekle: "Planlamaya `/plans-brainstorm` ile devam edebilirsin."
- Planlama `Tamamlandı` ve bekleyen faz varsa sonuna bir satır ekle: "Geliştirmeye `/plans-development` ile devam edebilirsin."
