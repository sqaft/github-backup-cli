# Öğrenilenler

## 2026-10-14 — Skill'in model ve effort ayarı yalnızca o tur için geçerli
`SKILL.md`'deki `model` ve `effort` alanları yalnızca skill'in çağrıldığı turu etkiler; kullanıcı yeni mesaj yazınca oturumun modeline dönülür. Çok turlu `plans-brainstorm` sohbeti Opus 5.5 xhigh'da kalsın diye aynı ayar `.claude/settings.json`'da da verilir. Tek turda biten `plans-development` ise kendi `opusplan` ve `high` ayarını frontmatter'dan alır.

## 2026-10-14 — Bulut oturumları kullanıcı düzeyindeki CLAUDE.md'yi yüklemez
Claude Code bulut oturumlarında `~/.claude/CLAUDE.md` bulunmaz. Yalnızca repodaki `CLAUDE.md`, `.claude/skills` ve `.claude/settings.json` gelir. Bu yüzden planlama ve geliştirme skill'leri uyulması gereken kuralları (credential'lar, git, doküman güncelliği, geriye dönük uyumluluk) kendi içinde taşır. Bulut ortamı `CLAUDE_CODE_REMOTE=true` ile tanınır.
