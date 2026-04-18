import sqlite3
c = sqlite3.connect('manga_app.db')
r = c.execute("SELECT key, value FROM site_settings WHERE key IN ('spam_filter','auto_moderation','badwords_shadow','badwords_warn_links','badwords_warn_scam','badwords_freeze','auto_ban_after_reports','pre_moderation','banned_words')").fetchall()
for row in r:
    print(f"{row[0]} = {row[1][:120]}")
if not r:
    print("NO ROWS FOUND for those keys")
print("\nALL KEYS:")
all_keys = c.execute("SELECT key FROM site_settings").fetchall()
for k in all_keys:
    print(k[0])
