Документация по бэкэнду есть в api.kabanchiki.mooo.com/docs
Документация по шаблонам на втором этапе создания документа

[Скринкаст](https://disk.yandex.ru/i/FD1JumqpOqcrEg) [Сайт с решением](https://kabanchiki.mooo.com/) Презентация (тут ссылку на гитверсе прямую)














ЕСЛИ ХОТИТЕ ЗАХОСТИТЬ САМИ:


Для запуска фронтенда
`cd frontend`
`npm install`
`npm run dev -- -H 0.0.0.0`

Для запуска бэкэнда:
`cd backend`
`pip install -r requirements.txt`
`uvicorn api:app --reload --host 0.0.0.0 --port 8000`

Сайт будет доступен на `localhost:3000`

*После запуска необходимо подождать минуты 4 до полного запуска всех модулей!!!*
