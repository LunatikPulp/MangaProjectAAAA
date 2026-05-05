# SpringManga — Деплой на новый сервер

## Быстрая инструкция

### 1. Подготовка файлов на локалке

Убедись что в `backend/` есть все файлы:
```
backend/
├── .env              # Секреты (скопируй с сервера или используй .env.example)
├── .env.example      # Шаблон
├── requirements.txt  # Python зависимости
├── server.py
├── auth.py
├── database.py
├── models.py
├── cron_tasks.py
├── reading_progress_routes.py
├── security_middleware.py
├── badword_filter.py
├── mangabuff_scraper.py
├── import_frames.py
└── manga_app.db.gz   # Сжатая БД (25MB → 176MB распакованный)
```

### 2. Загрузка на сервер

```powershell
# Создать директории
plink -ssh root@NEW_SERVER -pw PASSWORD -batch "mkdir -p /opt/manga/backend /opt/manga/frontend/dist /opt/manga/frontend/public"

# Загрузить бэкенд файлы
pscp -pw PASSWORD -batch -r backend/* root@NEW_SERVER:/opt/manga/backend/

# Загрузить фронтенд (собранный dist/)
# Создать tar: tar -cf dist.tar dist/assets dist/index.html dist/index.html.br dist/sw.js dist/sw.js.br
pscp -pw PASSWORD -batch dist.tar root@NEW_SERVER:/opt/manga/frontend/

# Загрузить статичные ассеты (тяжёлые, не в tar)
# Frames_shop, Logo, Achievement Icons, Horror_design, money
pscp -r -pw PASSWORD -batch public/Frames_shop root@NEW_SERVER:/opt/manga/frontend/public/
pscp -r -pw PASSWORD -batch public/Logo root@NEW_SERVER:/opt/manga/frontend/public/
# ... и т.д.
```

### 3. Запуск deploy скрипта

```bash
# На сервере:
cd /opt/manga/backend
gunzip manga_app.db.gz        # Распаковать БД

# Запустить деплой
bash deploy.sh
```

### 4. После deploy.sh

```bash
# Распаковать фронтенд
cd /opt/manga/frontend
tar xf dist.tar && rm dist.tar

# Скопировать тяжёлые ассеты из public/ в dist/
cp -r public/Frames_shop dist/
cp -r public/Logo dist/
cp -r 'public/Achievement Icons' dist/
cp -r public/Horror_design dist/
cp -r public/money dist/

# Права
chown -R manga:manga /opt/manga

# SSL сертификат
certbot --nginx -d springmanga.duckdns.org

# Старт!
systemctl start manga
systemctl reload nginx
```

### 5. Проверка

```bash
systemctl status manga          # Должен быть active
curl -s http://localhost:8000/manga/home-sections | head -c 100
redis-cli ping                  # PONG
curl -s https://springmanga.duckdns.org/ | head -5
```

## Ключевые файлы конфигурации

| Файл | Где | Что |
|------|-----|-----|
| `/opt/manga/backend/.env` | Бэкенд | Секреты (SECRET_KEY, OAuth, пароли) |
| `/opt/manga/backend/.cron_token` | Бэкенд | JWT токен для cron (chmod 600) |
| `/opt/manga/backend/manga_app.db` | Бэкенд | SQLite БД (176MB) |
| `/etc/nginx/sites-available/manga` | Nginx | Site config с кэшем |
| `/etc/nginx/nginx.conf` | Nginx | Main config + cache zones + brotli |
| `/etc/systemd/system/manga.service` | Systemd | uvicorn service |
| `/etc/redis/redis.conf` | Redis | maxmemory 128mb |

## Деплой фронтенда (повседневный)

```powershell
# Локально: собрать
npm run build

# Создать tar (без тяжёлых ассетов)
tar -cf dist.tar dist/assets dist/index.html dist/index.html.br dist/sw.js dist/sw.js.br

# Загрузить
pscp -pw PASSWORD -batch dist.tar root@SERVER:/opt/manga/frontend/dist.tar

# На сервере:
plink -ssh root@SERVER -pw PASSWORD -batch "cd /opt/manga/frontend && rm -rf dist/assets dist/index.html dist/index.html.br && tar xf dist.tar && rm dist.tar && chown -R manga:manga /opt/manga && systemctl reload nginx"
```
