# העברה ל-Claude-GH

1. מעתיקים את התיקייה `.claude/skills/anat-design-language/variants/soft-material/` כמו שהיא לשורש של Claude-GH.
2. מוסיפים ל-`.claude/skills/anat-design-language/SKILL.md`, בסוף סעיף 1 (שכבה קבועה), את השורה:
   - שפות חלופיות: `variants/soft-material/` (חומר רך: חומר אפור אחד, אור מלמעלה, יחידת אריח). נבחרת רק כשענת מבקשת או כשהמסך הוא מסך כניסות ופעולות. (08.11.2026, MesimaKolit-GH)
3. מוסיפים ל-`rules/design.md`, תחת "הפניות לפי נושא", את השורה:
   - שפה חלופית "חומר רך": `.claude/skills/anat-design-language/variants/soft-material/README.md`. (08.11.2026, MesimaKolit-GH)
4. מריצים `node tools/context-map.mjs instructions`, ממזגים ל-main.
