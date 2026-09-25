/* Логика прототипа «Адаптация персонала».
 * Весь рендер идёт из window.DATA и объекта state. После изменения данных вызывается render().
 */
(function () {
  'use strict';

  var D = window.DATA;

  /* =====================================================================
   * Утилиты
   * ===================================================================== */

  // plural(5, ['стажёр', 'стажёра', 'стажёров']) → 'стажёров'
  function plural(n, forms) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  function pluralN(n, forms) { return n + ' ' + plural(n, forms); }
  var W_DAYS = ['день', 'дня', 'дней'];
  var W_TRAINEES = ['стажёр', 'стажёра', 'стажёров'];

  function parseISO(s) {
    var p = s.slice(0, 10).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  // Количество дней от a до b (b − a)
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function addDays(iso, n) {
    return new Date(parseISO(iso) + n * 86400000).toISOString().slice(0, 10);
  }
  // ДД.ММ.ГГ
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0].slice(2);
  }
  // ДД.ММ.ГГ ЧЧ:ММ
  function fmtDateTime(iso) {
    if (!iso) return '';
    return fmtDate(iso) + ' ' + iso.slice(11, 16);
  }
  // Отметка времени для истории: «сегодня» из данных + текущее время
  function nowStamp() {
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return D.TODAY + 'T' + two(d.getHours()) + ':' + two(d.getMinutes());
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* =====================================================================
   * Доступ к данным
   * ===================================================================== */

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function user(id) { return byId(D.users, id); }
  function userName(id) { var u = user(id); return u ? u.fullName : '—'; }
  function dept(id) { return byId(D.departments, id); }
  function trainee(id) { return byId(D.trainees, id); }
  function programOf(t) {
    for (var i = 0; i < D.programs.length; i++) if (D.programs[i].traineeId === t.id) return D.programs[i];
    return null;
  }
  function tasksOf(program) {
    if (!program) return [];
    return D.tasks.filter(function (x) { return x.programId === program.id; });
  }
  function checklistOf(t) {
    return D.checklist.filter(function (x) { return x.traineeId === t.id; });
  }

  /* =====================================================================
   * Производные значения (раздел 5.3)
   * ===================================================================== */

  function isOverdue(task) { return task.status !== 'done' && task.deadline < D.TODAY; }
  // Статус для показа: просрочка — признак, но в бейдже показывается вместо исходного статуса
  function viewStatus(task) { return isOverdue(task) ? 'overdue' : task.status; }

  function totalDays(t) { return diffDays(t.startDate, t.endDate) + 1; }
  function dayNo(t) { return clamp(diffDays(t.startDate, D.TODAY) + 1, 0, totalDays(t)); }
  function timePct(t) { return Math.round(dayNo(t) / totalDays(t) * 100); }
  function daysToStart(t) { return diffDays(D.TODAY, t.startDate); }
  function daysToEnd(t) { return diffDays(D.TODAY, t.endDate); }

  // Сводка по задачам АП: выполнено / в работе / просрочено / не начато. Просроченная считается только в «просрочено».
  function taskStats(list) {
    var s = { total: list.length, done: 0, progress: 0, overdue: 0, todo: 0, pct: 0 };
    list.forEach(function (x) {
      var v = viewStatus(x);
      if (v === 'done') s.done++;
      else if (v === 'overdue') s.overdue++;
      else if (v === 'in_progress') s.progress++;
      else s.todo++;
    });
    s.pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    return s;
  }
  function statsOf(t) { var p = programOf(t); return p ? taskStats(tasksOf(p)) : null; }
  function taskPct(t) { var s = statsOf(t); return s ? s.pct : null; }
  function overdueCount(t) { var s = statsOf(t); return s ? s.overdue : 0; }
  function lag(t) {
    var p = taskPct(t);
    if (p === null || daysToStart(t) > 0) return false;
    return timePct(t) - p > D.LAG_THRESHOLD;
  }

  function checklistDate(item) { return addDays(trainee(item.traineeId).startDate, item.offsetDays); }
  function checklistOverdue(item) { return !item.done && checklistDate(item) < D.TODAY; }

  /* =====================================================================
   * Этапы (раздел 5.4)
   * ===================================================================== */

  var STAGES = [
    { code: 'found',    title: 'Подготовка к выходу' },
    { code: 'draft',    title: 'Черновик АП' },
    { code: 'approval', title: 'Согласование' },
    { code: 'active',   title: 'Стажировка' },
    { code: 'closing',  title: 'Закрытие' },
    { code: 'closed',   title: 'Закрыта' }
  ];
  function stageMeta(code) { return STAGES[stageIndex(code)]; }
  function stageIndex(code) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].code === code) return i;
    return -1;
  }

  /* =====================================================================
   * Уведомления (раздел 7.1) — вычисляются из состояния данных
   * ===================================================================== */

  var TONE_ORDER = { danger: 0, warning: 1, info: 2 };

  // Уведомления стажёра (фаза 9, раздел 2.1). Поля: id, severity, kind, text, shortText, buttonText, target.
  // kind: 'action' — кнопка меняет данные; 'navigation' — кнопка только переключает вид (target: {tab, filter}).
  var NOTE_IDS = ['no_program', 'prep_overdue', 'draft_stale', 'rejected', 'changed_after_approval', 'tasks_overdue', 'lag', 'close_soon'];
  var KIND_ORDER = { action: 0, navigation: 1 };
  function getNotifications(t) {
    var list = [];
    var s = t.stage;
    var program = programOf(t);
    if (s === 'closed') return list;

    if (s === 'found' && !program) {
      var ds = daysToStart(t);
      list.push({
        id: 'no_program', severity: 'warning', kind: 'action',
        text: 'Для стажёра нужно создать адаптационную программу. ' +
              (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate)),
        shortText: 'Создать АП' + (ds > 0 ? ', выход через ' + ds + ' дн.' : ds === 0 ? ', выход сегодня' : ''),
        buttonText: 'Создать АП'
      });
    }

    var clOver = checklistOf(t).filter(checklistOverdue).length;
    if (clOver > 0) {
      list.push({
        id: 'prep_overdue', severity: 'danger', kind: 'navigation',
        text: 'Просрочено пунктов подготовки к выходу: ' + clOver,
        shortText: 'Просрочено пунктов подготовки: ' + clOver,
        buttonText: 'Показать', target: { tab: 'prep' }
      });
    }

    if (s === 'draft' && t.draftSince && !t.rejectionComment && diffDays(t.draftSince, D.TODAY) >= 2) {
      var dd = diffDays(t.draftSince, D.TODAY);
      list.push({
        id: 'draft_stale', severity: 'warning', kind: 'action',
        text: 'Адаптационная программа не отправлена на согласование уже ' + pluralN(dd, W_DAYS),
        shortText: 'Не отправлена на согласование ' + dd + ' дн.',
        buttonText: 'Отправить на согласование'
      });
    }

    if (s === 'draft' && t.rejectionComment) {
      list.push({
        id: 'rejected', severity: 'danger', kind: 'action',
        text: 'АП возвращена на доработку: «' + t.rejectionComment + '»',
        shortText: 'Возвращена на доработку',
        buttonText: 'Отправить на согласование'
      });
    }

    if (t.changedAfterApproval && (s === 'active' || s === 'closing')) {
      list.push({
        id: 'changed_after_approval', severity: 'warning', kind: 'action',
        text: 'АП изменена после согласования. Отправьте её на повторное согласование',
        shortText: 'Изменена после согласования',
        buttonText: 'Отправить на согласование'
      });
    }

    if (s === 'active') {
      var st = statsOf(t);
      if (st && st.overdue > 0) {
        list.push({
          id: 'tasks_overdue', severity: 'danger', kind: 'navigation',
          text: 'Просрочено задач: ' + st.overdue,
          shortText: 'Просрочено задач: ' + st.overdue,
          buttonText: 'Показать', target: { tab: 'program', filter: 'overdue' }
        });
      }
      if (lag(t)) {
        list.push({
          id: 'lag', severity: 'warning', kind: 'navigation',
          text: 'Задачи отстают от графика: выполнено ' + st.pct + '% при прошедших ' + timePct(t) + '% срока',
          shortText: 'Отстаёт от графика',
          buttonText: 'Показать', target: { tab: 'program', filter: 'in_progress' }
        });
      }
    }

    if ((s === 'active' || s === 'closing') && daysToEnd(t) <= D.CLOSE_AVAILABLE_DAYS) {
      var de = Math.max(0, daysToEnd(t));
      list.push({
        id: 'close_soon', severity: 'info', kind: 'action',
        text: 'До окончания стажировки ' + pluralN(de, W_DAYS),
        shortText: 'До окончания ' + de + ' дн.',
        buttonText: 'Начать закрытие стажировки'
      });
    }

    // Порядок (раздел 2.2): danger → warning → info; внутри важности action выше navigation; затем порядок таблицы 2.1
    return list.sort(function (a, b) {
      return TONE_ORDER[a.severity] - TONE_ORDER[b.severity] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        NOTE_IDS.indexOf(a.id) - NOTE_IDS.indexOf(b.id);
    });
  }
  // Требуют внимания, иконка в дереве, счётчик на вкладке — только danger и warning (раздел 2.4)
  function isAttention(n) { return n.severity === 'danger' || n.severity === 'warning'; }
  function needsAttention(t) {
    return getNotifications(t).some(isAttention);
  }
  // Самый важный маркер для дерева и списка

  /* =====================================================================
   * Иконки: встроенные SVG 16×16, currentColor
   * ===================================================================== */

  var ICON_PATHS = {
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    more: '<circle cx="8" cy="3" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="13" r="1.3" fill="currentColor"/>',
    close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    check: '<path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    chevronDown: '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    chevronRight: '<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowLeft: '<path d="M13 8H3M7 4L3 8l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    help: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.7c-.5.2-.8.6-.8 1.1v.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".9" fill="currentColor"/>',
    comment: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    link: '<path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.2 10.2L13.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    collapse: '<path d="M8.5 4l-4 4 4 4M12.5 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    expand: '<path d="M7.5 4l4 4-4 4M3.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    user: '<circle cx="8" cy="5.5" r="2.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 13.5c.6-2.6 2.7-4 5.2-4s4.6 1.4 5.2 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    users: '<circle cx="6" cy="5.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.8 13c.5-2.2 2.2-3.4 4.2-3.4s3.7 1.2 4.2 3.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10.3 3.4a2.3 2.3 0 0 1 0 4.3M11.6 9.8c1.3.4 2.2 1.5 2.6 3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    clock: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8V8l2.2 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    docCheck: '<path d="M4 2.5h5.5L12 5v8.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 9l1.5 1.5L10.5 7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    warn: '<path d="M8 2.2L14.5 13.5h-13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.3v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".9" fill="currentColor"/>',
    openCard: '<path d="M9.5 2.5h4v4M13.5 2.5L8 8M6.5 3.5h-3v9h9v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".9" fill="currentColor"/>',
    alert: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6v4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r=".9" fill="currentColor"/>',
    flag: '<path d="M3.5 14V2.5M3.5 3h8l-1.8 3 1.8 3h-8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    print: '<path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><rect x="4.5" y="9.5" width="7" height="4" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    plus: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function icon(name, title) {
    return '<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="' + (title ? 'false' : 'true') + '">' +
      (title ? '<title>' + esc(title) + '</title>' : '') + (ICON_PATHS[name] || '') + '</svg>';
  }


  /* НЕ_ПЕРЕНОСИТЬ: иконки статичной оболочки клиента 1С 8.5 (раздел 2.4), viewBox 24×24 */
  var SHELL_ICON_PATHS = {
    home: '<path d="M4 11l8-7 8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>',
    sectionMain: '<path d="M4 20V6h5v14M9 20V4h5v16M14.5 20l1.5-14 4.5.5L19 20z" fill="currentColor" opacity=".85"/><path d="M4 9h5M9 7h5M4 17h5M9 17h5" style="stroke:var(--c-neutral-bg)" stroke-width="1.2"/>',
    sectionStaff: '<circle cx="12" cy="7" r="2.8" fill="currentColor"/><circle cx="5.5" cy="9" r="2.2" fill="currentColor"/><circle cx="18.5" cy="9" r="2.2" fill="currentColor"/><path d="M7 19c0-3.6 2.2-6 5-6s5 2.4 5 6zM1.5 18c0-2.8 1.6-4.6 4-4.6 1 0 1.8.3 2.4.8-1 1.1-1.6 2.3-1.8 3.8zM22.5 18c0-2.8-1.6-4.6-4-4.6-1 0-1.8.3-2.4.8 1 1.1 1.6 2.3 1.8 3.8z" fill="currentColor"/>',
    panel: '<rect x="3.5" y="5.5" width="17" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="6" width="5" height="12" fill="currentColor"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.8h3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4.3l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    functions: '<path d="M4 6.5h16M4 11h16M7 15.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 18.5l2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    account: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 18.2c1.2-2 3.2-3.2 5.5-3.2s4.3 1.2 5.5 3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    refresh: '<path d="M18 12a6 6 0 1 1-1.8-4.3M18 5.5v3.3h-3.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    expand: '<path d="M14 5h5v5M19 5l-5.5 5.5M10 19H5v-5M5 19l5.5-5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    more: '<circle cx="12" cy="6.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor"/>'
  };
  var SHELL_LOGO = '<svg viewBox="0 0 46 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M3 6.5L7 4v15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M29.5 6.2A8.5 8.5 0 1 0 21 19.5h24" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '<path d="M26 9A4.8 4.8 0 1 0 21 15.5h24" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
  function shellIcon(name) {
    if (name === 'logo') return SHELL_LOGO;
    var size = name === 'home' ? 16 : name === 'refresh' || name === 'more' ? 18 : 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      (SHELL_ICON_PATHS[name] || '') + '</svg>';
  }

  /* =====================================================================
   * Базовые компоненты (строки разметки)
   * ===================================================================== */

  // Русские части имён элементов 1С для ключей кода (имена в стиле 1С, раздел 3.2)
  var NAME_1C = {
    found: 'ПодготовкаКВыходу', draft: 'ЧерновикАП', approval: 'Согласование', active: 'Стажировка', closing: 'Закрытие', closed: 'Закрыта',
    no_program: 'НетАП', prep_overdue: 'ПросроченаПодготовка', rejected: 'ВозвратНаДоработку', draft_stale: 'ЧерновикНеОтправлен',
    changed_after_approval: 'ИзмененаПослеСогласования', tasks_overdue: 'ПросроченыЗадачи', lag: 'ОтставаниеОтГрафика',
    close_soon: 'СкороОкончание', stage_action: 'ДействиеЭтапа',
    done: 'Выполнено', progress: 'ВРаботе', overdue: 'Просрочено', todo: 'НеНачато',
    stage: 'Этап', deadline: 'Срок', status: 'Статус', action: 'ТребуетДействия', tasks: 'Задачи'
  };
  function n1c(key) { return NAME_1C[key] || key; }

  // Атрибуты соответствия 1С
  function a1c(type, name, risk) {
    return ' data-1c="' + type + '" data-1c-name="' + name + '"' + (risk ? ' data-1c-risk="' + risk + '"' : '');
  }
  function badge(tone, text, name) {
    return '<span class="badge badge-' + tone + '"' + a1c('Надпись', name || 'ДекорацияБейдж', 'check') + '>' + esc(text) + '</span>';
  }
  function stageBadge(t, name) {
    var m = stageMeta(t.stage);
    var text = m.title;
    if (t.stage === 'closed' && t.closeKind === 'cancelled') text = 'Отменена';
    // Цвет бейджа означает только этап (фаза 7, раздел 4): классы badge-stage-*
    return badge('stage-' + t.stage, text, name || 'ДекорацияЭтапСтажировки');
  }
  function indicator(pct, name, tone) {
    return '<div class="indicator' + (tone ? ' ' + tone : '') + '"' + a1c('Индикатор', name) + '>' +
      '<span style="width:' + clamp(pct, 0, 100) + '%"></span></div>';
  }
  // Кнопка. opts: {cls, action, name, title, disabled, icon, data}
  function button(text, opts) {
    opts = opts || {};
    var data = '';
    if (opts.data) for (var k in opts.data) data += ' data-' + k + '="' + esc(opts.data[k]) + '"';
    return '<button type="button" class="btn ' + (opts.cls || '') + '"' +
      (opts.action ? ' data-action="' + opts.action + '"' : '') + data +
      (opts.title ? ' title="' + esc(opts.title) + '"' : '') +
      (opts.disabled ? ' disabled' : '') +
      a1c(opts.type || 'Кнопка', opts.name || 'Кнопка') + '>' +
      (opts.icon ? icon(opts.icon) : '') + (text ? '<span>' + esc(text) + '</span>' : '') + '</button>';
  }
  function link(text, opts) {
    opts = opts || {};
    var data = '';
    if (opts.data) for (var k in opts.data) data += ' data-' + k + '="' + esc(opts.data[k]) + '"';
    return '<button type="button" class="link' + (opts.cls ? ' ' + opts.cls : '') + '"' +
      (opts.action ? ' data-action="' + opts.action + '"' : '') + data +
      (opts.title ? ' title="' + esc(opts.title) + '"' : '') +
      (opts.disabled ? ' disabled' : '') +
      a1c('Гиперссылка', opts.name || 'ДекорацияСсылка') + '>' + esc(text) + '</button>';
  }
  // Тумблер: items [{value, text, name, cls, risk}]
  function toggle(name, action, items, current, cls) {
    return '<div class="toggle' + (cls ? ' ' + cls : '') + '"' + a1c('Тумблер', name) + ' role="group">' +
      items.map(function (it) {
        var cls = (it.value === current ? 'on' : '') + (it.cls ? ' ' + it.cls : '');
        return '<button type="button" class="' + cls.trim() + '" data-action="' + action +
          '" data-value="' + esc(it.value) + '"' + a1c('Тумблер', name + 'Вариант' + it.name, it.risk) + '>' + esc(it.text) + '</button>';
      }).join('') + '</div>';
  }

  /* =====================================================================
   * Состояние интерфейса
   * ===================================================================== */

  var state = {
    topTab: 'adaptation',        // 'tasks' | 'recruiting' | 'adaptation'
    selectedTraineeId: null,     // выбранный стажёр
    traineeTab: null,            // 'program' | 'prepare'
    leftCollapsed: false,
    helpOpen: false,
    counterFilter: null,         // фильтр левой панели: 'attention' | 'awaitProgram' | 'approval' | 'active' | 'closing'
    search: '',
    hideEmpty: true,             // «Скрыть подразделения без стажёров»
    collapsed: {},               // свёрнутые узлы дерева: {deptId: true}
    summarySort: { key: 'action', dir: 1 },  // по умолчанию — по важности главного уведомления
    summaryCurrent: null,        // текущая строка сводной таблицы (одиночный клик, ↑ ↓)
    summaryFocus: false,         // вернуть фокус текущей строке после перерисовки
    notesExpanded: false,        // «Ещё N уведомлений» раскрыто
    openMenu: null,              // открытое подменю
    dialog: null,                // открытый диалог (верхний)
    dialogStack: [],             // формы-владельцы под открытым диалогом
    taskFilter: null,            // тумблер статусов таблицы задач: null («Все») | 'overdue' | 'progress' | 'todo' | 'done'
    taskSort: { key: null, dir: 1 },
    selectedTasks: {},           // выбранные флажками задачи: {taskId: true}. Только выбор, не отметка выполнения
    collapsedBlocks: {},         // свёрнутые группы «Корпоративный / Специальный блок»
    checklistMode: 'all',        // 'all' | 'mine'
    checklistSort: 1,            // сортировка по сроку: 1 — по возрастанию, -1 — по убыванию, 0 — порядок списка
    checklistFilter: null,       // 'overdue' — из плашки «Показать»
    checklistSel: null,          // выбранный пункт для ↑ ↓
    demoMenuOpen: false,         // НЕ_ПЕРЕНОСИТЬ
    markup: false,               // НЕ_ПЕРЕНОСИТЬ: режим разметки 1С (Shift+D)
    toasts: []
  };

  /* =====================================================================
   * Рендер
   * ===================================================================== */

  function el(id) { return document.getElementById(id); }

  function render() {
    renderTopTabs();
    var isAdaptation = state.topTab === 'adaptation';
    el('adaptationPage').classList.toggle('hidden', !isAdaptation);
    el('stubZone').classList.toggle('hidden', isAdaptation);
    if (isAdaptation) {
      renderLeft();
      renderCenter();
      renderHelp();
    }
    renderDialog();
    renderDemo();
    renderToasts();
  }

  function renderTopTabs() {
    var attention = D.trainees.filter(needsAttention).length;
    var tabs = [
      { id: 'tasks',      text: 'Задачи и уведомления', name: 'СтраницаЗадачиИУведомления' },
      { id: 'recruiting', text: 'Подбор персонала',     name: 'СтраницаПодборПерсонала' },
      { id: 'adaptation', text: 'Адаптация персонала' + (attention ? ' (' + attention + ')' : ''), name: 'СтраницаАдаптацияПерсонала',
        title: attention ? pluralN(attention, W_TRAINEES) + ' ' + (plural(attention, [0, 1, 1]) === 0 ? 'требует' : 'требуют') + ' действия' : '' }
    ];
    el('topTabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab' + (state.topTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '"' +
        ' data-action="topTab"' + (t.title ? ' title="' + esc(t.title) + '"' : '') + a1c('Страница', t.name) + '>' + esc(t.text) + '</button>';
    }).join('');
  }

  /* ---------------------------------------------------------------------
   * Левая панель (раздел 7.2)
   * --------------------------------------------------------------------- */

  // Фильтры левой панели (фаза 7, раздел 2.2): взаимоисключающие, активен максимум один
  var FILTERS = [
    { id: 'attention',    title: 'Требуют внимания',    icon: 'alert',    color: 'danger', name: 'ТребуютВнимания',
      match: function (t) { return needsAttention(t); } },
    { id: 'awaitProgram', title: 'Ожидают АП',          icon: 'clock',    color: 'stage-found',    stages: ['found', 'draft'], name: 'ОжидаютАП' },
    { id: 'approval',     title: 'На согласовании',     icon: 'docCheck', color: 'stage-approval', stages: ['approval'],       name: 'НаСогласовании' },
    { id: 'active',       title: 'Проходят стажировку', icon: 'users',    color: 'stage-active',   stages: ['active'],         name: 'ПроходятСтажировку' },
    { id: 'closing',      title: 'Ожидают закрытия',    icon: 'flag',     color: 'stage-closing',  stages: ['closing'],        name: 'ОжидаютЗакрытия' }
  ];
  function filterById(id) {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].id === id) return FILTERS[i];
    return null;
  }
  function filterMatches(f, t) { return f.match ? f.match(t) : f.stages.indexOf(t.stage) >= 0; }
  function filterValue(f) { return D.trainees.filter(function (t) { return filterMatches(f, t); }).length; }

  function searchQuery() { return state.search.trim().toLowerCase(); }
  // Подразделение и все его родители, начиная с самого подразделения
  function deptChain(deptId) {
    var list = [];
    var d = dept(deptId);
    while (d) { list.push(d); d = d.parentId ? dept(d.parentId) : null; }
    return list;
  }
  function childDepts(parentId) { return D.departments.filter(function (d) { return d.parentId === parentId; }); }
  function deptMatches(d, q) { return d.name.toLowerCase().indexOf(q) >= 0; }
  function traineeMatchesSearch(t, q) {
    if (!q) return true;
    if (t.fullName.toLowerCase().indexOf(q) >= 0) return true;
    return deptChain(t.departmentId).some(function (d) { return deptMatches(d, q); });
  }
  function traineeMatchesCounter(t) {
    return !state.counterFilter || filterMatches(filterById(state.counterFilter), t);
  }
  // Стажёры с учётом фильтра по карточке и поиска — общий источник для дерева, списка и сводной таблицы
  function visibleTrainees() {
    var q = searchQuery();
    return D.trainees.filter(function (t) { return traineeMatchesCounter(t) && traineeMatchesSearch(t, q); });
  }

  // Дерево подразделений с учётом фильтров: [{dept, children, trainees, count}]
  function buildTree() {
    var q = searchQuery();
    var list = visibleTrainees();
    function node(d) {
      var children = childDepts(d.id).map(node).filter(Boolean);
      var own = list.filter(function (t) { return t.departmentId === d.id; });
      var count = own.length + children.reduce(function (s, c) { return s + c.count; }, 0);
      var visible;
      if (count > 0) visible = true;
      else if (state.hideEmpty) visible = false;
      else if (q) visible = children.length > 0 || deptChain(d.id).some(function (x) { return deptMatches(x, q); });
      else visible = true;
      return visible ? { dept: d, children: children, trainees: own, count: count } : null;
    }
    return childDepts(null).map(node).filter(Boolean);
  }
  function isExpanded(d) { return searchQuery() ? true : !state.collapsed[d.id]; }


  // Значок главного уведомления в дереве (фаза 7, раздел 2.4): только иконка, тип — самого важного уведомления
  var TONE_ICONS = { danger: 'alert', warning: 'warn', info: 'info' };
  var TONE_TITLES = { danger: 'Критично', warning: 'Требует внимания', info: 'Информация' };
  // Дерево показывает только danger и warning (фаза 9, раздел 2.4); сводная — все уведомления
  function treeNotification(t) { return getNotifications(t).filter(isAttention)[0] || null; }
  function treeRowTitle(t) {
    var n = treeNotification(t);
    return 'Этап: ' + stageMeta(t.stage).title + (n ? '. ' + n.shortText : '');
  }

  function renderLeft() {
    var zone = el('leftZone');
    zone.classList.toggle('collapsed', state.leftCollapsed);
    if (state.leftCollapsed) {
      zone.innerHTML = '<div class="col left-strip">' +
        button('', { cls: 'btn-icon btn-flat', icon: 'expand', title: 'Развернуть панель', action: 'toggleLeft', name: 'КнопкаРазвернутьПанель' }) +
        '</div>';
      return;
    }

    // Поле поиска перерисовывается вместе с панелью — сохраняем фокус и курсор
    var active = document.activeElement;
    var keepFocus = active && active.getAttribute && active.getAttribute('data-input') === 'search';
    var selStart = keepFocus ? active.selectionStart : 0;
    var selEnd = keepFocus ? active.selectionEnd : 0;

    var html = '<div class="left-inner">' +
      '<div class="row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗаголовокЛевойПанели') + '>' +
        '<div class="h-block grow"' + a1c('Надпись', 'ДекорацияЗаголовокОбзор') + '>Обзор по подразделениям</div>' +
        submenu('leftPanel', 'ПодменюЛеваяПанель', [
          '<button type="button" role="menuitemcheckbox" aria-checked="' + state.hideEmpty + '" data-action="toggleHideEmpty"' +
            a1c('Кнопка', 'КомандаСкрытьПустыеПодразделения') + '><span class="menu-check">' + (state.hideEmpty ? '✓' : '') + '</span>' +
            'Скрыть подразделения без стажёров</button>'
        ], { title: 'Настройки панели' }) +
      '</div>' +
      '<div class="filter-list"' + a1c('ГруппаВертикальная', 'ГруппаФильтры') + '>' +
        FILTERS.map(function (f, i) { return filterRow(f) + (i === 0 ? '<div class="filter-sep"></div>' : ''); }).join('') +
      '</div>' +
      '<input type="text" class="input" data-input="search" placeholder="Поиск по ФИО или подразделению" value="' + esc(state.search) + '"' +
        ' title="Поиск по ФИО или подразделению"' + a1c('ПолеВвода', 'ПолеПоиска') + '>' +
      renderTree() +
      '<div class="row left-bottom">' +
        button('Свернуть', { cls: 'btn-flat', icon: 'collapse', action: 'toggleLeft', name: 'КнопкаСвернутьПанель', title: 'Свернуть панель' }) +
      '</div>' +
      '</div>';
    zone.innerHTML = html;

    if (keepFocus) {
      var input = zone.querySelector('[data-input="search"]');
      input.focus();
      input.setSelectionRange(selStart, selEnd);
    }
    var sel = zone.querySelector('.tree-row.selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  // Строка фильтра: иконка, подпись, число; у активной — сброс «✕»
  function filterRow(f) {
    var on = state.counterFilter === f.id;
    return '<div class="filter-row' + (on ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + on + '"' +
      ' data-action="counterFilter" data-id="' + f.id + '" title="' + esc(on ? 'Сбросить фильтр «' + f.title + '»' : 'Показать: ' + f.title) + '"' +
      a1c('ГруппаГоризонтальная', 'ГруппаФильтр' + f.name, 'check') + '>' +
      '<span class="filter-icon c-' + f.color + '"' + a1c('Картинка', 'КартинкаФильтр' + f.name) + '>' + icon(f.icon) + '</span>' +
      '<span class="grow filter-label"' + a1c('Гиперссылка', 'ГиперссылкаФильтр' + f.name) + '>' + esc(f.title) + '</span>' +
      '<span class="filter-num"' + a1c('Надпись', 'НадписьФильтр' + f.name + 'Число') + '>' + filterValue(f) + '</span>' +
      (on ? button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Сбросить фильтр', action: 'clearCounterFilter', name: 'КнопкаСброситьФильтр' + f.name }) : '') +
      '</div>';
  }

  // Пустой результат фильтров; place — где показан: 'Дерево', 'Список', 'Сводка' (имена в форме уникальны)
  function emptyFilterState(place) {
    var parts = [];
    if (searchQuery()) parts.push(link('Сбросить поиск', { action: 'resetSearch', name: 'ГиперссылкаСброситьПоиск' + place }));
    if (state.counterFilter) parts.push(link('Сбросить фильтр', { action: 'clearCounterFilter', name: 'ГиперссылкаСброситьФильтр' + place }));
    var text = searchQuery() ? 'Никого не нашли' : 'Нет стажёров по фильтру «' + filterById(state.counterFilter).title + '»';
    return '<div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаПустойРезультат' + place) + '>' +
      '<span' + a1c('Надпись', 'ДекорацияПустойРезультат' + place) + '>' + esc(text) + '</span>' +
      '<div class="row">' + parts.join('') + '</div></div>';
  }

  function renderTree() {
    var nodes = buildTree();
    if (!nodes.length) return '<div class="tree">' + emptyFilterState('Дерево') + '</div>';
    var out = [];
    (function walk(list, level) {
      list.forEach(function (n) {
        var hasKids = n.children.length + n.trainees.length > 0;
        var open = isExpanded(n.dept);
        out.push('<div class="tree-row tree-dept" role="treeitem" tabindex="0" aria-expanded="' + open + '"' +
          ' data-action="toggleDept" data-id="' + n.dept.id + '" style="padding-left:' + (8 + level * 14) + 'px"' +
          (hasKids ? ' title="' + (open ? 'Свернуть' : 'Развернуть') + '"' : '') + '>' +
          '<span class="tree-arrow">' + (hasKids ? icon(open ? 'chevronDown' : 'chevronRight') : '') + '</span>' +
          '<span class="ellipsis bold" title="' + esc(n.dept.name) + '">' + esc(n.dept.name) + '</span>' +
          '<span class="muted tree-count">(' + n.count + ')</span></div>');
        if (open) {
          walk(n.children, level + 1);
          n.trainees.forEach(function (t) {
            var n = treeNotification(t);
            out.push('<div class="tree-row tree-trainee' + (state.selectedTraineeId === t.id ? ' selected' : '') + '" role="treeitem" tabindex="0"' +
              ' data-action="selectTrainee" data-id="' + t.id + '" style="padding-left:' + (8 + (level + 1) * 14) + 'px" title="' + esc(treeRowTitle(t)) + '">' +
              '<span class="tree-arrow"></span>' +
              '<span class="tree-name grow"' + a1c('Надпись', 'ДеревоПодразделенийСтажер', 'check') + '>' + esc(t.fullName) + '</span>' +
              (n ? '<span class="tree-marker c-' + n.severity + '" aria-label="' + esc(TONE_TITLES[n.severity] + ': ' + n.shortText) + '"' +
                a1c('Картинка', 'ДеревоПодразделенийЗначок') + '>' + icon(TONE_ICONS[n.severity]) + '</span>' : '') + '</div>');
          });
        }
      });
    })(nodes, 0);
    return '<div class="tree" role="tree"' + a1c('ДеревоФормы', 'ДеревоПодразделений') + '>' + out.join('') + '</div>';
  }

  /* ---------------------------------------------------------------------
   * Центральная область
   * --------------------------------------------------------------------- */

  function renderCenter() {
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    el('centerZone').innerHTML = t ? renderTraineeCard(t) : renderSummary();
    if (!t && state.summaryFocus) {
      state.summaryFocus = false;
      var cur = el('centerZone').querySelector('.summary-row.selected');
      if (cur) cur.focus();
    }
    Array.prototype.forEach.call(el('centerZone').querySelectorAll('[data-indeterminate]'), function (x) { x.indeterminate = true; });
    placeFloatingMenu();
  }

  // Текущая строка сводной таблицы: подсветка и фокус из state.summaryCurrent.
  // Таблица не перерисовывается целиком, чтобы двойной клик приходил в ту же строку, что и первый клик.
  function renderSummaryCurrent(focus) {
    Array.prototype.forEach.call(document.querySelectorAll('.summary-row'), function (r) {
      var on = r.getAttribute('data-id') === state.summaryCurrent;
      r.classList.toggle('selected', on);
      r.tabIndex = on ? 0 : -1;
      if (on && focus) r.focus();
    });
  }

  // Сводная таблица (фаза 7, раздел 3)
  var TONE_RANK = { danger: 0, warning: 1, info: 2 };
  // Важность главного уведомления: danger → warning → info → нет уведомлений
  function actionRank(t) { var n = getNotifications(t)[0]; return n ? TONE_RANK[n.severity] : 3; }
  // Дата колонки «Срок»: выход — для found, дата закрытия — для closed, иначе окончание
  function summaryDate(t) {
    if (t.stage === 'found') return t.startDate;
    if (t.stage === 'closed') return t.closedAt || t.endDate;
    return t.endDate;
  }
  function defaultOrder(a, b) { return actionRank(a) - actionRank(b) || summaryDate(a).localeCompare(summaryDate(b)); }
  var SUMMARY_SORT = {
    stage: function (t) { return stageIndex(t.stage); },
    action: null, // как по умолчанию
    tasks: function (t) { var p = taskPct(t); return p === null ? -1 : p; },
    deadline: function (t) { return t.endDate; } // по дате окончания стажировки
  };
  function sortedSummary() {
    var list = visibleTrainees().slice();
    var sort = state.summarySort;
    var key = SUMMARY_SORT[sort.key];
    list.sort(function (a, b) {
      if (!key) return defaultOrder(a, b) * sort.dir;
      var x = key(a), y = key(b);
      return ((x < y ? -1 : x > y ? 1 : 0) || defaultOrder(a, b)) * sort.dir;
    });
    return list;
  }
  function deptPath(t) { return deptChain(t.departmentId).map(function (d) { return d.name; }).reverse().join(' / '); }

  // «Требует действия»: иконка и короткий текст главного уведомления, «ещё N»
  var ACTION_COLORS = { danger: 'c-danger', warning: 'c-warning', info: 'muted' };
  function actionCell(t) {
    var list = getNotifications(t);
    if (!list.length) return '';
    var n = list[0];
    return '<div class="row gap-1 top ' + ACTION_COLORS[n.severity] + '">' +
        '<span class="action-icon"' + a1c('Картинка', 'ТаблицаСтажеровЗначокДействия') + '>' + icon(TONE_ICONS[n.severity]) + '</span>' +
        '<span' + a1c('Надпись', 'ТаблицаСтажеровТребуетДействия') + '>' + esc(n.shortText) + '</span></div>' +
      (list.length > 1 ? '<div class="muted text-s action-more"' + a1c('Надпись', 'ТаблицаСтажеровЕщеУведомлений') + ' title="' +
        esc(list.slice(1).map(function (x) { return x.shortText; }).join('; ')) + '">ещё ' +
        pluralN(list.length - 1, ['уведомление', 'уведомления', 'уведомлений']) + '</div>' : '');
  }
  // «Задачи»: нет АП / количество задач / полоса с процентом и просрочкой
  function tasksCell(t) {
    var st = statsOf(t);
    if (!st) return '<span class="muted"' + a1c('Надпись', 'ТаблицаСтажеровНетАП') + '>АП нет</span>';
    if (['found', 'draft', 'approval'].indexOf(t.stage) >= 0) {
      return '<span' + a1c('Надпись', 'ТаблицаСтажеровКоличествоЗадач') + '>' + pluralN(st.total, ['задача', 'задачи', 'задач']) + '</span>';
    }
    var late = lag(t);
    return '<div class="row gap-1 task-meter" title="' + esc('Выполнено ' + st.done + ' из ' + st.total + (late ? '. Отстаёт от графика' : '')) + '">' +
        '<div class="indicator' + (late ? ' warning' : '') + '"' + a1c('Индикатор', 'ТаблицаСтажеровИндикаторЗадач', 'check') + '>' +
          '<span style="width:' + st.pct + '%"></span></div>' +
        '<span' + a1c('Надпись', 'ТаблицаСтажеровПроцентЗадач') + '>' + st.pct + '%</span></div>' +
      (st.overdue ? '<div class="text-s c-danger"' + a1c('Надпись', 'ТаблицаСтажеровПросроченоЗадач') + '>' + st.overdue + ' просроч.</div>' : '');
  }
  // «Срок»: дата и «через N дн.», если до неё не больше CLOSE_AVAILABLE_DAYS
  function dateCell(t) {
    var d = summaryDate(t);
    var text = t.stage === 'found' ? 'Выход ' : t.stage === 'closed' ? 'закрыта ' : 'до ';
    var days = diffDays(D.TODAY, d);
    return '<div' + a1c('Надпись', 'ТаблицаСтажеровСрок') + '>' + text + fmtDate(d) + '</div>' +
      (t.stage !== 'closed' && days >= 0 && days <= D.CLOSE_AVAILABLE_DAYS
        ? '<div class="text-s c-warning"' + a1c('Надпись', 'ТаблицаСтажеровЧерез') + '>' + (days ? 'через ' + days + ' дн.' : 'сегодня') + '</div>' : '');
  }

  function renderSummary() {
    var list = sortedSummary();
    var sort = state.summarySort;
    if (state.summaryCurrent && !list.some(function (t) { return t.id === state.summaryCurrent; })) state.summaryCurrent = null;
    function th(text, keyName) {
      if (!keyName) return '<th>' + text + '</th>';
      var on = sort.key === keyName;
      return '<th aria-sort="' + (on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="th-sort' + (on ? ' on' : '') + '" data-action="sortSummary" data-key="' + keyName + '"' +
        ' title="Сортировать по колонке «' + text + '»"' + a1c('ТаблицаФормы', 'ТаблицаСтажеровСортировка' + n1c(keyName)) + '>' +
        text + (on ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }

    var rows = list.map(function (t) {
      var d = dept(t.departmentId).name;
      return '<tr class="summary-row' + (state.summaryCurrent === t.id ? ' selected' : '') + '" tabindex="' + (state.summaryCurrent === t.id || (!state.summaryCurrent && t === list[0]) ? '0' : '-1') + '"' +
        ' data-action="summaryRow" data-id="' + t.id + '" title="Двойной клик или Enter — открыть карточку стажёра">' +
        '<td>' + link(t.fullName, { cls: 'fio-link', action: 'selectTrainee', data: { id: t.id }, title: 'Открыть карточку стажёра', name: 'ТаблицаСтажеровФИО' }).replace("data-1c-name=\"ТаблицаСтажеровФИО\"", "data-1c-name=\"ТаблицаСтажеровФИО\" data-1c-risk=\"check\"") +
          '<div class="muted text-s"' + a1c('Надпись', 'ТаблицаСтажеровДолжность') + '>' + esc(t.position) + '</div></td>' +
        '<td><div title="' + esc(deptPath(t)) + '"' + a1c('Надпись', 'ТаблицаСтажеровПодразделение') + '>' + esc(d) + '</div></td>' +
        '<td>' + stageBadge(t, 'ТаблицаСтажеровЭтап') + '</td>' +
        '<td>' + actionCell(t) + '</td>' +
        '<td>' + tasksCell(t) + '</td>' +
        '<td class="nowrap">' + dateCell(t) + '</td>' +
        '</tr>';
    }).join('');

    var total = D.trainees.length;
    var chips = '';
    if (state.counterFilter) {
      chips += '<span class="chip"' + a1c('ГруппаГоризонтальная', 'ГруппаЧипФильтра') + '><span' + a1c('Надпись', 'ДекорацияЧипФильтра') + '>' +
        esc(filterById(state.counterFilter).title) + '</span>' +
        button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Сбросить фильтр', action: 'clearCounterFilter', name: 'КнопкаЧипФильтраСбросить' }) + '</span>';
    }
    if (searchQuery()) {
      chips += '<span class="chip"' + a1c('ГруппаГоризонтальная', 'ГруппаЧипПоиска') + '><span' + a1c('Надпись', 'ДекорацияЧипПоиска') + '>' +
        'Поиск: «' + esc(state.search.trim()) + '»</span>' +
        button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Сбросить поиск', action: 'resetSearch', name: 'КнопкаЧипПоискаСбросить' }) + '</span>';
    }

    return '<div class="col gap-3 summary"' + a1c('ГруппаВертикальная', 'ГруппаСводка') + '>' +
      '<div class="row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗаголовокСводки') + '>' +
        '<div class="h-block"' + a1c('Надпись', 'ДекорацияЗаголовокСводки') + '>Стажёры: ' + (chips ? list.length + ' из ' + total : list.length) + '</div>' +
        chips + '<span class="grow"></span>' +
        button('', { cls: 'btn-icon' + (state.helpOpen ? ' pressed' : ''), icon: 'help', action: 'toggleHelp',
          title: state.helpOpen ? 'Скрыть справку' : 'Показать справку', name: 'КнопкаСправкаСводка' }) +
      '</div>' +
      (list.length ?
        '<div class="table-box">' +
        '<table class="grid summary-table"' + a1c('ТаблицаФормы', 'ТаблицаСтажеров') + '>' +
        '<thead><tr>' + th('Стажёр') + th('Подразделение') + th('Этап', 'stage') + th('Требует действия', 'action') + th('Задачи', 'tasks') + th('Срок', 'deadline') +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : emptyFilterState('Сводка')) +
      '</div>';
  }


  /* ---------------------------------------------------------------------
   * Карточка стажёра (раздел 7.4)
   * --------------------------------------------------------------------- */

  function initials(fullName) {
    var p = fullName.split(' ');
    return (p[0] ? p[0][0] : '') + (p[1] ? p[1][0] : '');
  }
  // Файл печати: АП_Лебедев_С_Н.docx
  function printFileName(t) {
    var p = t.fullName.split(' ');
    return 'АП_' + p[0] + (p[1] ? '_' + p[1][0] : '') + (p[2] ? '_' + p[2][0] : '') + '.docx';
  }
  function closeAvailableFrom(t) { return addDays(t.endDate, -D.CLOSE_AVAILABLE_DAYS); }
  function canStartClosing(t) {
    return t.stage === 'closing' || (t.stage === 'active' && daysToEnd(t) <= D.CLOSE_AVAILABLE_DAYS);
  }
  function isClosed(t) { return t.stage === 'closed'; }

  function renderTraineeCard(t) {
    // Крупные блоки через 16px (фаза 9, раздел 4.1): «← Все стажёры», карточка, блок процесса, вкладки
    return '<div class="col gap-4 trainee-card"' + a1c('ГруппаВертикальная', 'ГруппаКарточкаСтажера') + '>' +
      '<div class="row">' + link('← Все стажёры', { action: 'backToList', name: 'ГиперссылкаВсеСтажеры' }) + '</div>' +
      renderHeader(t) +
      renderProcess(t) +
      renderTraineePages(t) +
      '</div>';
  }

  function personLink(t, role) {
    var id = role === 'mentor' ? t.mentorId : t.headId;
    var u = user(id);
    var name = role === 'mentor' ? 'ГиперссылкаНаставник' : 'ГиперссылкаРуководительСтажировки';
    if (isClosed(t)) return '<span' + a1c('Надпись', name) + '>' + esc(u.fullName) + '</span>';
    return link(u.fullName, {
      action: 'openDialog', data: { dialog: role === 'mentor' ? 'changeMentor' : 'changeHead' },
      title: role === 'mentor' ? 'Сменить наставника' : 'Сменить руководителя стажировки', name: name
    });
  }

  // Карточка стажёра (фаза 9, раздел 3.2): только данные о человеке и стажировке, единственный блок с рамкой
  function renderHeader(t) {
    var st = statsOf(t);
    var right = '<div class="tcard-line"' + a1c('Надпись', 'ДекорацияДатыСтажировки') + '>' + fmtDate(t.startDate) + ' – ' + fmtDate(t.endDate) + '</div>';
    function bar(label, pct, text, name, textName) {
      return '<span class="row tcard-bar"' + a1c('ГруппаГоризонтальная', 'Группа' + name) + '>' +
        '<span class="muted"' + a1c('Надпись', 'ДекорацияПодпись' + name) + '>' + label + '</span>' +
        indicator(pct, 'Индикатор' + name) +
        '<span' + a1c('Надпись', textName) + '>' + esc(text) + '</span></span>';
    }
    if (isClosed(t)) {
      var result = t.closeKind === 'passed' ? 'Результат: пройдена' : t.closeKind === 'failed' ? 'Результат: не пройдена' : '';
      right += '<div class="tcard-line"' + (result ? ' title="' + result + '"' : '') + a1c('Надпись', 'ДекорацияСтажировкаЗакрыта') + '>' +
        (t.closeKind === 'cancelled' ? 'Стажировка отменена ' : 'Стажировка закрыта ') + fmtDate(t.closedAt) + '</div>';
    } else if (t.stage === 'found' || daysToStart(t) > 0) {
      var ds = daysToStart(t);
      right += '<div class="tcard-line' + (ds <= 3 ? ' c-warning' : '') + '"' + a1c('Надпись', 'ДекорацияВыходЧерез') + '>' +
        (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate)) + '</div>';
    } else {
      // Две компактные полосы в строку; при нехватке места «Задачи» переносятся третьей строкой
      var dev = '';
      if (lag(t)) dev = '<span class="c-warning"' + a1c('Надпись', 'ДекорацияОтклонениеОтГрафика') + '>, отстаёт от графика</span>';
      else if (st && st.pct - timePct(t) > D.LAG_THRESHOLD) dev = '<span class="muted"' + a1c('Надпись', 'ДекорацияОтклонениеОтГрафика') + '>, опережает график</span>';
      right += '<div class="row tcard-bars"' + a1c('ГруппаГоризонтальная', 'ГруппаПолосы') + '>' +
        bar('Срок', timePct(t), dayNo(t) + '/' + totalDays(t), 'Срок', 'ДекорацияСрокДень') +
        (st ? '<span class="row gap-0">' + bar('Задачи', st.pct, st.pct + '%', 'Задачи', 'ДекорацияЗадачиПроцент') + dev + '</span>' : '') +
        '</div>';
    }

    return '<div class="panel tcard"' + a1c('ГруппаГоризонтальная', 'ГруппаКарточкаСтажераШапка') + '>' +
      // 1. Аватар, ФИО и должность
      '<div class="row gap-3 tcard-who"' + a1c('ГруппаГоризонтальная', 'ГруппаСтажер') + '>' +
        '<div class="avatar avatar-s"' + a1c('Картинка', 'КартинкаАватар', 'check') + ' title="' + esc(t.fullName) + '">' + esc(initials(t.fullName)) + '</div>' +
        '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаФИО') + '>' +
          '<div class="bold tcard-name"' + a1c('Надпись', 'ДекорацияФИО') + '>' + esc(t.fullName) + '</div>' +
          '<div class="muted tcard-line"' + a1c('Надпись', 'ДекорацияДолжность') + '>' + esc(t.position) + '</div>' +
        '</div>' +
      '</div>' +
      // 2. Наставник и руководитель
      '<div class="col gap-0 tcard-people"' + a1c('ГруппаВертикальная', 'ГруппаОтветственные') + '>' +
        '<div class="tcard-line" title="' + esc('Наставник: ' + user(t.mentorId).fullName) + '"><span class="muted"' + a1c('Надпись', 'ДекорацияПодписьНаставник') + '>Наставник: </span>' + personLink(t, 'mentor') + '</div>' +
        '<div class="tcard-line" title="' + esc('Руководитель: ' + user(t.headId).fullName) + '"><span class="muted"' + a1c('Надпись', 'ДекорацияПодписьРуководитель') + '>Руководитель: </span>' + personLink(t, 'head') + '</div>' +
      '</div>' +
      // 3. Даты и вторая строка по этапу — прижаты вправо
      '<div class="col gap-0 tcard-dates"' + a1c('ГруппаВертикальная', 'ГруппаСроки') + '>' + right + '</div>' +
      '</div>';
  }

  // Степпер этапов (блок процесса). Подписи: текущий шаг — «с даты» (для found — «выход»),
  // «Закрытие» в будущем при active — дата доступности закрытия, «Закрыта» — дата закрытия или отмены
  function renderStepper(t) {
    var cur = stageIndex(t.stage);
    var allDone = isClosed(t);
    return '<div class="stepper-wrap"><div class="stepper"' + a1c('ГруппаГоризонтальная', 'ГруппаСтеппер', 'check') + '>' +
      STAGES.map(function (s, i) {
        var state_ = allDone || i < cur ? 'done' : i === cur ? 'current' : 'future';
        var date = t.stageDates[s.code];
        var sub = '';
        if (allDone && s.code === 'closed') sub = (t.closeKind === 'cancelled' ? 'отменена ' : '') + fmtDate(t.closedAt);
        else if (state_ === 'current') sub = s.code === 'found' ? 'выход ' + fmtDate(t.startDate) : date ? 'с ' + fmtDate(date) : '';
        else if (s.code === 'closing' && state_ === 'future' && t.stage === 'active') sub = 'с ' + fmtDate(closeAvailableFrom(t));
        return '<div class="step step-' + state_ + '"' + a1c('Надпись', 'ДекорацияШаг' + n1c(s.code)) +
          ' title="' + esc(s.title + (sub ? ': ' + sub : '')) + '">' +
          '<span class="step-mark">' + (state_ === 'done' ? icon('check') : (i + 1)) + '</span>' +
          '<span class="col gap-0 step-text"><span class="step-title">' + esc(s.title) + '</span>' +
          (sub ? '<span class="step-sub muted">' + esc(sub) + '</span>' : '') +
          '</span></div>' + (i < STAGES.length - 1 ? '<span class="step-line"></span>' : '');
      }).join('') + '</div></div>';
  }

  // Что делает кнопка action-уведомления
  var NOTE_ACTION = { no_program: 'createProgram', draft_stale: 'sendToApproval', rejected: 'sendToApproval',
    changed_after_approval: 'sendToApproval', close_soon: 'startClosing' };
  function noteActionOf(t, n) {
    return n.id === 'stage_action' ? (t.stage === 'closing' ? 'startClosing' : 'sendToApproval') : NOTE_ACTION[n.id];
  }

  // Главное действие этапа, если среди уведомлений блока процесса нет action (решение 2 фазы 9).
  // Не уведомление: в дерево, счётчики и сводную не попадает.
  function stageFallbackStep(t) {
    var program = programOf(t);
    if ((t.stage === 'draft' || t.stage === 'found') && program) {
      return { id: 'stage_action', severity: 'info', kind: 'action', text: 'Черновик АП готов к отправке на согласование',
        buttonText: 'Отправить на согласование' };
    }
    if (t.stage === 'closing') {
      return { id: 'stage_action', severity: 'info', kind: 'action', text: 'Стажировка на этапе закрытия',
        buttonText: 'Начать закрытие стажировки' };
    }
    return null;
  }

  // Навигационное уведомление, ведущее туда, где пользователь уже находится, в блоке процесса не показывается (раздел 2.3)
  var TARGET_TAB = { prep: 'prepare', program: 'program' };
  var TARGET_FILTER = { overdue: 'overdue', in_progress: 'progress' };
  function leadsToCurrentView(n) {
    if (n.kind !== 'navigation' || !n.target) return false;
    if (TARGET_TAB[n.target.tab] !== state.traineeTab) return false;
    return !n.target.filter || TARGET_FILTER[n.target.filter] === state.taskFilter;
  }
  // Уведомления блока процесса: без скрытых по 2.3; без action — первым главное действие этапа
  function processNotifications(t) {
    var list = getNotifications(t).filter(function (n) { return !leadsToCurrentView(n); });
    if (!list.some(function (n) { return n.kind === 'action'; })) {
      var f = stageFallbackStep(t);
      if (f) list.unshift(f);
    }
    return list;
  }

  // Второстепенные действия стажировки (состав — фаза 8, 3.2): справа на первой строке блока процесса
  function renderTraineeActions(t) {
    var program = programOf(t);
    var s_ = t.stage;
    var parts = [];
    if (s_ === 'approval') parts.push(button('Отозвать с согласования', { action: 'recallApproval', name: 'КнопкаОтозватьССогласования' }));
    if (s_ === 'active' || s_ === 'closing') parts.push(button('Продлить срок', { icon: 'calendar', action: 'openDialog', data: { dialog: 'extend' }, name: 'КнопкаПродлитьСрок' }));
    if (program) parts.push(button('Печать АП', { icon: 'print', action: 'printProgram', name: 'КнопкаПечатьАП' }));
    var menuItems = [];
    if (program) {
      menuItems.push(menuItem('История изменений АП', 'openDialog', { dialog: 'history' }, 'КнопкаИсторияИзмененийАП'));
      menuItems.push(menuItem('Открыть документ АП', 'openProgramDoc', null, 'КнопкаОткрытьДокументАП'));
    }
    if (!isClosed(t)) {
      if (menuItems.length) menuItems.push('<div class="menu-sep"></div>');
      menuItems.push(menuItem('Отменить стажировку', 'openDialog', { dialog: 'cancel' }, 'КнопкаОтменитьСтажировку', 'danger-text'));
    }
    return '<div class="row command-bar trainee-actions"' + a1c('КоманднаяПанель', 'КоманднаяПанельСтажировки') + '>' +
      parts.join('') +
      (menuItems.length ? submenu('traineeMore', 'ПодменюЕщеСтажировка', menuItems) : '') +
      button('', { cls: 'btn-icon' + (state.helpOpen ? ' pressed' : ''), icon: 'help', action: 'toggleHelp',
        title: state.helpOpen ? 'Скрыть справку' : 'Показать справку', name: 'КнопкаСправка' }) +
      '</div>';
  }

  // Блок процесса (фаза 9, раздел 3.3): без рамки и фона. Степпер; через 8px — строки уведомлений.
  // Видны первые две строки; основная кнопка — у первого action среди видимых строк; «ещё N» — в конце второй строки.
  // В 1С строки — заранее созданные группы-слоты ГруппаСтрокаУведомления1…N, содержимое задаётся программно.
  var NOTES_VISIBLE = 2;
  function renderProcess(t) {
    var list = processNotifications(t);
    var hidden = Math.max(0, list.length - NOTES_VISIBLE);
    var shown = state.notesExpanded ? list : list.slice(0, NOTES_VISIBLE);
    var primary = shown.filter(function (n) { return n.kind === 'action'; })[0] || null;
    function row(n, i) {
      var k = i + 1;
      var more = i === NOTES_VISIBLE - 1 && hidden ? link(state.notesExpanded ? 'Скрыть' : 'ещё ' + hidden, { action: 'toggleNotes',
        title: state.notesExpanded ? 'Скрыть остальные уведомления' : 'Показать остальные уведомления', name: 'ГиперссылкаЕщеУведомления' }) : '';
      return '<div class="row note-row"' + a1c('ГруппаГоризонтальная', 'ГруппаСтрокаУведомления' + k) + '>' +
        '<span class="note-icon c-' + n.severity + '"' + a1c('Картинка', 'КартинкаУведомления' + k) + '>' + icon(TONE_ICONS[n.severity]) + '</span>' +
        '<span class="note-text" title="' + esc(n.text) + '"' + a1c('Надпись', 'ДекорацияУведомления' + k) + '>' + esc(n.text) + '</span>' +
        button(n.buttonText, { cls: n === primary ? 'btn-primary' : '', action: 'noteAction', data: { key: n.id }, name: 'КнопкаУведомления' + k }) +
        more + '</div>';
    }
    var rows = shown.map(row);
    return '<div class="col gap-2 process"' + a1c('ГруппаВертикальная', 'ГруппаПроцесс') + '>' +
      renderStepper(t) +
      '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаУведомленияИДействия') + '>' +
        '<div class="row process-first"' + a1c('ГруппаГоризонтальная', 'ГруппаПерваяСтрокаПроцесса') + '>' +
          (rows[0] || '<span class="grow"></span>') + renderTraineeActions(t) +
        '</div>' +
        (rows[1] || '') +
        (rows.length > NOTES_VISIBLE ? '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаОстальныеУведомления') + '>' + rows.slice(NOTES_VISIBLE).join('') + '</div>' : '') +
      '</div>' +
      '</div>';
  }

  function menuItem(text, action, data, name, cls) {
    var attrs = '';
    if (data) for (var k in data) attrs += ' data-' + k + '="' + esc(data[k]) + '"';
    return '<button type="button" data-action="' + action + '"' + attrs + (cls ? ' class="' + cls + '"' : '') + a1c('Кнопка', name) + '>' + esc(text) + '</button>';
  }
  // Подменю. opts: {text, icon, small, float, disabled, title, type}
  function submenu(id, name, items, opts) {
    opts = opts || {};
    var open = state.openMenu === id && !opts.disabled;
    var type = opts.type || 'Подменю';
    return '<div class="menu-host">' +
      button(opts.text || '', {
        cls: opts.text ? '' : 'btn-icon' + (opts.small ? ' btn-flat btn-small' : ''), icon: opts.icon || (opts.text ? null : 'more'),
        title: opts.title || (opts.text ? '' : 'Ещё'), action: 'toggleMenu', data: { menu: id }, type: type, name: name, disabled: opts.disabled
      }) +
      (open ? '<div class="menu ' + (opts.float ? 'menu-float' : 'menu-pop') + '"' + a1c(type, name + 'Список') + '>' + items.join('') + '</div>' : '') +
      '</div>';
  }
  // Меню строки таблицы — поверх прокручиваемого контейнера, координаты от кнопки
  function placeFloatingMenu() {
    var m = document.querySelector('.menu-float');
    if (!m) return;
    var r = m.parentNode.querySelector('button').getBoundingClientRect();
    var top = r.bottom + 4;
    if (top + m.offsetHeight > window.innerHeight - 8) top = r.top - m.offsetHeight - 4;
    m.style.top = top + 'px';
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
  }

  // Вкладки стажёра: «Адаптационная программа» и «Подготовка к выходу»
  // Итог чек-листа для заголовка вкладки (фаза 8, раздел 4): «2/7», картинка страницы — галочка или «!»
  function checklistSummary(t) {
    var all = checklistOf(t);
    var done = all.filter(function (c) { return c.done; }).length;
    var overdue = all.filter(checklistOverdue).length;
    var pic = all.length && done === all.length ? { icon: 'check', cls: 'c-success', title: 'Подготовка завершена' }
      : overdue ? { icon: 'alert', cls: 'c-danger', title: 'Просрочено пунктов подготовки: ' + overdue } : null;
    return { text: done + '/' + all.length, pic: pic };
  }

  function renderTraineePages(t) {
    var cl = checklistSummary(t);
    var tabs = [
      { id: 'prepare', text: 'Подготовка к выходу ' + cl.text, name: 'СтраницаПодготовкаКВыходу', pic: cl.pic },
      { id: 'program', text: 'Адаптационная программа', name: 'СтраницаАдаптационнаяПрограмма' }
    ];
    var body;
    if (state.traineeTab === 'program') {
      body = renderProgramTab(t);
    } else {
      body = renderPrepareTab(t);
    }
    return '<div class="col gap-3"' + a1c('Страницы', 'СтраницыСтажера') + '>' +
      '<div class="tabs">' + tabs.map(function (x) {
        // Цветной текст в заголовке страницы в 1С не штатный — статус передаётся картинкой страницы
        var pic = x.pic ? '<span class="tab-pic ' + x.pic.cls + '" title="' + esc(x.pic.title) + '"' +
          a1c('Картинка', 'КартинкаСтраницыПодготовка', 'check') + '>' + icon(x.pic.icon) + '</span>' : '';
        return '<button type="button" class="tab' + (state.traineeTab === x.id ? ' active' : '') + '" data-tab="' + x.id + '" data-action="traineeTab"' +
          (x.pic ? ' title="' + esc(x.pic.title) + '"' : '') + a1c('Страница', x.name) + '>' + pic + esc(x.text) + '</button>';
      }).join('') + '</div>' + body + '</div>';
  }


  /* ---------------------------------------------------------------------
   * Вкладка «Адаптационная программа» (раздел 7.5)
   * --------------------------------------------------------------------- */

  var STATUS_META = {
    overdue:     { text: 'Просрочена', tone: 'danger',  order: 0 },
    in_progress: { text: 'В работе',   tone: 'info',    order: 1 },
    not_started: { text: 'Не начата',  tone: 'neutral', order: 2 },
    done:        { text: 'Выполнена',  tone: 'success', order: 3 }
  };
  var BLOCKS = [
    { id: 'corp', title: 'Корпоративный блок', short: 'Корпоративный', name: 'Корпоративный' },
    { id: 'spec', title: 'Специальный блок',   short: 'Специальный',   name: 'Специальный' }
  ];
  // Вариант тумблера статусов → статус задачи
  var FILTER_STATUS = { done: 'done', progress: 'in_progress', overdue: 'overdue', todo: 'not_started' };

  function blockMeta(id) { return id === 'spec' ? BLOCKS[1] : BLOCKS[0]; }
  function trunc(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; }

  // Причина, по которой задачи АП менять нельзя (раздел 7.5.4); null — можно
  function editLock(t) {
    if (t.stage === 'approval') return 'АП на согласовании. Чтобы изменить задачи, отзовите её с согласования';
    if (t.stage === 'closed') return 'Стажировка закрыта — АП доступна только для просмотра';
    return null;
  }
  // Изменение АП: запись в историю; изменение согласованной АП требует повторного согласования
  function programChanged(t, action) {
    addHistory(programOf(t), action);
    if (D.REAPPROVAL_ON_CHANGE && (t.stage === 'active' || t.stage === 'closing')) t.changedAfterApproval = true;
  }

  function taskMatchesFilter(task, f) {
    if (!f) return true;
    return viewStatus(task) === FILTER_STATUS[f];
  }
  // Задачи для таблицы: фильтр по статусу, сортировка (по умолчанию — порядок задач в АП)
  function visibleTasks(t) {
    var list = tasksOf(programOf(t)).filter(function (x) {
      return taskMatchesFilter(x, state.taskFilter);
    });
    var s = state.taskSort;
    if (s.key) {
      list.sort(function (a, b) {
        var x = s.key === 'status' ? STATUS_META[viewStatus(a)].order : a.deadline;
        var y = s.key === 'status' ? STATUS_META[viewStatus(b)].order : b.deadline;
        return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
      });
    }
    return list;
  }
  function selectedTaskIds(t) {
    var ids = tasksOf(programOf(t)).map(function (x) { return x.id; });
    return Object.keys(state.selectedTasks).filter(function (id) { return state.selectedTasks[id] && ids.indexOf(id) >= 0; });
  }
  function taskById(id) { return byId(D.tasks, id); }
  function reviewerOf(program, task) { return task.reviewerId || program.defaultReviewerId; }
  function observersOf(program, task) { return task.observerIds.length ? task.observerIds : program.defaultObserverIds; }

  // ФИО через запятую; если больше max — «ФИО и ещё N» (фаза 8, раздел 5)
  function namesBrief(ids, max) {
    if (ids.length <= max) return ids.map(userName).join(', ');
    return userName(ids[0]) + ' и ещё ' + (ids.length - 1);
  }
  function sameIds(a, b) { return a.length === b.length && a.every(function (id) { return b.indexOf(id) >= 0; }); }

  // Счётчики тумблера статусов; выбранный вариант, ставший нулевым, сбрасывается на «Все» (8.4, 5.2)
  var STATUS_VARIANTS = [
    { f: 'overdue', text: 'Просрочено', name: 'Просрочено', cls: 'tv-danger', risk: 'check' },
    { f: 'progress', text: 'В работе', name: 'ВРаботе' },
    { f: 'todo', text: 'Не начато', name: 'НеНачато' },
    { f: 'done', text: 'Выполнено', name: 'Выполнено' }
  ];
  function syncTaskFilter(all) {
    var f = state.taskFilter;
    if (f && !all.some(function (x) { return taskMatchesFilter(x, f); })) state.taskFilter = null;
  }

  function renderProgramTab(t) {
    var program = programOf(t);
    if (!program) return renderProgramEmpty(t);
    var all = tasksOf(program);
    var lock = editLock(t);
    syncTaskFilter(all);
    return '<div class="col gap-2"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаАП') + '>' +
      renderDefaultsRow(t, program) +
      (lock ? '<div class="note note-' + (t.stage === 'approval' ? 'info' : 'neutral') + '"' + a1c('ГруппаГоризонтальная', 'ГруппаЗапретРедактирования') + '>' +
        '<span class="tone-info">' + icon('info') + '</span><span' + a1c('Надпись', 'ДекорацияЗапретРедактирования') + '>' + esc(lock) + '</span></div>' : '') +
      renderTaskCommandBar(t, all) +
      renderTaskTable(t, all) +
      '</div>';
  }

  // Строка умолчаний (8.4, 5.1): проверяющий и наблюдатели по умолчанию, «Изменить»
  function renderDefaultsRow(t, program) {
    var lock = editLock(t);
    var rev = program.defaultReviewerId;
    var obs = program.defaultObserverIds || [];
    var edit = isClosed(t) ? '' : link(rev ? 'Изменить' : 'Назначить', {
      action: 'openDialog', data: { dialog: 'reviewers' }, disabled: !!lock,
      title: lock || 'Проверяющий и наблюдатели по умолчанию для задач АП', name: 'ГиперссылкаИзменитьУмолчания'
    });
    return '<div class="row wrap gap-5 defaults-row"' + a1c('ГруппаГоризонтальная', 'ГруппаУмолчания') + '>' +
      (rev
        ? '<span class="row gap-1"><span class="muted"' + a1c('Надпись', 'ДекорацияПроверяющийПоУмолчаниюЗаголовок') + '>Проверяющий по умолчанию:</span>' +
          '<span' + a1c('Надпись', 'ДекорацияПроверяющийПоУмолчанию') + '>' + esc(userName(rev)) + '</span></span>'
        : '<span class="c-warning"' + a1c('Надпись', 'ДекорацияПроверяющийНеНазначен') + '>Проверяющий по умолчанию не назначен</span>') +
      '<span class="row gap-1"><span class="muted"' + a1c('Надпись', 'ДекорацияНаблюдателиПоУмолчаниюЗаголовок') + '>Наблюдатели по умолчанию:</span>' +
        '<span' + (obs.length > 2 ? ' title="' + esc(namesOf(obs)) + '"' : '') + a1c('Надпись', 'ДекорацияНаблюдателиПоУмолчанию') + '>' +
          (obs.length ? esc(namesBrief(obs, 2)) : '<span class="muted">не назначены</span>') + '</span></span>' +
      edit +
      '</div>';
  }

  // Командная панель таблицы (8.4, 5.2): тумблер статусов, «Добавить», действия с выбранными
  function renderTaskCommandBar(t, all) {
    var lock = editLock(t);
    var sel = selectedTaskIds(t).length;
    var items = [{ value: 'all', text: 'Все ' + all.length, name: 'Все' }].concat(STATUS_VARIANTS.map(function (v) {
      var n = all.filter(function (x) { return taskMatchesFilter(x, v.f); }).length;
      return n ? { value: v.f, text: v.text + ' ' + n, name: v.name, cls: v.cls, risk: v.risk } : null;
    }).filter(Boolean));
    return '<div class="row wrap command-bar command-bar-flat task-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельЗадач') + '>' +
      toggle('ТумблерСтатусЗадач', 'taskFilter', items, state.taskFilter || 'all') +
      submenu('addTask', 'ПодменюДобавитьЗадачу', [
        menuItem('Новая задача', 'openDialog', { dialog: 'task' }, 'КнопкаНоваяЗадача'),
        menuItem('Из шаблона…', 'openDialog', { dialog: 'addFromTemplate' }, 'КнопкаДобавитьИзШаблона')
      ], { text: 'Добавить ▾', icon: 'plus', disabled: !!lock, title: lock || '' }) +
      (sel ? '<span class="grow"></span>' +
        '<span class="row gap-3"' + a1c('ГруппаГоризонтальная', 'ГруппаВыбранныеЗадачи') + '>' +
          '<span class="bold"' + a1c('Надпись', 'ДекорацияВыбраноЗадач') + '>Выбрано: ' + sel + '</span>' +
          submenu('massActions', 'ПодменюДействияСВыбранными', [
            menuItem('Назначить проверяющего', 'openDialog', { dialog: 'massReviewer' }, 'КнопкаНазначитьПроверяющего'),
            menuItem('Наблюдатели', 'openDialog', { dialog: 'massObservers' }, 'КнопкаНаблюдатели'),
            menuItem('Перенести срок', 'openDialog', { dialog: 'massDeadline' }, 'КнопкаПеренестиСрок'),
            '<div class="menu-sep"></div>',
            menuItem('Удалить', 'openDialog', { dialog: 'deleteTasks' }, 'КнопкаУдалитьЗадачи', 'danger-text')
          ], { text: 'Действия с выбранными ▾' }) +
          link('Снять выделение', { action: 'clearTaskSelection', name: 'ГиперссылкаСнятьВыделение' }) +
        '</span>' : '') +
      '</div>';
  }

  // Таблица задач (8.4, 5.3–5.4): всегда сгруппирована по блокам
  function renderTaskTable(t, all) {
    var program = programOf(t);
    var lock = editLock(t);
    var selectable = !lock;
    var list = visibleTasks(t);
    var cols = selectable ? 8 : 7;
    var body;

    if (!all.length) {
      body = '<tr><td colspan="' + cols + '"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаНетЗадач') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияНетЗадач') + '>В программе пока нет задач</span>' +
        (lock ? '' : '<div class="row">' + link('Добавить задачу', { action: 'openDialog', data: { dialog: 'task' }, name: 'ГиперссылкаДобавитьЗадачу' }) +
          link('Добавить из шаблона', { action: 'openDialog', data: { dialog: 'addFromTemplate' }, name: 'ГиперссылкаДобавитьИзШаблона' }) + '</div>') +
        '</div></td></tr>';
    } else {
      body = BLOCKS.map(function (b) {
        var rows = list.filter(function (x) { return x.block === b.id; });
        if (!rows.length) return '';
        var blockAll = all.filter(function (x) { return x.block === b.id; });
        var done = blockAll.filter(function (x) { return x.status === 'done'; }).length;
        var open = !state.collapsedBlocks[b.id];
        return '<tr class="group-row" tabindex="0" data-action="toggleBlockGroup" data-block="' + b.id + '" title="' + (open ? 'Свернуть группу' : 'Развернуть группу') + '"' +
          a1c('ТаблицаФормы', 'ТаблицаЗадачАПГруппа' + b.name, 'check') + '>' +
          '<td colspan="' + cols + '"><span class="row gap-3">' +
            '<span class="row gap-1">' + icon(open ? 'chevronDown' : 'chevronRight') + '<b>' + b.title + '</b></span>' +
            '<span class="muted">выполнено ' + done + ' из ' + blockAll.length + '</span>' +
            '<span class="group-indicator">' + indicator(done / blockAll.length * 100, 'ТаблицаЗадачАПГруппа' + b.name + 'Индикатор', 'success')
              .replace('data-1c-name="ТаблицаЗадачАПГруппа' + b.name + 'Индикатор"', 'data-1c-name="ТаблицаЗадачАПГруппа' + b.name + 'Индикатор" data-1c-risk="check"') + '</span>' +
          '</span></td></tr>' +
          (open ? rows.map(function (x) { return taskRow(t, program, x, selectable); }).join('') : '');
      }).join('');
    }

    var ids = list.map(function (x) { return x.id; });
    var selCount = ids.filter(function (id) { return state.selectedTasks[id]; }).length;
    function thSort(text, key) {
      var on = state.taskSort.key === key;
      return '<th aria-sort="' + (on ? (state.taskSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="th-sort' + (on ? ' on' : '') + '" data-action="sortTasks" data-key="' + key + '" title="Сортировать по колонке «' + text + '»"' +
        a1c('ТаблицаФормы', 'ТаблицаЗадачАПСортировка' + n1c(key)) + '>' + text + (on ? (state.taskSort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }
    return '<div class="table-box">' +
      '<table class="grid task-table"' + a1c('ТаблицаФормы', 'ТаблицаЗадачАП') + '>' +
      '<colgroup>' + (selectable ? '<col class="w-check">' : '') + '<col><col class="w-status"><col class="w-deadline"><col class="w-person"><col class="w-observers"><col class="w-result"><col class="w-menu"></colgroup>' +
      '<thead><tr>' +
        (selectable ? '<th><input type="checkbox" data-select-all="1" title="Выбрать все видимые задачи"' +
          (ids.length && selCount === ids.length ? ' checked' : '') + (ids.length ? '' : ' disabled') +
          (selCount && selCount < ids.length ? ' data-indeterminate="1"' : '') + a1c('Флажок', 'ТаблицаЗадачАПВыбратьВсе') + '></th>' : '') +
        '<th>Задача</th>' + thSort('Статус', 'status') + thSort('Срок', 'deadline') +
        '<th title="Пусто — проверяющий по умолчанию">Проверяющий</th><th title="Пусто — наблюдатели по умолчанию">Наблюдатели</th><th>Результат</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // Строка задачи: проверяющий и наблюдатели — только если отличаются от умолчаний (8.4, 5.4)
  function taskRow(t, program, x, selectable) {
    var v = viewStatus(x);
    var sm = STATUS_META[v];
    var selected = !!state.selectedTasks[x.id];
    var late = v === 'overdue' ? diffDays(x.deadline, D.TODAY) : 0;
    var rev = x.reviewerId && x.reviewerId !== program.defaultReviewerId
      ? '<span title="' + esc(userName(x.reviewerId)) + '">' + esc(userName(x.reviewerId)) + '</span>' : '';
    var obs = x.observerIds.length && !sameIds(x.observerIds, program.defaultObserverIds || [])
      ? '<span title="' + esc(namesOf(x.observerIds)) + '">' + esc(namesBrief(x.observerIds, 1)) + '</span>' : '';
    return '<tr class="task-row' + (selected ? ' selected' : '') + '" data-task-id="' + x.id + '" title="Двойной клик — открыть карточку задачи">' +
      (selectable ? '<td><input type="checkbox" data-select-task="' + x.id + '"' + (selected ? ' checked' : '') +
        ' title="Выбрать задачу" aria-label="Выбрать задачу «' + esc(x.name) + '»"' + a1c('Флажок', 'ТаблицаЗадачАПВыбрана') + '></td>' : '') +
      '<td><div class="ellipsis" title="' + esc(x.name) + '">' + esc(x.name) + '</div></td>' +
      '<td>' + badge(sm.tone, sm.text, 'ТаблицаЗадачАПСтатус') + '</td>' +
      '<td class="nowrap">' + (late ? '<span class="danger-text" title="' + esc('Просрочена на ' + pluralN(late, ['день', 'дня', 'дней'])) + '">' + fmtDate(x.deadline) + ' (−' + late + ' дн.)</span>' : fmtDate(x.deadline)) + '</td>' +
      '<td><div class="ellipsis">' + rev + '</div></td>' +
      '<td><div class="ellipsis">' + obs + '</div></td>' +
      '<td class="nowrap"><span class="row gap-1">' +
        (x.result ? '<span class="icon-cell" title="' + esc('Результат: ' + x.result) + '"' + a1c('Картинка', 'ТаблицаЗадачАПЕстьРезультат') + '>' + icon('comment') + '</span>' : '<span class="icon-cell"></span>') +
        button('', { cls: 'btn-icon btn-flat btn-small', icon: 'link', title: 'Открыть в Forus Team', action: 'openForus', name: 'ТаблицаЗадачАПОткрытьForusTeam' }) +
      '</span></td>' +
      '<td>' + taskRowMenu(t, x) + '</td>' +
      '</tr>';
  }

  // Контекстное меню строки
  function taskRowMenu(t, x) {
    var lock = editLock(t);
    var sorted = !!state.taskSort.key;
    var siblings = tasksOf(programOf(t)).filter(function (y) { return y.block === x.block; });
    var idx = siblings.indexOf(x);
    function item(text, action, data, name, reason, cls) {
      var attrs = '';
      if (data) for (var k in data) attrs += ' data-' + k + '="' + esc(data[k]) + '"';
      return '<button type="button" data-action="' + action + '"' + attrs + (cls ? ' class="' + cls + '"' : '') +
        (reason ? ' disabled title="' + esc(reason) + '"' : '') + a1c('Кнопка', name) + '>' + esc(text) + '</button>';
    }
    var orderReason = lock || (sorted ? 'Сбросьте сортировку, чтобы менять порядок задач' : '');
    return submenu('row:' + x.id, 'КонтекстноеМенюЗадачи', [
      item(lock ? 'Открыть' : 'Изменить', 'openDialog', { dialog: 'task', task: x.id }, 'КонтекстноеМенюЗадачиИзменить'),
      item('Назначить проверяющего', 'openDialog', { dialog: 'massReviewer', task: x.id }, 'КонтекстноеМенюЗадачиНазначитьПроверяющего', lock),
      item('Перенести срок', 'openDialog', { dialog: 'massDeadline', task: x.id }, 'КонтекстноеМенюЗадачиПеренестиСрок', lock),
      item('Выше', 'moveTask', { task: x.id, dir: -1 }, 'КонтекстноеМенюЗадачиВыше', orderReason || (idx === 0 ? 'Задача уже первая в блоке' : '')),
      item('Ниже', 'moveTask', { task: x.id, dir: 1 }, 'КонтекстноеМенюЗадачиНиже', orderReason || (idx === siblings.length - 1 ? 'Задача уже последняя в блоке' : '')),
      '<div class="menu-sep"></div>',
      item('Удалить', 'openDialog', { dialog: 'deleteTasks', task: x.id }, 'КонтекстноеМенюЗадачиУдалить', lock, 'danger-text')
    ], { small: true, float: true, type: 'КонтекстноеМеню', title: 'Действия с задачей' });
  }

  // Пустое состояние: АП нет (7.5.5)
  function recommendedTemplate(t) {
    for (var i = 0; i < D.templates.length; i++) if (D.templates[i].position === t.position) return D.templates[i];
    return null;
  }
  function renderProgramEmpty(t) {
    if (isClosed(t)) {
      return '<div class="empty"' + a1c('Надпись', 'ДекорацияАПНеСоздавалась') + '>Адаптационная программа не создавалась</div>';
    }
    var rec = recommendedTemplate(t);
    var ds = daysToStart(t);
    function option(title, text, extra, btnText, dialog, name) {
      return '<div class="panel col gap-2 create-option"' + a1c('ГруппаВертикальная', 'ГруппаСоздание' + name) + '>' +
        '<div class="bold"' + a1c('Надпись', 'ДекорацияСоздание' + name) + '>' + esc(title) + '</div>' +
        '<div class="muted grow"' + a1c('Надпись', 'ДекорацияСоздание' + name + 'Пояснение') + '>' + esc(text) + '</div>' +
        (extra || '') +
        '<div>' + button(btnText, { action: 'openDialog', data: { dialog: dialog }, name: 'КнопкаСоздание' + name }) + '</div>' +
        '</div>';
    }
    return '<div class="col gap-4"' + a1c('ГруппаВертикальная', 'ГруппаАПНеСоздана') + '>' +
      '<div class="col gap-1">' +
        '<div class="h-block"' + a1c('Надпись', 'ДекорацияАПНеСоздана') + '>Адаптационная программа ещё не создана</div>' +
        '<div' + a1c('Надпись', 'ДекорацияАПНеСозданаПояснение') + '>' +
          (ds >= 0 ? 'Выход стажёра ' + fmtDate(t.startDate) + '. Программу нужно создать и согласовать до выхода.'
                   : 'Стажёр вышел ' + fmtDate(t.startDate) + '. Программу нужно создать и согласовать как можно скорее.') + '</div>' +
      '</div>' +
      '<div class="row gap-3 create-options"' + a1c('ГруппаГоризонтальная', 'ГруппаСпособыСоздания') + '>' +
        option('По шаблону', 'Задачи и сроки подставятся из шаблона должности',
          rec ? '<div>' + badge('success', 'Подходит для должности «' + rec.position + '»', 'ДекорацияШаблонПодходит') + '</div>' : '',
          'Выбрать шаблон', 'createFromTemplate', 'ПоШаблону') +
        option('Скопировать у другого стажёра', 'Возьмите АП коллеги на похожей должности', '', 'Выбрать стажёра', 'createCopy', 'Копированием') +
        option('С нуля', 'Пустая программа, задачи добавите сами', '', 'Создать пустую АП', 'createEmpty', 'СНуля') +
      '</div></div>';
  }

  // Создание АП любым из трёх способов (7.5.5)
  function createProgram(t, templateId, historyText, taskSpecs) {
    var program = {
      id: 'pr-' + t.id + '-' + Date.now(), traineeId: t.id, templateId: templateId,
      defaultReviewerId: t.mentorId, defaultObserverIds: [t.headId], history: []
    };
    D.programs.push(program);
    taskSpecs.forEach(function (s) { D.tasks.push(newTask(program, s)); });
    addHistory(program, historyText);
    setStage(t, 'draft');
    t.draftSince = D.TODAY;
    checklistOf(t).forEach(function (c) {
      if (c.linkedDocType === 'program' && !c.done) { c.done = true; c.doneBy = D.CURRENT_USER_ID; c.doneAt = D.TODAY; }
    });
    state.traineeTab = 'program';
    state.taskFilter = null;
    toast('АП создана');
  }
  var newTaskSeq = 1;
  function newTask(program, s) {
    return {
      id: 'task-new-' + (newTaskSeq++), programId: program.id, block: s.block, name: s.name, description: s.description || '',
      status: s.status || 'not_started', deadline: s.deadline, reviewerId: s.reviewerId || null,
      observerIds: s.observerIds || [], result: s.result || null, externalUrl: 'forus-team:task/new',
      type: s.type || 'task', required: !!s.required,
      links: (s.links || []).map(function (l) { return { url: l.url, comment: l.comment }; })
    };
  }

  /* ---------------------------------------------------------------------
   * Вкладка «Подготовка к выходу» (раздел 7.6)
   * --------------------------------------------------------------------- */

  function checklistLock(t) { return isClosed(t) ? 'Стажировка закрыта — чек-лист доступен только для просмотра' : null; }
  function offsetText(n) {
    if (n < 0) return 'за ' + (-n) + ' дн. до выхода';
    if (n === 0) return 'в день выхода';
    return 'через ' + n + ' дн. после выхода';
  }
  function checklistStatus(c) {
    if (c.done) return { text: 'Выполнено', tone: 'success' };
    if (checklistOverdue(c)) return { text: 'Просрочено', tone: 'danger' };
    return { text: 'Не выполнено', tone: 'neutral' };
  }
  function requestKind(c) { return c.name.indexOf('пропуск') >= 0 ? 'выпуск пропуска' : 'создание учётной записи'; }

  function visibleChecklist(t) {
    var list = checklistOf(t).filter(function (c) {
      return (state.checklistMode === 'all' || c.responsibleId === D.CURRENT_USER_ID) &&
        (!state.checklistFilter || checklistOverdue(c));
    });
    if (state.checklistSort) {
      list.sort(function (a, b) { return (a.offsetDays - b.offsetDays) * state.checklistSort; });
    }
    return list;
  }

  function renderPrepareTab(t) {
    var all = checklistOf(t);
    var done = all.filter(function (c) { return c.done; }).length;
    var ds = daysToStart(t);
    var lock = checklistLock(t);
    var list = visibleChecklist(t);
    var sel = state.checklistSel && byId(all, state.checklistSel) ? state.checklistSel : null;
    var orderReason = lock || (state.checklistSort ? 'Отключите сортировку по сроку, чтобы менять порядок пунктов' : !sel ? 'Выберите пункт в таблице' : '');
    var selIdx = sel ? all.indexOf(byId(all, sel)) : -1;

    var summary = '<div class="panel row gap-5"' + a1c('ГруппаГоризонтальная', 'ГруппаСводкаПодготовки') + '>' +
      '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаДоВыхода') + '>' +
        (ds > 0 ? '<span class="muted text-s">До выхода</span><span class="text-xl bold"' + a1c('Надпись', 'ДекорацияДоВыхода') + '>' + pluralN(ds, W_DAYS) + '</span>'
          : ds === 0 ? '<span class="muted text-s">Выход</span><span class="text-xl bold"' + a1c('Надпись', 'ДекорацияДоВыхода') + '>сегодня</span>'
          : '<span class="muted text-s">Стажёр вышел</span><span class="text-xl bold"' + a1c('Надпись', 'ДекорацияДоВыхода') + '>' + fmtDate(t.startDate) + '</span>') +
      '</div>' +
      '<div class="col gap-1 grow prepare-progress"' + a1c('ГруппаВертикальная', 'ГруппаГотовность') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияГотово') + '>Готово: <b>' + done + ' из ' + all.length + '</b></span>' +
        '<div class="indicator-wrap">' + indicator(all.length ? done / all.length * 100 : 0, 'ИндикаторГотовность', 'success') + '</div>' +
      '</div>' +
      '</div>';

    var bar = '<div class="row wrap command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельЧекЛиста') + '>' +
      button('Добавить пункт', { icon: 'plus', action: 'openDialog', data: { dialog: 'checklistItem' }, disabled: !!lock, title: lock || '', name: 'КнопкаДобавитьПункт' }) +
      button('', { cls: 'btn-icon', icon: 'up', action: 'clMove', data: { dir: -1 }, name: 'КнопкаПунктВыше',
        disabled: !!orderReason || selIdx <= 0, title: orderReason || (selIdx <= 0 ? 'Пункт уже первый' : 'Переместить выше') }) +
      button('', { cls: 'btn-icon', icon: 'down', action: 'clMove', data: { dir: 1 }, name: 'КнопкаПунктНиже',
        disabled: !!orderReason || selIdx === all.length - 1, title: orderReason || (selIdx === all.length - 1 ? 'Пункт уже последний' : 'Переместить ниже') }) +
      button('Заполнить по шаблону', { action: 'openDialog', data: { dialog: 'checklistFill' }, disabled: !!lock, title: lock || '', name: 'КнопкаЗаполнитьПоШаблону' }) +
      '<span class="grow"></span>' +
      toggle('ТумблерМоиПункты', 'clMode', [
        { value: 'all', text: 'Все', name: 'Все' },
        { value: 'mine', text: 'Мои', name: 'Мои' }
      ], state.checklistMode) +
      '</div>';

    var filterLine = state.checklistFilter ? '<div class="row filter-line"' + a1c('ГруппаГоризонтальная', 'ГруппаФильтрЧекЛиста') + '>' +
      '<span class="grow"' + a1c('Надпись', 'ДекорацияФильтрЧекЛиста') + '>Показаны: <b>Просрочено</b></span>' +
      button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Сбросить фильтр', action: 'clFilter', name: 'КнопкаСброситьФильтрЧекЛиста' }) + '</div>' : '';

    var body;
    if (!list.length) {
      var text = state.checklistFilter ? 'Просроченных пунктов нет' : 'У вас нет пунктов в чек-листе';
      body = '<tr><td colspan="6"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаЧекЛистПуст') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияЧекЛистПуст') + '>' + esc(text) + '</span>' +
        (state.checklistFilter ? link('Сбросить фильтр', { action: 'clFilter', name: 'ГиперссылкаСброситьФильтрЧекЛиста' })
          : link('Показать все', { action: 'clMode', data: { value: 'all' }, name: 'ГиперссылкаПоказатьВсеПункты' })) +
        '</div></td></tr>';
    } else {
      body = list.map(function (c) { return checklistRow(t, c, lock, sel); }).join('');
    }

    var sortOn = state.checklistSort;
    var table = '<div class="table-box"><table class="grid checklist-table"' + a1c('ТаблицаФормы', 'ТаблицаЧекЛистПодготовки') + '>' +
      '<colgroup><col class="w-check"><col><col class="w-resp"><col class="w-date"><col class="w-cl-status"><col class="w-action"></colgroup>' +
      '<thead><tr><th title="Выполнено">✓</th><th>Пункт</th><th>Ответственный</th>' +
      '<th aria-sort="' + (sortOn ? (sortOn > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="th-sort' + (sortOn ? ' on' : '') + '" data-action="clSort"' +
        ' title="Сортировать по сроку"' + a1c('ТаблицаФормы', 'ТаблицаЧекЛистПодготовкиСортировкаСрок') + '>Срок' + (sortOn ? (sortOn > 0 ? ' ▲' : ' ▼') : '') + '</button></th>' +
      '<th>Статус</th><th>Действие</th></tr></thead><tbody>' + body + '</tbody></table></div>';

    return '<div class="col gap-3"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаПодготовка') + '>' + summary + bar + filterLine + table + '</div>';
  }

  function checklistRow(t, c, lock, sel) {
    var st = checklistStatus(c);
    var date = checklistDate(c);
    var auto = c.linkedDocType === 'program';
    var boxTitle = lock || (auto ? 'Отмечается автоматически при создании АП' : c.done ? 'Снять отметку о выполнении' : 'Отметить выполненным');
    var action = '';
    if (c.linkedDocType === 'request0911') {
      action = c.linkedDocNumber
        ? link('Заявка ' + c.linkedDocNumber, { action: 'clOpenRequest', name: 'ТаблицаЧекЛистДокумент' })
        : link('Создать заявку', { action: 'openDialog', data: { dialog: 'request0911', item: c.id }, disabled: !!lock, title: lock || '', name: 'ТаблицаЧекЛистСоздатьЗаявку' });
    } else if (c.linkedDocType === 'bitrix') {
      action = link('Открыть Bitrix', { action: 'clOpenBitrix', name: 'ТаблицаЧекЛистОткрытьBitrix' });
    } else if (c.linkedDocType === 'program') {
      action = link('Перейти к АП', { action: 'traineeTab', data: { tab: 'program' }, name: 'ТаблицаЧекЛистПерейтиКАП' });
    }
    return '<tr class="clickable' + (sel === c.id ? ' selected' : '') + '" data-action="clSelect" data-id="' + c.id + '">' +
      '<td><input type="checkbox" data-cl-done="' + c.id + '"' + (c.done ? ' checked' : '') + (lock || auto ? ' disabled' : '') +
        ' title="' + esc(boxTitle) + '" aria-label="' + esc(boxTitle + ': ' + c.name) + '"' + a1c('Флажок', 'ТаблицаЧекЛистВыполнено') + '></td>' +
      '<td><div class="ellipsis" title="' + esc(c.name) + '">' + esc(c.name) + '</div></td>' +
      '<td><div>' + esc(D.ROLE_TITLES[c.responsibleRole]) + '</div><div class="muted text-s">' + esc(userName(c.responsibleId)) + '</div></td>' +
      '<td class="nowrap"><div class="' + (st.tone === 'danger' ? 'danger-text' : '') + '">' + fmtDate(date) + '</div><div class="muted text-s">' + offsetText(c.offsetDays) + '</div></td>' +
      '<td>' + badge(st.tone, st.text, 'ТаблицаЧекЛистСтатус') +
        (c.done && c.doneBy ? '<div class="muted text-s">' + esc(userName(c.doneBy)) + ', ' + fmtDate(c.doneAt).slice(0, 5) + '</div>' : '') + '</td>' +
      '<td>' + action + '</td>' +
      '</tr>';
  }

  /* ---------------------------------------------------------------------
   * Справка (раздел 7.8)
   * --------------------------------------------------------------------- */

  var HELP_LINKS = [
    'Как заказать технику стажёру?',
    'Как создать адаптационную программу?',
    'Как изменить состав задач АП?',
    'Какие мероприятия стажёр пропустил?',
    'Как продлить стажировку?',
    'Как закрыть стажировку?',
    'Как узнать результат выполнения задач стажёром в Forus Team?'
  ];
  function renderHelp() {
    el('helpZone').classList.toggle('hidden', !state.helpOpen);
    el('helpZone').innerHTML = !state.helpOpen ? '' :
      '<div class="col gap-3">' +
      '<div class="row"><span class="tone-info">' + icon('help') + '</span><span class="h-block"' + a1c('Надпись', 'ДекорацияЗаголовокИнструкции') + '>Инструкции</span></div>' +
      HELP_LINKS.map(function (text, i) {
        return '<div>' + link(text, { action: 'openHelp', name: 'ГиперссылкаИнструкция' + (i + 1) }) + '</div>';
      }).join('') + '</div>';
  }

  // НЕ_ПЕРЕНОСИТЬ: демо-переключатель этапа выбранного стажёра
  function renderDemo() {
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    var html = '';
    if (t && state.demoMenuOpen) {
      html += '<div class="menu"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоМенюЭтапов') + '>' +
        STAGES.map(function (s) {
          return '<button type="button" data-action="demoSetStage" data-stage="' + s.code + '"' +
            a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоЭтап' + n1c(s.code)) + '>' + (t.stage === s.code ? '● ' : '○ ') + esc(s.title) + '</button>';
        }).join('') + '</div>';
    }
    if (state.markup) {
      html += '<span class="markup-flag"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ИндикаторРежимаРазметки') + '>Режим разметки 1С · Shift+D — выключить</span>';
    }
    html += '<button type="button" class="btn demo-btn" data-action="demoToggle"' +
      (t ? ' title="Сменить этап: ' + esc(t.fullName) + '"' : ' disabled title="Выберите стажёра, чтобы сменить этап"') +
      a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоКнопкаЭтап') + '><span>Демо: этап ' + (t ? '«' + esc(stageMeta(t.stage).title) + '» ' : '') + '▾</span></button>';
    el('demoDock').innerHTML = html;
  }

  function renderToasts() {
    el('toasts').innerHTML = state.toasts.map(function (m) {
      return '<div class="toast"' + a1c('ОповещениеПользователя', 'ОповещениеПользователя') + '>' + esc(m.text) + '</div>';
    }).join('');
  }

  /* =====================================================================
   * Действия
   * ===================================================================== */

  var toastSeq = 0;
  function toast(text) {
    var id = ++toastSeq;
    state.toasts.push({ id: id, text: text });
    renderToasts();
    setTimeout(function () {
      state.toasts = state.toasts.filter(function (m) { return m.id !== id; });
      renderToasts();
    }, 4000);
  }

  function addHistory(program, action) {
    program.history.push({ at: nowStamp(), userId: D.CURRENT_USER_ID, action: action });
  }

  // Смена этапа стажировки; даты последующих этапов очищаются
  function setStage(t, code) {
    var idx = stageIndex(code);
    STAGES.forEach(function (s, i) { if (i > idx) delete t.stageDates[s.code]; });
    if (!t.stageDates[code] || t.stage !== code) t.stageDates[code] = D.TODAY;
    t.stage = code;
    if (code === 'draft' && !t.draftSince) t.draftSince = D.TODAY;
    if (code !== 'draft') t.draftSince = code === 'found' ? null : t.draftSince;
    if (code === 'closed') {
      t.closedAt = t.closedAt || D.TODAY;
      t.closeKind = t.closeKind || 'passed';
    } else {
      t.closedAt = null;
      t.closeKind = null;
    }
  }

  /* =====================================================================
   * Диалоги (раздел 7.7). В 1С — отдельные формы, открытые с блокировкой окна владельца.
   * state.dialog = {type, traineeId, values, errors}
   * ===================================================================== */

  // Строка поля: подпись слева, поле справа, ошибка под полем
  function field(label, control, opts) {
    opts = opts || {};
    var err = opts.error ? '<div class="field-error"' + a1c('Надпись', 'ДекорацияОшибка' + (opts.name || '')) + '>' + esc(opts.error) + '</div>' : '';
    return '<div class="field-row">' +
      '<label class="field-label"' + (opts.forId ? ' for="' + opts.forId + '"' : '') + '>' + esc(label) +
      (opts.required ? '<span class="req" title="Обязательное поле"> *</span>' : '') + '</label>' +
      '<div class="col gap-1 grow">' + control + err + '</div></div>';
  }
  function dlgValue(name) { var v = state.dialog.values[name]; return v == null ? '' : v; }
  function inputText(name, oneC, attrs) {
    return '<input type="text" class="input grow" id="f_' + name + '" data-field="' + name + '" value="' + esc(dlgValue(name)) + '"' +
      (attrs || '') + (state.dialog.errors[name] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', oneC) + '>';
  }
  function inputDate(name, oneC, min) {
    return '<input type="date" class="input" id="f_' + name + '" data-field="' + name + '" value="' + esc(dlgValue(name)) + '"' +
      (min ? ' min="' + min + '"' : '') + (state.dialog.readOnly ? ' disabled' : '') + (state.dialog.errors[name] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', oneC) + '>';
  }
  function textarea(name, oneC) {
    return '<textarea class="textarea grow" rows="3" id="f_' + name + '" data-field="' + name + '"' +
      (state.dialog.readOnly ? ' disabled' : '') + (state.dialog.errors[name] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', oneC) + '>' + esc(dlgValue(name)) + '</textarea>';
  }
  function selectUser(name, oneC) {
    return '<select class="select grow" id="f_' + name + '" data-field="' + name + '"' + a1c('ПолеВвода', oneC) + '>' +
      D.users.map(function (u) {
        return '<option value="' + u.id + '"' + (dlgValue(name) === u.id ? ' selected' : '') + '>' + esc(u.fullName + ' — ' + u.role) + '</option>';
      }).join('') + '</select>';
  }
  function choice(name, oneC, items) {
    return '<div class="toggle' + (state.dialog.errors[name] ? ' invalid' : '') + '" role="radiogroup"' + a1c('Тумблер', oneC) + '>' +
      items.map(function (it) {
        return '<button type="button" role="radio" aria-checked="' + (dlgValue(name) === it.value) + '" class="' + (dlgValue(name) === it.value ? 'on' : '') + '"' +
          ' data-action="dlgChoose" data-field="' + name + '" data-value="' + it.value + '"' + a1c('Тумблер', oneC + 'Вариант' + it.name) + '>' + esc(it.text) + '</button>';
      }).join('') + '</div>';
  }
  function required(v) { return String(v == null ? '' : v).trim() !== ''; }
  function personName(role) { return role === 'mentor' ? 'Наставник' : 'Руководитель стажировки'; }

  var DIALOGS = {
    sendToApproval: {
      title: 'Отправить на согласование', form: 'ФормаОтправкаНаСогласование', submit: 'Отправить на согласование',
      body: function (t) {
        return '<p class="dlg-text">Адаптационная программа стажёра ' + esc(t.fullName) + ' будет отправлена на согласование.</p>' +
          field('Комментарий', textarea('comment', 'ПолеКомментарий'), { forId: 'f_comment' });
      },
      apply: function (t, v) {
        var program = programOf(t);
        setStage(t, 'approval');
        t.changedAfterApproval = false;
        t.rejectionComment = null;
        addHistory(program, 'АП отправлена на согласование' + (required(v.comment) ? '. Комментарий: «' + v.comment.trim() + '»' : ''));
        toast('АП отправлена на согласование');
      }
    },
    extend: {
      title: 'Продлить срок', form: 'ФормаПродлитьСрок', submit: 'Продлить срок',
      init: function (t) { return { endDate: addDays(t.endDate, 30), reason: '' }; },
      body: function (t) {
        return '<p class="dlg-text">Текущая дата окончания стажировки: ' + fmtDate(t.endDate) + '.</p>' +
          field('Новая дата окончания', inputDate('endDate', 'ПолеНоваяДатаОкончания', addDays(t.endDate, 1)),
            { required: true, error: state.dialog.errors.endDate, forId: 'f_endDate', name: 'НоваяДатаОкончания' }) +
          field('Причина', textarea('reason', 'ПолеПричинаПродления'), { required: true, error: state.dialog.errors.reason, forId: 'f_reason', name: 'ПричинаПродления' });
      },
      validate: function (t, v) {
        var e = {};
        if (!required(v.endDate)) e.endDate = 'Укажите новую дату окончания';
        else if (v.endDate <= t.endDate) e.endDate = 'Дата должна быть не раньше ' + fmtDate(addDays(t.endDate, 1));
        if (!required(v.reason)) e.reason = 'Укажите причину продления';
        return e;
      },
      apply: function (t, v) {
        var old = t.endDate;
        t.endDate = v.endDate;
        var program = programOf(t);
        if (program) addHistory(program, 'Срок стажировки продлён: ' + fmtDate(old) + ' → ' + fmtDate(v.endDate) + '. Причина: «' + v.reason.trim() + '»');
        toast('Срок стажировки продлён до ' + fmtDate(v.endDate));
      }
    },
    close: {
      title: 'Начать закрытие стажировки', form: 'ФормаЗакрытиеСтажировки', submit: 'Начать закрытие стажировки',
      body: function (t) {
        var st = statsOf(t) || { done: 0, total: 0, overdue: 0 };
        return '<div class="dlg-summary"' + a1c('Надпись', 'ДекорацияСводкаЗадач') + '>Выполнено задач: <b>' + st.done + ' из ' + st.total + '</b>' +
          (st.overdue ? ', просрочено: <b class="danger-text">' + st.overdue + '</b>' : ', просроченных нет') + '</div>' +
          field('Результат', choice('result', 'ПолеРезультатСтажировки', [
            { value: 'passed', text: 'Стажировка пройдена', name: 'Пройдена' },
            { value: 'failed', text: 'Не пройдена', name: 'НеПройдена' }
          ]), { required: true, error: state.dialog.errors.result, name: 'РезультатСтажировки' }) +
          field('Комментарий', textarea('comment', 'ПолеКомментарийЗакрытия'), { forId: 'f_comment' });
      },
      validate: function (t, v) { return required(v.result) ? {} : { result: 'Выберите результат стажировки' }; },
      apply: function (t, v) {
        t.closeKind = v.result;
        t.closedAt = D.TODAY;
        setStage(t, 'closed');
        var program = programOf(t);
        if (program) addHistory(program, 'Стажировка закрыта. Результат: ' + (v.result === 'passed' ? 'пройдена' : 'не пройдена') +
          (required(v.comment) ? '. Комментарий: «' + v.comment.trim() + '»' : ''));
        toast('Стажировка закрыта');
      }
    },
    cancel: {
      title: 'Отменить стажировку', form: 'ФормаОтменаСтажировки', submit: 'Отменить стажировку', danger: true,
      body: function (t) {
        return '<div class="note note-warning"' + a1c('ГруппаГоризонтальная', 'ГруппаПредупреждениеОтмена') + '><span class="tone-warning">' + icon('alert') + '</span>' +
          '<span class="grow">Стажировка ' + esc(t.fullName) + ' будет отменена. Адаптационная программа и чек-лист станут доступны только для просмотра.</span></div>' +
          field('Причина', textarea('reason', 'ПолеПричинаОтмены'), { required: true, error: state.dialog.errors.reason, forId: 'f_reason', name: 'ПричинаОтмены' });
      },
      validate: function (t, v) { return required(v.reason) ? {} : { reason: 'Укажите причину отмены' }; },
      apply: function (t, v) {
        t.closeKind = 'cancelled';
        t.closedAt = D.TODAY;
        setStage(t, 'closed');
        var program = programOf(t);
        if (program) addHistory(program, 'Стажировка отменена. Причина: «' + v.reason.trim() + '»');
        toast('Стажировка отменена');
      }
    },
    changeMentor: personDialog('mentor'),
    changeHead: personDialog('head'),
    history: {
      title: 'История изменений АП', form: 'ФормаИсторияИзмененийАП', submit: 'Закрыть', wide: true, readOnly: true,
      body: function (t) {
        var program = programOf(t);
        var rows = program.history.slice().reverse().map(function (h) {
          return '<tr><td class="nowrap">' + fmtDateTime(h.at) + '</td><td class="nowrap">' + esc(userName(h.userId)) + '</td><td>' + esc(h.action) + '</td></tr>';
        }).join('');
        return '<div class="table-box dlg-table"><table class="grid"' + a1c('ТаблицаФормы', 'ТаблицаИсторияИзменений') + '>' +
          '<thead><tr><th>Дата и время</th><th>Пользователь</th><th>Действие</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      }
    }
  };

  function personDialog(role) {
    var key = role === 'mentor' ? 'mentorId' : 'headId';
    var title = role === 'mentor' ? 'Сменить наставника' : 'Сменить руководителя стажировки';
    return {
      title: title, form: role === 'mentor' ? 'ФормаСменитьНаставника' : 'ФормаСменитьРуководителя', submit: 'Сохранить',
      init: function (t) { return { userId: t[key] }; },
      body: function (t) {
        return field(personName(role), selectUser('userId', 'ПолеСотрудник'), { required: true, forId: 'f_userId' });
      },
      apply: function (t, v) {
        var old = t[key];
        if (old === v.userId) return;
        t[key] = v.userId;
        // Невыполненные пункты чек-листа переходят к новому ответственному
        checklistOf(t).forEach(function (c) {
          if (!c.done && c.responsibleRole === role) c.responsibleId = v.userId;
        });
        var program = programOf(t);
        if (program) addHistory(program, personName(role) + ' изменён: ' + userName(old) + ' → ' + userName(v.userId));
        toast(personName(role) + ' изменён: ' + userName(v.userId));
      }
    };
  }

  /* ---------- Диалоги: задачи и создание АП ---------- */

  function dlgCtx() { return state.dialog.ctx || {}; }
  function dlgRO() { return !!state.dialog.readOnly; }
  function ro() { return dlgRO() ? ' disabled' : ''; }
  // Задачи, к которым применяется массовое действие: из строки или выбранные флажками
  function targetTasks(t) {
    var ids = dlgCtx().taskIds || selectedTaskIds(t);
    return ids.map(taskById).filter(Boolean);
  }
  function selectOptions(name, oneC, options, attrs) {
    return '<select class="select grow" id="f_' + name + '" data-field="' + name + '"' + (attrs || '') + ro() +
      (state.dialog.errors[name] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', oneC) + '>' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(dlgValue(name)) === String(o.value) ? ' selected' : '') + '>' + esc(o.text) + '</option>';
      }).join('') + '</select>';
  }
  function userOptions(emptyText) {
    var list = D.users.map(function (u) { return { value: u.id, text: u.fullName + ' — ' + u.role }; });
    return emptyText ? [{ value: '', text: emptyText }].concat(list) : list;
  }
  // Список пользователей с флажками (наблюдатели)
  function userCheckList(name, oneC) {
    var cur = state.dialog.values[name] || [];
    return '<div class="check-list' + (state.dialog.errors[name] ? ' invalid' : '') + '"' + a1c('ТаблицаФормы', oneC) + '>' +
      D.users.map(function (u) {
        return '<label class="check"><input type="checkbox" data-field-list="' + name + '" value="' + u.id + '"' +
          (cur.indexOf(u.id) >= 0 ? ' checked' : '') + ro() + a1c('Флажок', oneC + 'Пометка') + '> ' +
          esc(u.fullName) + ' <span class="muted text-s">' + esc(u.role) + '</span></label>';
      }).join('') + '</div>';
  }
  function namesOf(ids) { return ids.map(userName).join(', '); }
  function sameList(a, b) { return a.slice().sort().join() === b.slice().sort().join(); }

  // Карточка задачи — форма «Задача адаптационной программы» (FT_2).
  // Открывается для новой задачи, существующей задачи АП и задачи шаблона (только просмотр).
  function templateTaskOf(ctx) { var tp = byId(D.templates, ctx.templateId); return tp ? tp.tasks[ctx.index] : null; }
  function taskTypeText(v) { for (var i = 0; i < D.taskTypes.length; i++) if (D.taskTypes[i].value === v) return D.taskTypes[i].text; return v; }
  // Поле формы с подписью сверху
  function tfField(label, control, opts) {
    opts = opts || {};
    return '<div class="tf-field' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<label class="tf-label"' + (opts.forId ? ' for="' + opts.forId + '"' : '') + '>' + esc(label) +
      (opts.required && !dlgRO() ? '<span class="req" title="Обязательное поле"> *</span>' : '') + '</label>' + control +
      (opts.error ? '<div class="field-error"' + a1c('Надпись', 'ДекорацияОшибка' + (opts.name || '')) + '>' + esc(opts.error) + '</div>' : '') +
      '</div>';
  }
  // Таблица «Ссылки для ознакомления»: командная панель «Создать» / «Удалить», флажки выбора строк
  function linksTable() {
    var links = state.dialog.values.links;
    var ro_ = dlgRO();
    var sel = links.filter(function (l) { return l.sel; }).length;
    var rows = links.map(function (l, i) {
      return '<tr>' +
        (ro_ ? '' : '<td><input type="checkbox" data-link-sel="' + i + '"' + (l.sel ? ' checked' : '') + ' aria-label="Выбрать ссылку"' + a1c('Флажок', 'ТаблицаСсылкиВыбрана') + '></td>') +
        '<td>' + (ro_
          ? link(l.url, { action: 'openLinkUrl', data: { url: l.url }, title: 'Открыть ссылку', name: 'ТаблицаСсылкиСсылка' })
          : '<input type="text" class="input" data-link-field="url" data-idx="' + i + '" value="' + esc(l.url) + '" placeholder="Адрес ссылки"' +
            (state.dialog.errors.links && !required(l.url) ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', 'ТаблицаСсылкиСсылка') + '>') + '</td>' +
        '<td>' + (ro_ ? '<span' + a1c('Надпись', 'ТаблицаСсылкиКомментарий') + '>' + esc(l.comment) + '</span>'
          : '<input type="text" class="input" data-link-field="comment" data-idx="' + i + '" value="' + esc(l.comment) + '" placeholder="Комментарий"' +
            a1c('ПолеВвода', 'ТаблицаСсылкиКомментарий') + '>') + '</td></tr>';
    }).join('');
    return '<div class="col gap-2 tf-links"' + a1c('ГруппаВертикальная', 'ГруппаСсылкиДляОзнакомления') + '>' +
      '<div class="bold"' + a1c('Надпись', 'ДекорацияСсылкиДляОзнакомления') + '>Ссылки для ознакомления</div>' +
      (ro_ ? '' : '<div class="row tf-links-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельСсылки') + '>' +
        button('Создать', { cls: 'btn-flat', icon: 'plus', action: 'linkAdd', name: 'КнопкаСоздатьСсылку' }) +
        button('Удалить', { cls: 'btn-flat', action: 'linkDelete', disabled: !sel, title: sel ? '' : 'Отметьте ссылки флажками', name: 'КнопкаУдалитьСсылки' }) + '</div>') +
      '<div class="table-box"><table class="grid links-table"' + a1c('ТаблицаФормы', 'ТаблицаСсылки') + '><thead><tr>' +
        (ro_ ? '' : '<th class="w-check"><input type="checkbox" data-link-all="1" title="Выбрать все"' + (links.length && sel === links.length ? ' checked' : '') +
          (links.length ? '' : ' disabled') + a1c('Флажок', 'ТаблицаСсылкиВыбратьВсе') + '></th>') +
        '<th>Ссылка</th><th>Комментарий</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="3" class="muted"' + a1c('Надпись', 'ДекорацияСсылокНет') + '>Ссылок нет</td></tr>') + '</tbody></table></div>' +
      (state.dialog.errors.links ? '<div class="field-error"' + a1c('Надпись', 'ДекорацияОшибкаСсылки') + '>' + esc(state.dialog.errors.links) + '</div>' : '') +
      '</div>';
  }

  DIALOGS.task = {
    form: 'ФормаЗадачаАП', submit: 'Сохранить', xl: true,
    titleFn: function () { var c = dlgCtx(); return c.taskId || c.templateId ? 'Задача адаптационной программы' : 'Новая задача адаптационной программы'; },
    init: function (t, ctx) {
      var x = ctx.taskId ? taskById(ctx.taskId) : null;
      var tt = ctx.templateId ? templateTaskOf(ctx) : null;
      var links = function (list) { return (list || []).map(function (l) { return { url: l.url, comment: l.comment, sel: false }; }); };
      if (tt) return { name: tt.name, block: tt.block, description: tt.description, deadline: addDays(t.startDate, tt.offsetDays), status: 'not_started',
        reviewerId: '', obsInherit: true, observers: [], result: '', type: tt.type, required: tt.required, links: links(tt.links) };
      if (!x) return { name: '', block: 'corp', description: '', deadline: '', status: 'not_started',
        reviewerId: '', obsInherit: true, observers: [], result: '', type: 'task', required: false, links: [] };
      return { name: x.name, block: x.block, description: x.description, deadline: x.deadline, status: x.status,
        reviewerId: x.reviewerId || '', obsInherit: !x.observerIds.length, observers: x.observerIds.slice(), result: x.result || '',
        type: x.type || 'task', required: !!x.required, links: links(x.links) };
    },
    body: function (t) {
      var program = programOf(t);
      var e = state.dialog.errors;
      var ctx = dlgCtx();
      var fromTemplate = !!ctx.templateId;
      var note = fromTemplate
        ? '<div class="note note-info"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаШаблона') + '><span class="tone-info">' + icon('info') + '</span><span' + a1c('Надпись', 'ДекорацияЗадачаШаблона') + '>' +
          esc('Задача шаблона «' + byId(D.templates, ctx.templateId).name + '». Только просмотр: изменить задачу можно после добавления в АП. Срок посчитан от даты выхода ' + fmtDate(t.startDate) + '.') + '</span></div>'
        : dlgRO() ? '<div class="note note-info"><span class="tone-info">' + icon('info') + '</span><span>' + esc(editLock(t)) + '</span></div>' : '';
      var reviewerId = dlgValue('reviewerId') || program.defaultReviewerId;
      var obs = dlgValue('obsInherit') ? [] : state.dialog.values.observers;
      var obsDefault = 'По умолчанию (' + namesOf(program.defaultObserverIds) + ')';
      var obsText = namesBrief(obs, 2);
      var obsTitle = obs.length ? obs.map(function (id) { return user(id).fullName; }).join(', ') : obsDefault;
      // Наблюдатели: поле со списком через запятую, выбор — форма с флажками, «✕» — вернуть «по умолчанию»
      var observersField = fromTemplate || dlgRO()
        ? '<input type="text" class="input grow" disabled value="' + esc(fromTemplate ? 'По умолчанию' : obs.length ? obsText : obsDefault) + '" title="' + esc(obsTitle) + '"' + a1c('ПолеВвода', 'ПолеНаблюдатели') + '>'
        : '<div class="input obs-field row gap-1" title="' + esc(obsTitle) + '">' +
            '<input type="text" readonly class="obs-text grow' + (obs.length ? '' : ' muted') + '" id="f_observers" data-action="openObserversPicker"' +
              ' value="' + esc(obs.length ? obsText : '') + '" placeholder="' + esc(obsDefault) + '"' + (e.observers ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', 'ПолеНаблюдатели') + '>' +
            (obs.length ? button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Очистить: наблюдатели по умолчанию', action: 'observersClear', name: 'КнопкаОчиститьНаблюдателей' }) : '') +
            button('…', { cls: 'btn-icon btn-flat btn-small', title: 'Выбрать наблюдателей', action: 'openObserversPicker', name: 'КнопкаВыбратьНаблюдателей' }) +
          '</div>';
      return note + '<div class="col gap-4 task-form"' + a1c('ГруппаВертикальная', 'ГруппаЗадачаОсновное') + '>' +
        '<div class="tf-row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаНазвание') + '>' +
          tfField('Название задачи', inputText('name', 'ПолеНазваниеЗадачи', ro()), { required: true, error: e.name, forId: 'f_name', name: 'НазваниеЗадачи', cls: 'tf-wide' }) +
          '<div class="tf-field tf-spacer"></div>' +
        '</div>' +
        '<div class="tf-row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаПроверяющийНаблюдатели') + '>' +
          tfField('Проверяющий', '<div class="row gap-2">' +
              (fromTemplate
                ? '<input type="text" class="input grow" disabled value="Назначается в АП (по умолчанию — наставник)"' + a1c('ПолеВвода', 'ПолеПроверяющий') + '>'
                : selectOptions('reviewerId', 'ПолеПроверяющий', userOptions('По умолчанию (' + userName(program.defaultReviewerId) + ')'))) +
              (fromTemplate ? '' : button('', { cls: 'btn-icon btn-flat', icon: 'openCard', action: 'openReviewerCard',
                title: 'Открыть карточку сотрудника: ' + user(reviewerId).fullName, name: 'КнопкаОткрытьКарточкуПроверяющего' })) + '</div>',
            { forId: 'f_reviewerId' }) +
          tfField('Наблюдатели', observersField, { forId: 'f_observers', error: e.observers, name: 'Наблюдатели' }) +
        '</div>' +
        '<div class="tf-row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаТипСрок') + '>' +
          tfField('Тип задачи', selectOptions('type', 'ПолеТипЗадачи', D.taskTypes), { forId: 'f_type' }) +
          tfField('Срок выполнения', inputDate('deadline', 'ПолеСрокВыполнения'), { required: true, error: e.deadline, forId: 'f_deadline', name: 'СрокВыполнения' }) +
        '</div>' +
        '<div class="tf-row tf-row-bottom"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаБлокСтатус') + '>' +
          tfField('Блок', selectOptions('block', 'ПолеБлок', [{ value: 'corp', text: 'Корпоративный' }, { value: 'spec', text: 'Специальный' }]), { forId: 'f_block', cls: 'tf-half' }) +
          (fromTemplate ? '<div class="tf-field tf-half"></div>' :
            tfField('Статус', selectOptions('status', 'ПолеСтатус', [
              { value: 'not_started', text: 'Не начата' }, { value: 'in_progress', text: 'В работе' }, { value: 'done', text: 'Выполнена' }]), { forId: 'f_status', cls: 'tf-half' })) +
          '<div class="tf-field"><label class="check tf-check"><input type="checkbox" data-field="required"' + (dlgValue('required') ? ' checked' : '') + ro() +
            a1c('Флажок', 'ПолеОбязательная') + '> Обязательная</label></div>' +
        '</div>' +
        tfField('Описание задачи', '<textarea class="textarea tf-textarea" rows="6" id="f_description" data-field="description"' + ro() +
          a1c('ПолеВвода', 'ПолеОписаниеЗадачи') + '>' + esc(dlgValue('description')) + '</textarea>', { forId: 'f_description' }) +
        '<div class="tf-row tf-row-top"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаРезультатСсылки') + '>' +
          (fromTemplate ? '' : tfField('Результат выполнения задачи стажером', '<textarea class="textarea tf-textarea" rows="6" id="f_result" data-field="result"' + ro() +
            a1c('ПолеВвода', 'ПолеРезультатВыполнения') + '>' + esc(dlgValue('result')) + '</textarea>', { forId: 'f_result' })) +
          linksTable() +
        '</div>' +
        '</div>';
    },
    validate: function (t, v) {
      var e = {};
      if (!required(v.name)) e.name = 'Укажите название задачи';
      if (!required(v.deadline)) e.deadline = 'Укажите срок выполнения';
      if (!v.obsInherit && !(v.observers || []).length) e.observers = 'Выберите наблюдателей или отметьте «Как в АП»';
      if (v.links.some(function (l) { return !required(l.url) && required(l.comment); })) e.links = 'Укажите адрес ссылки или удалите строку';
      return e;
    },
    apply: function (t, v) {
      var program = programOf(t);
      var spec = {
        name: v.name.trim(), block: v.block, description: (v.description || '').trim(), deadline: v.deadline, status: v.status,
        reviewerId: v.reviewerId || null, observerIds: v.obsInherit ? [] : v.observers.slice(), result: required(v.result) ? v.result.trim() : null,
        type: v.type, required: !!v.required,
        links: v.links.filter(function (l) { return required(l.url); }).map(function (l) { return { url: l.url.trim(), comment: (l.comment || '').trim() }; })
      };
      var x = dlgCtx().taskId ? taskById(dlgCtx().taskId) : null;
      if (!x) {
        D.tasks.push(newTask(program, spec));
        programChanged(t, 'Добавлена задача «' + spec.name + '»');
        toast('Задача добавлена');
        return;
      }
      // Изменением АП считаются наименование, срок, блок, тип, обязательность, проверяющий и наблюдатели;
      // статус, результат, описание и ссылки — нет
      var changed = [];
      if (x.name !== spec.name) changed.push('наименование');
      if (x.deadline !== spec.deadline) changed.push('срок ' + fmtDate(x.deadline) + ' → ' + fmtDate(spec.deadline));
      if (x.block !== spec.block) changed.push('блок');
      if ((x.type || 'task') !== spec.type) changed.push('тип: ' + taskTypeText(spec.type));
      if (!!x.required !== spec.required) changed.push(spec.required ? 'стала обязательной' : 'стала необязательной');
      if ((x.reviewerId || null) !== spec.reviewerId) changed.push('проверяющий');
      if (!sameList(x.observerIds, spec.observerIds)) changed.push('наблюдатели');
      var oldName = x.name;
      for (var k in spec) x[k] = spec[k];
      if (changed.length) programChanged(t, 'Изменена задача «' + oldName + '»: ' + changed.join(', '));
      toast('Задача сохранена');
    }
  };

  // Выбор наблюдателей задачи: список сотрудников с флажками и поиском; «Как в АП» — наблюдатели по умолчанию
  DIALOGS.observersPicker = {
    title: 'Выбор наблюдателей', form: 'ФормаВыборНаблюдателей', submit: 'Выбрать',
    init: function (t, ctx) {
      var owner = state.dialogStack[state.dialogStack.length - 1]; // карточка задачи — форма-владелец
      return { inherit: !!owner.values.obsInherit || !owner.values.observers.length, picked: owner.values.observers.slice(), q: '' };
    },
    body: function (t) {
      var program = programOf(t);
      var v = state.dialog.values;
      var q = v.q.trim().toLowerCase();
      var list = D.users.filter(function (u) { return !q || u.fullName.toLowerCase().indexOf(q) >= 0; });
      return '<label class="check"><input type="checkbox" data-field="inherit" data-rerender="1"' + (v.inherit ? ' checked' : '') +
          a1c('Флажок', 'ПолеКакВАП') + '> Как в АП (по умолчанию: ' + esc(namesOf(program.defaultObserverIds)) + ')</label>' +
        '<input type="text" class="input" data-field="q" placeholder="Поиск по ФИО" value="' + esc(v.q) + '"' + (v.inherit ? ' disabled' : '') +
          ' title="Поиск по ФИО"' + a1c('ПолеВвода', 'ПолеПоискНаблюдателя') + '>' +
        '<div class="check-list picker-list' + (state.dialog.errors.picked ? ' invalid' : '') + '"' + a1c('ТаблицаФормы', 'ТаблицаВыборНаблюдателей') + '>' +
          (list.length ? list.map(function (u) {
            return '<label class="check' + (v.inherit ? ' muted' : '') + '"><input type="checkbox" data-field-list="picked" value="' + u.id + '"' +
              (v.picked.indexOf(u.id) >= 0 ? ' checked' : '') + (v.inherit ? ' disabled' : '') + a1c('Флажок', 'ТаблицаВыборНаблюдателейПометка') + '> ' +
              esc(u.fullName) + ' <span class="muted text-s">' + esc(u.role) + '</span></label>';
          }).join('') : '<span class="muted"' + a1c('Надпись', 'ДекорацияНикогоНеНашли') + '>Никого не нашли</span>') +
        '</div>' +
        (state.dialog.errors.picked ? '<div class="field-error"' + a1c('Надпись', 'ДекорацияОшибкаВыборНаблюдателей') + '>' + esc(state.dialog.errors.picked) + '</div>' : '') +
        (!v.inherit && v.picked.length ? '<div class="muted text-s"' + a1c('Надпись', 'ДекорацияВыбраноНаблюдателей') + '>Выбрано: ' + v.picked.length + '</div>' : '');
    },
    validate: function (t, v) { return v.inherit || v.picked.length ? {} : { picked: 'Отметьте наблюдателей или включите «Как в АП»' }; },
    // Результат выбора возвращается в карточку задачи (форму-владельца), изменение АП — при её сохранении
    apply: function (t, v) {
      var owner = state.dialogStack[state.dialogStack.length - 1];
      owner.values.obsInherit = v.inherit;
      owner.values.observers = v.inherit ? [] : v.picked.slice();
      delete owner.errors.observers;
    }
  };

  DIALOGS.massReviewer = {
    title: 'Назначить проверяющего', form: 'ФормаНазначитьПроверяющего', submit: 'Назначить',
    init: function (t) { return { userId: '' }; },
    body: function (t) {
      return '<p class="dlg-text">Задач: ' + targetTasks(t).length + '</p>' +
        field('Проверяющий', selectOptions('userId', 'ПолеПроверяющий', userOptions('Выберите сотрудника')),
          { required: true, error: state.dialog.errors.userId, forId: 'f_userId', name: 'Проверяющий' });
    },
    validate: function (t, v) { return required(v.userId) ? {} : { userId: 'Выберите проверяющего' }; },
    apply: function (t, v) {
      var list = targetTasks(t);
      list.forEach(function (x) { x.reviewerId = v.userId; });
      programChanged(t, 'Назначен проверяющий ' + userName(v.userId) + ': ' + (list.length === 1 ? 'задача «' + list[0].name + '»' : 'задач ' + list.length));
      state.selectedTasks = {};
      toast('Проверяющий назначен: ' + userName(v.userId));
    }
  };

  DIALOGS.massObservers = {
    title: 'Наблюдатели', form: 'ФормаНаблюдатели', submit: 'Сохранить',
    init: function () { return { mode: 'add', observers: [] }; },
    body: function (t) {
      return '<p class="dlg-text">Задач: ' + targetTasks(t).length + '</p>' +
        field('Действие', choice('mode', 'ПолеСпособИзменения', [
          { value: 'add', text: 'Добавить к текущим', name: 'Добавить' }, { value: 'replace', text: 'Заменить', name: 'Заменить' }])) +
        field('Наблюдатели', userCheckList('observers', 'ТаблицаНаблюдатели'), { required: true, error: state.dialog.errors.observers, name: 'Наблюдатели' });
    },
    validate: function (t, v) { return v.observers.length ? {} : { observers: 'Выберите хотя бы одного наблюдателя' }; },
    apply: function (t, v) {
      var program = programOf(t);
      var list = targetTasks(t);
      list.forEach(function (x) {
        if (v.mode === 'replace') x.observerIds = v.observers.slice();
        else {
          var cur = observersOf(program, x).slice();
          v.observers.forEach(function (id) { if (cur.indexOf(id) < 0) cur.push(id); });
          x.observerIds = cur;
        }
      });
      programChanged(t, (v.mode === 'replace' ? 'Заменены' : 'Добавлены') + ' наблюдатели (' + namesOf(v.observers) + '): задач ' + list.length);
      state.selectedTasks = {};
      toast('Наблюдатели изменены');
    }
  };

  DIALOGS.massDeadline = {
    title: 'Перенести срок', form: 'ФормаПеренестиСрок', submit: 'Перенести срок',
    init: function () { return { mode: 'days', days: '7', date: '' }; },
    body: function (t) {
      var e = state.dialog.errors;
      return '<p class="dlg-text">Задач: ' + targetTasks(t).length + '</p>' +
        field('Способ', choice('mode', 'ПолеСпособПереноса', [
          { value: 'days', text: 'На N дней', name: 'НаДни' }, { value: 'date', text: 'На дату', name: 'НаДату' }])) +
        (dlgValue('mode') === 'days'
          ? field('Дней', '<input type="number" step="1" class="input input-num" id="f_days" data-field="days" value="' + esc(dlgValue('days')) + '"' +
              (e.days ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', 'ПолеДней') + '>' +
              '<div class="muted text-s">Отрицательное число переносит срок на более раннюю дату</div>', { required: true, error: e.days, forId: 'f_days', name: 'Дней' })
          : field('Новый срок', inputDate('date', 'ПолеНовыйСрок'), { required: true, error: e.date, forId: 'f_date', name: 'НовыйСрок' }));
    },
    validate: function (t, v) {
      if (v.mode === 'days') {
        var n = Number(v.days);
        return v.days !== '' && Math.round(n) === n && n !== 0 ? {} : { days: 'Укажите целое число дней, не равное нулю' };
      }
      return required(v.date) ? {} : { date: 'Укажите новый срок' };
    },
    apply: function (t, v) {
      var list = targetTasks(t);
      list.forEach(function (x) { x.deadline = v.mode === 'days' ? addDays(x.deadline, Number(v.days)) : v.date; });
      var how = v.mode === 'days' ? 'на ' + pluralN(Math.abs(Number(v.days)), W_DAYS) + (Number(v.days) < 0 ? ' раньше' : '') : 'на ' + fmtDate(v.date);
      programChanged(t, 'Перенесён срок ' + how + ': ' + (list.length === 1 ? 'задача «' + list[0].name + '»' : 'задач ' + list.length));
      state.selectedTasks = {};
      toast('Срок перенесён');
    }
  };

  DIALOGS.deleteTasks = {
    title: 'Удалить задачи', form: 'ФормаУдалитьЗадачи', submit: 'Удалить', danger: true,
    body: function (t) {
      var list = targetTasks(t);
      return '<p class="dlg-text"' + a1c('Надпись', 'ДекорацияВопросУдаления') + '>Удалить задач: ' + list.length + '?</p>' +
        (list.length <= 5 ? '<ul class="dlg-list">' + list.map(function (x) { return '<li>' + esc(x.name) + '</li>'; }).join('') + '</ul>' : '');
    },
    apply: function (t) {
      var list = targetTasks(t);
      D.tasks = D.tasks.filter(function (x) { return list.indexOf(x) < 0; });
      programChanged(t, list.length === 1 ? 'Удалена задача «' + list[0].name + '»' : 'Удалено задач: ' + list.length);
      state.selectedTasks = {};
      toast('Удалено задач: ' + list.length);
    }
  };

  DIALOGS.reviewers = {
    title: 'Проверяющие и наблюдатели', form: 'ФормаПроверяющиеИНаблюдатели', submit: 'Сохранить',
    init: function (t) {
      var p = programOf(t);
      return { reviewerId: p.defaultReviewerId, observers: p.defaultObserverIds.slice(), replaceAll: false };
    },
    body: function (t) {
      return '<p class="dlg-text muted">Применяются к задачам, у которых проверяющий и наблюдатели не заданы явно.</p>' +
        field('Проверяющий по умолчанию', selectOptions('reviewerId', 'ПолеПроверяющийПоУмолчанию', userOptions()), { required: true, forId: 'f_reviewerId' }) +
        field('Наблюдатели по умолчанию', userCheckList('observers', 'ТаблицаНаблюдателиПоУмолчанию'),
          { required: true, error: state.dialog.errors.observers, name: 'НаблюдателиПоУмолчанию' }) +
        field('', '<label class="check"><input type="checkbox" data-field="replaceAll"' + (dlgValue('replaceAll') ? ' checked' : '') +
          a1c('Флажок', 'ПолеЗаменитьУЗадачСДругимПроверяющим') + '> Заменить также у задач с другим проверяющим</label>');
    },
    validate: function (t, v) { return v.observers.length ? {} : { observers: 'Выберите хотя бы одного наблюдателя' }; },
    apply: function (t, v) {
      var p = programOf(t);
      var changed = [];
      if (p.defaultReviewerId !== v.reviewerId) changed.push('проверяющий по умолчанию: ' + userName(v.reviewerId));
      if (!sameList(p.defaultObserverIds, v.observers)) changed.push('наблюдатели по умолчанию: ' + namesOf(v.observers));
      p.defaultReviewerId = v.reviewerId;
      p.defaultObserverIds = v.observers.slice();
      if (v.replaceAll) {
        var n = 0;
        tasksOf(p).forEach(function (x) { if (x.reviewerId) { x.reviewerId = null; n++; } });
        if (n) changed.push('проверяющий заменён у задач: ' + n);
      }
      if (changed.length) programChanged(t, 'Изменено: ' + changed.join('; '));
      toast('Проверяющие и наблюдатели сохранены');
    }
  };

  // Выбор шаблона для создания АП
  function templateTable(field_, oneC) {
    var rec = recommendedTemplate(trainee(state.dialog.traineeId));
    return '<div class="table-box dlg-table"><table class="grid"' + a1c('ТаблицаФормы', oneC) + '>' +
      '<thead><tr><th></th><th>Шаблон</th><th>Должность</th><th class="num">Корп. / спец. задач</th></tr></thead><tbody>' +
      D.templates.map(function (tp) {
        var on = dlgValue(field_) === tp.id;
        var corpN = tp.tasks.filter(function (x) { return x.block === 'corp'; }).length;
        return '<tr class="clickable' + (on ? ' selected' : '') + '" data-action="dlgChoose" data-field="' + field_ + '" data-value="' + tp.id + '">' +
          '<td><input type="radio" name="' + field_ + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(tp.name) + '"' + a1c('Флажок', oneC + 'Выбран') + '></td>' +
          '<td>' + esc(tp.name) + (rec && rec.id === tp.id ? ' ' + badge('success', 'Подходит для должности', 'ДекорацияРекомендуемыйШаблон') : '') + '</td>' +
          '<td>' + esc(tp.position || 'Для всех должностей') + '</td>' +
          '<td class="num">' + corpN + ' / ' + (tp.tasks.length - corpN) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function templateTasksFor(t, tp) {
    return tp.tasks.map(function (x) {
      return { block: x.block, name: x.name, description: x.description, deadline: addDays(t.startDate, x.offsetDays),
        type: x.type, required: x.required, links: x.links };
    });
  }

  DIALOGS.createFromTemplate = {
    title: 'Выбор шаблона', form: 'ФормаВыборШаблона', submit: 'Создать АП', wide: true,
    init: function (t) {
      var rec = recommendedTemplate(t) || byId(D.templates, 'tpl-base');
      return { template: rec.id };
    },
    body: function (t) {
      return '<p class="dlg-text">Сроки задач посчитаются от даты выхода стажёра ' + fmtDate(t.startDate) + '.</p>' +
        templateTable('template', 'ТаблицаШаблоны') +
        (state.dialog.errors.template ? '<div class="field-error">' + esc(state.dialog.errors.template) + '</div>' : '');
    },
    validate: function (t, v) { return v.template ? {} : { template: 'Выберите шаблон' }; },
    apply: function (t, v) {
      var tp = byId(D.templates, v.template);
      createProgram(t, tp.id, 'АП создана по шаблону «' + tp.name + '»', templateTasksFor(t, tp));
    }
  };

  DIALOGS.createCopy = {
    title: 'Копирование АП', form: 'ФормаКопированиеАП', submit: 'Создать АП', wide: true,
    init: function () { return { source: '' }; },
    body: function (t) {
      var list = D.trainees.filter(function (x) { return x.id !== t.id && programOf(x) && tasksOf(programOf(x)).length; });
      return '<p class="dlg-text">Задачи скопируются без статусов и результатов, сроки сдвинутся на дату выхода ' + fmtDate(t.startDate) + '.</p>' +
        '<div class="table-box dlg-table"><table class="grid"' + a1c('ТаблицаФормы', 'ТаблицаСтажерыСАП') + '>' +
        '<thead><tr><th></th><th>ФИО</th><th>Должность</th><th class="num">Задач</th></tr></thead><tbody>' +
        list.map(function (x) {
          var on = dlgValue('source') === x.id;
          return '<tr class="clickable' + (on ? ' selected' : '') + '" data-action="dlgChoose" data-field="source" data-value="' + x.id + '">' +
            '<td><input type="radio" name="source"' + (on ? ' checked' : '') + ' aria-label="' + esc(x.fullName) + '"' + a1c('Флажок', 'ТаблицаСтажерыСАПВыбран') + '></td>' +
            '<td>' + esc(x.fullName) + '</td><td>' + esc(x.position) + (x.position === t.position ? ' ' + badge('success', 'Та же должность', 'ДекорацияТаЖеДолжность') : '') + '</td>' +
            '<td class="num">' + tasksOf(programOf(x)).length + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (state.dialog.errors.source ? '<div class="field-error">' + esc(state.dialog.errors.source) + '</div>' : '');
    },
    validate: function (t, v) { return v.source ? {} : { source: 'Выберите стажёра, у которого копировать АП' }; },
    apply: function (t, v) {
      var src = trainee(v.source);
      var specs = tasksOf(programOf(src)).map(function (x) {
        return { block: x.block, name: x.name, description: x.description,
          deadline: addDays(t.startDate, diffDays(src.startDate, x.deadline)), type: x.type, required: x.required, links: x.links };
      });
      createProgram(t, programOf(src).templateId, 'АП создана копированием у стажёра ' + src.fullName, specs);
    }
  };

  DIALOGS.createEmpty = {
    title: 'Создать пустую АП', form: 'ФормаСоздатьПустуюАП', submit: 'Создать пустую АП',
    body: function (t) { return '<p class="dlg-text">Будет создана адаптационная программа без задач. Задачи можно добавить вручную или из шаблона.</p>'; },
    apply: function (t) { createProgram(t, null, 'АП создана с нуля', []); }
  };

  DIALOGS.addFromTemplate = {
    title: 'Добавить из шаблона', form: 'ФормаДобавитьИзШаблона', submit: 'Добавить', wide: true,
    init: function (t) {
      var p = programOf(t);
      return { template: (p.templateId && byId(D.templates, p.templateId) ? p.templateId : (recommendedTemplate(t) || D.templates[2]).id), picked: [] };
    },
    body: function (t) {
      var tp = byId(D.templates, dlgValue('template'));
      var picked = state.dialog.values.picked;
      var existing = tasksOf(programOf(t)).map(function (x) { return x.name; });
      var allOn = picked.length === tp.tasks.length;
      return field('Шаблон', selectOptions('template', 'ПолеШаблон', D.templates.map(function (x) { return { value: x.id, text: x.name }; }), ' data-rerender="1"'), { forId: 'f_template' }) +
        '<div class="table-box dlg-table"><table class="grid"' + a1c('ТаблицаФормы', 'ТаблицаЗадачиШаблона') + '>' +
        '<thead><tr><th><input type="checkbox" data-action="dlgPickAll" title="Выбрать все"' + (allOn ? ' checked' : '') + a1c('Флажок', 'ТаблицаЗадачиШаблонаВыбратьВсе') + '></th>' +
        '<th>Задача</th><th>Тип</th><th>Блок</th><th>Срок</th></tr></thead><tbody>' +
        tp.tasks.map(function (x, i) {
          var has = existing.indexOf(x.name) >= 0;
          return '<tr data-tpl-task="' + i + '" title="Двойной клик — открыть задачу шаблона"><td><input type="checkbox" data-field-list="picked" value="' + i + '"' + (picked.indexOf(String(i)) >= 0 ? ' checked' : '') +
            ' aria-label="' + esc(x.name) + '"' + a1c('Флажок', 'ТаблицаЗадачиШаблонаПометка') + '></td>' +
            '<td>' + link(x.name, { action: 'openTemplateTask', data: { index: i }, title: 'Открыть задачу шаблона', name: 'ТаблицаЗадачиШаблонаЗадача' }) +
              (x.required ? ' <span class="muted text-s">обязательная</span>' : '') + (has ? ' <span class="muted text-s">уже есть в АП</span>' : '') + '</td>' +
            '<td class="nowrap">' + esc(taskTypeText(x.type)) + '</td>' +
            '<td class="nowrap">' + blockMeta(x.block).short + '</td>' +
            '<td class="nowrap">' + fmtDate(addDays(t.startDate, x.offsetDays)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (state.dialog.errors.picked ? '<div class="field-error">' + esc(state.dialog.errors.picked) + '</div>' : '');
    },
    validate: function (t, v) { return v.picked.length ? {} : { picked: 'Отметьте задачи, которые нужно добавить' }; },
    apply: function (t, v) {
      var tp = byId(D.templates, v.template);
      var program = programOf(t);
      var specs = templateTasksFor(t, tp).filter(function (x, i) { return v.picked.indexOf(String(i)) >= 0; });
      specs.forEach(function (s) { D.tasks.push(newTask(program, s)); });
      programChanged(t, 'Добавлено задач из шаблона «' + tp.name + '»: ' + specs.length);
      toast('Добавлено задач: ' + specs.length);
    }
  };

  /* ---------- Диалоги: чек-лист подготовки ---------- */

  var requestSeq = 124;
  function checklistItemById(id) { return byId(D.checklist, id); }
  function markChecklistDone(c, done) {
    c.done = done;
    c.doneBy = done ? D.CURRENT_USER_ID : null;
    c.doneAt = done ? D.TODAY : null;
  }
  function roleDefaultUser(t, role) { return role === 'head' ? t.headId : role === 'hr' ? D.HR_ID : t.mentorId; }

  // Имитация формы документа «Заявка (0911)»
  DIALOGS.request0911 = {
    form: 'ФормаЗаявка0911', submit: 'Провести и закрыть',
    titleFn: function () { return 'Заявка (0911): ' + requestKind(checklistItemById(dlgCtx().itemId)); },
    init: function () { return { comment: '' }; },
    body: function (t) {
      var c = checklistItemById(dlgCtx().itemId);
      function fixed(label, value, name) {
        return field(label, '<input type="text" class="input grow" disabled value="' + esc(value) + '"' + a1c('ПолеВвода', name) + '>');
      }
      return fixed('Сотрудник', t.fullName, 'ПолеСотрудник') +
        fixed('Подразделение', dept(t.departmentId).name, 'ПолеПодразделение') +
        fixed('Дата выхода', fmtDate(t.startDate), 'ПолеДатаВыхода') +
        fixed('Вид заявки', requestKind(c).replace(/^./, function (x) { return x.toUpperCase(); }), 'ПолеВидЗаявки') +
        field('Комментарий', textarea('comment', 'ПолеКомментарийЗаявки'), { forId: 'f_comment' });
    },
    apply: function (t) {
      var c = checklistItemById(dlgCtx().itemId);
      var number = '0911-00' + (requestSeq++);
      c.linkedDocNumber = number;
      markChecklistDone(c, true);
      toast('Заявка ' + number + ' создана');
    }
  };

  DIALOGS.checklistItem = {
    title: 'Добавить пункт', form: 'ФормаПунктЧекЛиста', submit: 'Добавить пункт',
    init: function (t) { return { name: '', role: 'head', userId: t.headId, date: addDays(t.startDate, -1) }; },
    body: function (t) {
      var e = state.dialog.errors;
      var v = state.dialog.values;
      var hint = v.date ? '<div class="muted text-s">' + offsetText(diffDays(t.startDate, v.date)) + ' (выход ' + fmtDate(t.startDate) + ')</div>' : '';
      return field('Пункт', inputText('name', 'ПолеНаименованиеПункта'), { required: true, error: e.name, forId: 'f_name', name: 'НаименованиеПункта' }) +
        field('Ответственный', selectOptions('role', 'ПолеРольОтветственного', [
          { value: 'head', text: D.ROLE_TITLES.head }, { value: 'hr', text: D.ROLE_TITLES.hr }, { value: 'mentor', text: D.ROLE_TITLES.mentor }], ' data-rerender="1"'), { forId: 'f_role' }) +
        field('Сотрудник', selectOptions('userId', 'ПолеОтветственный', userOptions()), { forId: 'f_userId' }) +
        field('Срок', inputDate('date', 'ПолеСрокПункта') + hint, { required: true, error: e.date, forId: 'f_date', name: 'СрокПункта' });
    },
    validate: function (t, v) {
      var e = {};
      if (!required(v.name)) e.name = 'Укажите пункт';
      if (!required(v.date)) e.date = 'Укажите срок';
      return e;
    },
    apply: function (t, v) {
      D.checklist.push({
        id: 'cl-new-' + Date.now(), traineeId: t.id, name: v.name.trim(), responsibleRole: v.role, responsibleId: v.userId,
        offsetDays: diffDays(t.startDate, v.date), done: false, doneBy: null, doneAt: null, linkedDocType: null, linkedDocNumber: null
      });
      toast('Пункт добавлен');
    }
  };

  DIALOGS.checklistFill = {
    title: 'Заполнить по шаблону', form: 'ФормаЗаполнитьЧекЛист', submit: 'Заполнить по шаблону', danger: true,
    body: function (t) {
      return '<div class="note note-warning"' + a1c('ГруппаГоризонтальная', 'ГруппаПредупреждениеЗаполнение') + '><span class="tone-warning">' + icon('alert') + '</span>' +
        '<span class="grow">Текущий список будет заменён. Отметки о выполнении и ссылки на заявки будут удалены.</span></div>' +
        '<p class="dlg-text">В шаблоне ' + pluralN(D.checklistTemplate.length, ['пункт', 'пункта', 'пунктов']) + '.</p>';
    },
    apply: function (t) {
      D.checklist = D.checklist.filter(function (c) { return c.traineeId !== t.id; });
      var hasProgram = !!programOf(t);
      D.checklistTemplate.forEach(function (c, i) {
        var item = {
          id: 'cl-tpl-' + Date.now() + '-' + i, traineeId: t.id, name: c.name, responsibleRole: c.responsibleRole,
          responsibleId: roleDefaultUser(t, c.responsibleRole), offsetDays: c.offsetDays, done: false, doneBy: null, doneAt: null,
          linkedDocType: c.linkedDocType, linkedDocNumber: null
        };
        if (c.linkedDocType === 'program' && hasProgram) markChecklistDone(item, true);
        D.checklist.push(item);
      });
      state.checklistSel = null;
      toast('Чек-лист заполнен по шаблону');
    }
  };

  // Диалоги, которые меняют задачи АП и недоступны при запрете редактирования
  var EDIT_DIALOGS = ['massReviewer', 'massObservers', 'massDeadline', 'deleteTasks', 'reviewers', 'addFromTemplate'];

  // Диалоги открываются стеком: вложенная форма (например, задача шаблона поверх «Добавить из шаблона»)
  // закрывается и возвращает к форме-владельцу. opts.stack — открыть поверх текущей формы.
  function topModal() { var list = el('dialogHost').querySelectorAll('.modal-backdrop'); return list[list.length - 1] || null; }
  function focusFirst() {
    var m = topModal();
    var first = m && (m.querySelector('[data-field]:not([disabled]), [data-link-field]') || m.querySelector('.btn-primary'));
    if (first) first.focus();
  }
  function openDialog(type, traineeId, ctx, opts) {
    var def = DIALOGS[type];
    var t = trainee(traineeId);
    ctx = ctx || {};
    var lock = editLock(t);
    if (lock && EDIT_DIALOGS.indexOf(type) >= 0) { toast(lock); return; }
    if (checklistLock(t) && ['checklistItem', 'checklistFill', 'request0911'].indexOf(type) >= 0) { toast(checklistLock(t)); return; }
    if (type === 'task' && lock && !ctx.taskId && !ctx.templateId) { toast(lock); return; }
    state.openMenu = null;
    if (opts && opts.stack && state.dialog) state.dialogStack.push(state.dialog);
    else state.dialogStack = [];
    state.dialog = { type: type, traineeId: traineeId, ctx: ctx, values: {}, errors: {},
      readOnly: type === 'task' && (!!ctx.templateId || (!!lock && !!ctx.taskId)) };
    state.dialog.values = def.init ? def.init(t, ctx) : {};
    render();
    focusFirst();
  }
  function closeDialog() {
    state.dialog = state.dialogStack.pop() || null;
    renderDialog();
  }
  function submitDialog() {
    var d = state.dialog;
    var def = DIALOGS[d.type];
    var t = trainee(d.traineeId);
    if (def.readOnly || d.readOnly) { closeDialog(); return; }
    d.errors = def.validate ? def.validate(t, d.values) : {};
    if (Object.keys(d.errors).length) {
      renderDialog();
      var bad = topModal().querySelector('[aria-invalid="true"], .toggle.invalid button');
      if (bad) bad.focus();
      return;
    }
    def.apply(t, d.values);
    state.dialog = state.dialogStack.pop() || null;
    render();
  }

  function renderDialog() {
    var host = el('dialogHost');
    var top = state.dialog;
    if (!top) { host.innerHTML = ''; return; }
    // Формы-владельцы рисуются под текущей; тело формы читает state.dialog, поэтому он подменяется на время рендера
    host.innerHTML = state.dialogStack.concat([top]).map(function (d) {
      state.dialog = d;
      var def = DIALOGS[d.type];
      var t = trainee(d.traineeId);
      var title = def.titleFn ? def.titleFn() : def.title;
      var readOnly = def.readOnly || d.readOnly;
      return '<div class="modal-backdrop">' +
        '<div class="modal' + (def.xl ? ' modal-xl' : def.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"' +
        a1c('ОтдельнаяФорма', def.form) + '>' +
        '<div class="modal-head row"><span class="modal-title grow">' + esc(title) + '</span>' +
          '<span class="row gap-1 modal-sys" aria-hidden="true"' + a1c('НЕ_ПЕРЕНОСИТЬ', def.form + 'СистемныеКнопки') + '>' +
            '<span class="form-tool form-tool-s">' + shellIcon('more') + '</span><span class="form-tool form-tool-s">' + shellIcon('expand') + '</span></span>' +
          button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Закрыть', action: 'dialogCancel', name: def.form + 'Закрыть' }) + '</div>' +
        '<div class="modal-body col gap-3">' + def.body(t) + '</div>' +
        '<div class="modal-foot row"' + a1c('КоманднаяПанель', def.form + 'КоманднаяПанель') + '><span class="grow"></span>' +
          button(readOnly ? 'Закрыть' : def.submit, { cls: def.danger && !readOnly ? 'btn-danger' : 'btn-primary', action: 'dialogSubmit', name: def.form + 'Кнопка' + (readOnly ? 'Закрыть' : 'Выполнить') }) +
          (readOnly ? '' : button('Отмена', { action: 'dialogCancel', name: def.form + 'КнопкаОтмена' })) +
        '</div></div></div>';
    }).join('');
    state.dialog = top;
  }


  // Выбор стажёра из любого места: дерево раскрывается до него, вкладка — по этапу (раздел 5.4)
  function selectTrainee(id) {
    var t = trainee(id);
    state.selectedTraineeId = id;
    state.traineeTab = t.stage === 'found' ? 'prepare' : 'program';
    state.notesExpanded = false;
    state.taskFilter = null;
    state.openMenu = null;
    state.taskSort = { key: null, dir: 1 };
    state.selectedTasks = {};
    state.collapsedBlocks = {};
    state.checklistMode = 'all';
    state.checklistSort = 1;
    state.checklistFilter = null;
    state.checklistSel = null;
    deptChain(t.departmentId).forEach(function (d) { delete state.collapsed[d.id]; });
    render();
  }

  var actions = {
    topTab: function (btn) { state.topTab = btn.getAttribute('data-tab'); render(); },
    noop: function () {},

    // Левая панель
    counterFilter: function (btn) {
      var id = btn.getAttribute('data-id');
      state.counterFilter = state.counterFilter === id ? null : id;
      render();
    },
    clearCounterFilter: function () { state.counterFilter = null; render(); },
    resetSearch: function () { state.search = ''; render(); },
    toggleHideEmpty: function () { state.hideEmpty = !state.hideEmpty; state.openMenu = null; renderLeft(); },
    toggleDept: function (row) {
      if (searchQuery()) return; // при поиске ветки раскрыты
      var id = row.getAttribute('data-id');
      state.collapsed[id] = !state.collapsed[id];
      renderLeft();
    },
    toggleLeft: function () { state.leftCollapsed = !state.leftCollapsed; renderLeft(); },
    selectTrainee: function (row) { selectTrainee(row.getAttribute('data-id')); },
    backToList: function () {
      state.summaryCurrent = state.selectedTraineeId;
      state.summaryFocus = true;
      state.selectedTraineeId = null;
      render();
    },

    // Сводная таблица
    summaryRow: function (row, e) {
      if (e.target.closest('button')) return;
      state.summaryCurrent = row.getAttribute('data-id');
      renderSummaryCurrent(true);
    },
    sortSummary: function (btn) {
      var key = btn.getAttribute('data-key');
      if (state.summarySort.key === key) state.summarySort.dir = -state.summarySort.dir;
      else state.summarySort = { key: key, dir: 1 };
      renderCenter();
    },

    // Карточка стажёра
    traineeTab: function (btn) { state.traineeTab = btn.getAttribute('data-tab'); renderCenter(); },
    toggleMenu: function (btn) {
      var id = btn.getAttribute('data-menu');
      state.openMenu = state.openMenu === id ? null : id;
      menuOpenedAt = Date.now();
      renderLeft();
      renderCenter();
    },
    toggleHelp: function () { state.helpOpen = !state.helpOpen; render(); },
    openHelp: function () { toast('Инструкция откроется в базе знаний'); },
    toggleNotes: function () { state.notesExpanded = !state.notesExpanded; renderCenter(); },
    noteAction: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var id = btn.getAttribute('data-key');
      var n = id === 'stage_action' ? stageFallbackStep(t) : getNotifications(t).filter(function (x) { return x.id === id; })[0];
      if (!n) return;
      if (n.kind === 'action') {
        var a = noteActionOf(t, n);
        if (a === 'createProgram') actions.createProgram();
        else if (a === 'sendToApproval') openDialog('sendToApproval', t.id);
        else if (a === 'startClosing') openDialog('close', t.id);
        return;
      }
      // navigation: переключить вид на target — вкладку и, для задач, тумблер статусов
      state.traineeTab = TARGET_TAB[n.target.tab];
      if (n.target.tab === 'program') {
        state.selectedTasks = {};
        state.collapsedBlocks = {};
        state.taskFilter = n.target.filter ? TARGET_FILTER[n.target.filter] : null;
      } else {
        state.checklistMode = 'all';
        state.checklistFilter = 'overdue';
      }
      renderCenter();
    },
    createProgram: function () {
      state.traineeTab = 'program';
      renderCenter();
    },
    recallApproval: function () {
      var t = trainee(state.selectedTraineeId);
      setStage(t, 'draft');
      t.draftSince = D.TODAY;
      addHistory(programOf(t), 'АП отозвана с согласования');
      toast('АП отозвана с согласования');
      render();
    },
    printProgram: function () { toast('Файл ' + printFileName(trainee(state.selectedTraineeId)) + ' сформирован'); },
    openProgramDoc: function () { state.openMenu = null; renderCenter(); toast('Откроется форма документа'); },

    // Диалоги
    openDialog: function (btn) {
      var taskId = btn.getAttribute('data-task');
      var itemId = btn.getAttribute('data-item');
      openDialog(btn.getAttribute('data-dialog'), state.selectedTraineeId,
        taskId ? { taskId: taskId, taskIds: [taskId] } : itemId ? { itemId: itemId } : {});
    },
    dlgPickAll: function (box) {
      var tp = byId(D.templates, state.dialog.values.template);
      state.dialog.values.picked = box.checked ? tp.tasks.map(function (x, i) { return String(i); }) : [];
      delete state.dialog.errors.picked;
      renderDialog();
    },

    // Таблица задач
    taskFilter: function (btn) {
      var v = btn.getAttribute('data-value');
      state.taskFilter = v && v !== 'all' ? v : null;
      state.selectedTasks = {};
      renderCenter();
    },
    clearTaskSelection: function () {
      state.selectedTasks = {};
      renderCenter();
    },
    sortTasks: function (btn) {
      var key = btn.getAttribute('data-key');
      if (state.taskSort.key !== key) state.taskSort = { key: key, dir: 1 };
      else if (state.taskSort.dir > 0) state.taskSort.dir = -1;
      else state.taskSort = { key: null, dir: 1 }; // третий клик — порядок задач в АП
      renderCenter();
    },
    toggleBlockGroup: function (row) {
      var b = row.getAttribute('data-block');
      state.collapsedBlocks[b] = !state.collapsedBlocks[b];
      renderCenter();
    },
    moveTask: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var x = taskById(btn.getAttribute('data-task'));
      var dir = Number(btn.getAttribute('data-dir'));
      var siblings = tasksOf(programOf(t)).filter(function (y) { return y.block === x.block; });
      var other = siblings[siblings.indexOf(x) + dir];
      if (!other) return;
      var i = D.tasks.indexOf(x), j = D.tasks.indexOf(other);
      D.tasks[i] = other;
      D.tasks[j] = x;
      state.openMenu = null;
      programChanged(t, 'Изменён порядок задач: «' + x.name + '» ' + (dir < 0 ? 'выше' : 'ниже'));
      render();
    },
    openForus: function () { toast('Переход в Forus Team в прототипе не реализован'); },

    // Чек-лист подготовки
    clSelect: function (row, e) {
      if (e.target.closest('input, button')) return;
      state.checklistSel = row.getAttribute('data-id');
      renderCenter();
    },
    clMove: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var list = checklistOf(t);
      var c = checklistItemById(state.checklistSel);
      var other = list[list.indexOf(c) + Number(btn.getAttribute('data-dir'))];
      if (!c || !other) return;
      var i = D.checklist.indexOf(c), j = D.checklist.indexOf(other);
      D.checklist[i] = other;
      D.checklist[j] = c;
      renderCenter();
    },
    clMode: function (btn) { state.checklistMode = btn.getAttribute('data-value'); renderCenter(); },
    clSort: function () {
      state.checklistSort = state.checklistSort === 1 ? -1 : state.checklistSort === -1 ? 0 : 1;
      renderCenter();
    },
    clFilter: function () { state.checklistFilter = null; renderCenter(); },
    clOpenRequest: function () { toast('Откроется документ'); },
    clOpenBitrix: function () { toast('Переход во внешнюю систему в прототипе не реализован'); },
    dialogSubmit: function () { submitDialog(); },
    // Карточка задачи: ссылки для ознакомления, карточка проверяющего, задача шаблона
    linkAdd: function () {
      state.dialog.values.links.push({ url: '', comment: '', sel: false });
      renderDialog();
      var inputs = topModal().querySelectorAll('[data-link-field="url"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
    linkDelete: function () {
      state.dialog.values.links = state.dialog.values.links.filter(function (l) { return !l.sel; });
      delete state.dialog.errors.links;
      renderDialog();
    },
    openObserversPicker: function () {
      if (dlgRO()) return;
      openDialog('observersPicker', state.dialog.traineeId, {}, { stack: true });
    },
    observersClear: function () {
      state.dialog.values.obsInherit = true;
      state.dialog.values.observers = [];
      renderDialog();
    },
    openLinkUrl: function (btn) { toast('Ссылка откроется в браузере: ' + btn.getAttribute('data-url')); },
    openReviewerCard: function () {
      var program = programOf(trainee(state.dialog.traineeId));
      toast('Откроется карточка сотрудника: ' + user(state.dialog.values.reviewerId || program.defaultReviewerId).fullName);
    },
    openTemplateTask: function (btn) {
      openDialog('task', state.dialog.traineeId, { templateId: state.dialog.values.template, index: Number(btn.getAttribute('data-index')) }, { stack: true });
    },
    dialogCancel: function () { closeDialog(); },
    dlgChoose: function (btn) {
      state.dialog.values[btn.getAttribute('data-field')] = btn.getAttribute('data-value');
      delete state.dialog.errors[btn.getAttribute('data-field')];
      renderDialog();
      var on = topModal().querySelector('[data-action="dlgChoose"].on');
      if (on) on.focus();
    },

    // НЕ_ПЕРЕНОСИТЬ
    demoToggle: function () { state.demoMenuOpen = !state.demoMenuOpen; renderDemo(); },
    demoSetStage: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var code = btn.getAttribute('data-stage');
      if (code !== 'found' && !programOf(t)) {
        D.programs.push({
          id: 'pr-' + t.id + '-' + Date.now(), traineeId: t.id, templateId: null,
          defaultReviewerId: t.mentorId, defaultObserverIds: [t.headId],
          history: [{ at: nowStamp(), userId: D.CURRENT_USER_ID, action: 'АП создана (демо)' }]
        });
      }
      setStage(t, code);
      state.demoMenuOpen = false;
      render();
    }
  };

  document.addEventListener('click', function (e) {
    if (state.openMenu && !e.target.closest('.menu-host')) {
      state.openMenu = null;
      renderLeft();
      renderCenter();
    }
    var target = e.target.closest('[data-action]');
    if (!target || target.disabled) {
      if (state.demoMenuOpen && !e.target.closest('#demoDock')) { state.demoMenuOpen = false; renderDemo(); }
      return;
    }
    var fn = actions[target.getAttribute('data-action')];
    if (fn) fn(target, e);
  });

  // Поле поиска: фильтрация по мере ввода
  document.addEventListener('input', function (e) {
    var f = e.target.getAttribute('data-field');
    if (f && state.dialog) {
      if (e.target.type !== 'checkbox') state.dialog.values[f] = e.target.value;
      if (state.dialog.type === 'observersPicker' && f === 'q') {
        var pos = e.target.selectionStart;
        renderDialog();
        var q = topModal().querySelector('[data-field="q"]');
        q.focus();
        q.setSelectionRange(pos, pos);
      }
      return;
    }
    var lf = e.target.getAttribute('data-link-field');
    if (lf && state.dialog) {
      state.dialog.values.links[Number(e.target.getAttribute('data-idx'))][lf] = e.target.value;
      return;
    }
    if (e.target.getAttribute('data-input') === 'search') {
      state.search = e.target.value;
      renderLeft();
      renderCenter();
    }
  });
  document.addEventListener('change', function (e) {
    var tgt = e.target;
    var f = tgt.getAttribute('data-field');
    if (f && state.dialog) {
      state.dialog.values[f] = tgt.type === 'checkbox' ? tgt.checked : tgt.value;
      if (tgt.hasAttribute('data-rerender') || (state.dialog.type === 'checklistItem' && f === 'date') ||
          (state.dialog.type === 'task' && f === 'reviewerId')) {
        if (f === 'template') state.dialog.values.picked = [];
        if (f === 'role') state.dialog.values.userId = roleDefaultUser(trainee(state.dialog.traineeId), tgt.value);
        renderDialog();
      }
      return;
    }
    if (tgt.hasAttribute('data-link-sel') && state.dialog) {
      state.dialog.values.links[Number(tgt.getAttribute('data-link-sel'))].sel = tgt.checked;
      renderDialog();
      return;
    }
    if (tgt.hasAttribute('data-link-all') && state.dialog) {
      state.dialog.values.links.forEach(function (l) { l.sel = tgt.checked; });
      renderDialog();
      return;
    }
    var list = tgt.getAttribute('data-field-list');
    if (list && state.dialog) {
      var cur = state.dialog.values[list] || [];
      cur = cur.filter(function (v) { return v !== tgt.value; });
      if (tgt.checked) cur.push(tgt.value);
      state.dialog.values[list] = cur;
      delete state.dialog.errors[list];
      if (list === 'picked') renderDialog();
      return;
    }
    // Флажок «выполнено» в чек-листе подготовки — отметка выполнения
    if (tgt.hasAttribute('data-cl-done')) {
      markChecklistDone(checklistItemById(tgt.getAttribute('data-cl-done')), tgt.checked);
      render();
      return;
    }
    // Флажки выбора строк таблицы задач: только выбор, статус задачи не меняется
    if (tgt.hasAttribute('data-select-task')) {
      var id = tgt.getAttribute('data-select-task');
      if (tgt.checked) state.selectedTasks[id] = true; else delete state.selectedTasks[id];
      renderCenter();
      return;
    }
    if (tgt.hasAttribute('data-select-all')) {
      var ids = visibleTasks(trainee(state.selectedTraineeId)).map(function (x) { return x.id; });
      ids.forEach(function (id2) { if (tgt.checked) state.selectedTasks[id2] = true; else delete state.selectedTasks[id2]; });
      renderCenter();
      return;
    }

  });
  // Двойной клик по строке задачи открывает карточку задачи
  document.addEventListener('dblclick', function (e) {
    var trow = e.target.closest('tr[data-tpl-task]');
    if (trow && state.dialog && !e.target.closest('input, button')) {
      openDialog('task', state.dialog.traineeId, { templateId: state.dialog.values.template, index: Number(trow.getAttribute('data-tpl-task')) }, { stack: true });
      return;
    }
    var srow = e.target.closest('tr.summary-row');
    if (srow && !e.target.closest('button')) { selectTrainee(srow.getAttribute('data-id')); return; }
    var row = e.target.closest('tr[data-task-id]');
    if (!row || e.target.closest('input, button')) return;
    openDialog('task', state.selectedTraineeId, { taskId: row.getAttribute('data-task-id') });
  });
  // Контекстное меню строки закрывается при прокрутке
  var menuOpenedAt = 0;
  document.addEventListener('scroll', function () {
    if (state.openMenu && state.openMenu.indexOf('row:') === 0 && Date.now() - menuOpenedAt > 300) { state.openMenu = null; renderCenter(); }
  }, true);

  // Строки дерева и таблиц открываются с клавиатуры
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    // Сводная таблица: Enter — открыть (событие «Выбор»), ↑ ↓ — текущая строка, пробел — сделать текущей
    if (t.classList && t.classList.contains('summary-row')) {
      if (e.key === 'Enter') { e.preventDefault(); selectTrainee(t.getAttribute('data-id')); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var next = e.key === 'ArrowDown' ? t.nextElementSibling : t.previousElementSibling;
        state.summaryCurrent = (next || t).getAttribute('data-id');
        renderSummaryCurrent(true);
        return;
      }
    }
    if ((e.key === 'Enter' || e.key === ' ') && t.hasAttribute && t.hasAttribute('data-action') &&
        t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') {
      e.preventDefault();
      t.click();
    }
    // НЕ_ПЕРЕНОСИТЬ: Shift+D — режим разметки 1С (не срабатывает при вводе текста)
    if (e.shiftKey && (e.code === 'KeyD' || e.key === 'D' || e.key === 'В') && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      state.markup = !state.markup;
      document.body.classList.toggle('markup-1c', state.markup);
      renderDemo();
      return;
    }
    if (e.key === 'Escape') {
      if (state.dialog) closeDialog();
      else if (state.openMenu) { state.openMenu = null; renderLeft(); renderCenter(); }
      else if (state.demoMenuOpen) { state.demoMenuOpen = false; renderDemo(); }
    }
  });

  /* =====================================================================
   * Запуск
   * ===================================================================== */

  function init() {
    // НЕ_ПЕРЕНОСИТЬ: статичная оболочка клиента
    Array.prototype.forEach.call(document.querySelectorAll('[data-shell-icon]'), function (b) {
      b.insertAdjacentHTML('afterbegin', shellIcon(b.getAttribute('data-shell-icon')));
    });
    render();
  }

  // НЕ_ПЕРЕНОСИТЬ: проверка производных значений из консоли — calc('t-lebedev')
  window.calc = function (id) {
    var t = trainee(id);
    var s = statsOf(t);
    return {
      fullName: t.fullName,
      taskPct: taskPct(t), timePct: timePct(t), overdue: s ? s.overdue : 0, lag: lag(t),
      day: 'день ' + dayNo(t) + ' из ' + totalDays(t),
      daysToStart: daysToStart(t), daysToEnd: daysToEnd(t),
      notifications: getNotifications(t).map(function (n) { return n.severity + ': ' + n.text; })
    };
  };
  window.plural = plural;
  // НЕ_ПЕРЕНОСИТЬ: уведомления стажёра с полями раздела 2.1 фазы 9 и перерисовка после правки DATA из консоли
  window.getNotifications = function (id) { return getNotifications(trainee(id)); };
  window.rerender = function () { render(); };

  // НЕ_ПЕРЕНОСИТЬ: элементы без атрибутов соответствия 1С (раздел 7.9)
  window.check1c = function () {
    return Array.prototype.filter.call(document.querySelectorAll('button, input, select, table, [data-tab]'), function (x) {
      return !x.getAttribute('data-1c') || !x.getAttribute('data-1c-name');
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
