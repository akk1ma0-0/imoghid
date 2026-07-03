// Единый хелпер скачивания Blob. На iOS Safari <a download> ненадёжен (открывает blob
// в текущей вкладке → пользователь видит «blob:https://…/UUID» и путает с адресом страницы),
// поэтому там открываем в НОВОЙ вкладке (в рамках пользовательского жеста) + подсказка
// «Salvați în Fișiere». На остальных платформах — обычный <a download> (рабочее поведение).

// iPhone/iPad/iPod + WebKit, но НЕ Chrome/Firefox/Edge/Opera на iOS.
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(hone|od|ad)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// Единый транзиентный тост (без зависимости от состояния компонента). Один в момент времени.
export function notifyDownloadHint(msg: string): void {
  if (typeof document === "undefined") return;
  if (toastTimer) clearTimeout(toastTimer);
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "download-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  const el = toastEl;
  toastTimer = setTimeout(() => {
    el.remove();
    if (toastEl === el) toastEl = null;
    toastTimer = null;
  }, 6000);
}

// Синхронно открывает пустую вкладку (в рамках пользовательского жеста) — вызывать в начале
// обработчика клика, ДО await/генерации blob (иначе iOS заблокирует window.open как pop-up).
// На не-iOS возвращает null (no-op). Передать результат в downloadFile(..., preopened).
export function preopenTab(): Window | null {
  if (typeof window === "undefined" || !isIosSafari()) return null;
  return window.open("", "_blank");
}

// Скачивает Blob. Вызывать в обработчике клика. Для iOS передавайте вкладку из preopenTab(),
// если blob готовится асинхронно.
export function downloadFile(blob: Blob, filename: string, preopened?: Window | null): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);

  if (isIosSafari()) {
    const tab = preopened && !preopened.closed ? preopened : window.open(url, "_blank");
    if (preopened && !preopened.closed) preopened.location.href = url;
    notifyDownloadHint(
      tab
        ? "Fișierul s-a deschis într-o filă nouă. Apăsați ⬆️ Partajați → Salvați în Fișiere ca să îl păstrați."
        : "Permiteți ferestrele pop-up, apoi Partajați → Salvați în Fișiere ca să păstrați fișierul.",
    );
    // Вкладка использует URL — освобождаем позже, чтобы не оборвать загрузку.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
