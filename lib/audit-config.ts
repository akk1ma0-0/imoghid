// Настройки журнала аудита (без секретов, без сети).

// Срок хранения новых журналов (audit_events, usage_events); старше — удаляет cron reset-usage.
export const AUDIT_RETENTION_MONTHS = 12;

// Журнал «Jurnal»: страница списка, максимальный период запроса.
export const JURNAL_PAGE_SIZE = 50;
export const JURNAL_MAX_RANGE_DAYS = 366;
export const JURNAL_DEFAULT_RANGE_DAYS = 7;

// Выгрузка XLSX: лимит строк (больше — просим сузить период).
export const EXPORT_MAX_ROWS = 10_000;

// LOGIN_FAILED: не чаще одной записи на пользователя за окно (защита от флуда перебором пароля).
export const LOGIN_FAILED_THROTTLE_MS = 60_000;

// Часовой пояс отчётов: границы дней — по Кишинёву, а не по UTC.
export const REPORT_TZ = "Europe/Chisinau";
