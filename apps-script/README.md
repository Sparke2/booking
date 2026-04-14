## Google Sheets + Apps Script (общая бронь)

### 1) Создай таблицу
- Google Drive → **Создать** → **Google Таблицы**
- Назови как угодно, например `Meeting room bookings`

### 2) Добавь Apps Script
- В таблице: **Расширения** → **Apps Script**
- Удали всё в редакторе и вставь код из `apps-script/Code.gs`
- Нажми **Сохранить**

### 3) Разверни как Web App
- **Deploy** → **New deployment**
- **Select type** → **Web app**
- **Execute as**: *Me*
- **Who has access**: *Anyone*
- **Deploy**
- Скопируй URL вида `https://script.google.com/macros/s/.../exec`

### 4) Вставь URL в проект
Открой `src/main.js` и вставь ссылку в:

- `const SHEETS_API_URL = '...';`

### 5) Проверка
- Открой сайт, добавь бронь
- Открой этот же сайт в другом браузере/у коллеги — бронь должна быть видна

