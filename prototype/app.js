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
  function userShort(id) { var u = user(id); return u ? u.shortName : '—'; }
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
    { code: 'found',    title: 'Подготовка к выходу', tone: 'warning' },
    { code: 'draft',    title: 'Черновик АП',         tone: 'warning' },
    { code: 'approval', title: 'Согласование',        tone: 'info' },
    { code: 'active',   title: 'Стажировка',          tone: 'success' },
    { code: 'closing',  title: 'Закрытие',            tone: 'warning' },
    { code: 'closed',   title: 'Закрыта',             tone: 'neutral' }
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

  function getNotifications(t) {
    var list = [];
    var s = t.stage;
    var program = programOf(t);
    if (s === 'closed') return list;

    if (s === 'found' && !program) {
      var ds = daysToStart(t);
      list.push({
        key: 'noProgram', tone: 'warning',
        text: 'Для стажёра нужно создать адаптационную программу. ' +
              (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate)),
        button: 'Создать АП', action: 'createProgram', marker: 'Нет АП'
      });
    }

    var clOver = checklistOf(t).filter(checklistOverdue).length;
    if (clOver > 0) {
      list.push({
        key: 'checklistOverdue', tone: 'danger',
        text: 'Просрочено пунктов подготовки к выходу: ' + clOver,
        button: 'Показать', action: 'showChecklistOverdue', marker: clOver + ' просроч.'
      });
    }

    if (s === 'draft' && t.rejectionComment) {
      list.push({
        key: 'rejected', tone: 'danger',
        text: 'АП возвращена на доработку: «' + t.rejectionComment + '»',
        button: 'Отправить на согласование', action: 'sendToApproval', marker: 'Возврат'
      });
    } else if (s === 'draft' && t.draftSince && diffDays(t.draftSince, D.TODAY) >= 2) {
      var dd = diffDays(t.draftSince, D.TODAY);
      list.push({
        key: 'draftStale', tone: 'warning',
        text: 'Адаптационная программа не отправлена на согласование уже ' + pluralN(dd, W_DAYS),
        button: 'Отправить на согласование', action: 'sendToApproval', marker: 'Черновик'
      });
    }

    if (s === 'approval') {
      list.push({
        key: 'onApproval', tone: 'info',
        text: 'АП на согласовании с ' + fmtDate(t.stageDates.approval),
        button: null, action: null, marker: 'На согл.'
      });
    }

    if (t.changedAfterApproval && (s === 'active' || s === 'closing')) {
      list.push({
        key: 'changed', tone: 'warning',
        text: 'АП изменена после согласования. Отправьте её на повторное согласование',
        button: 'Отправить на согласование', action: 'sendToApproval', marker: 'Изменена'
      });
    }

    if (s === 'active') {
      var st = statsOf(t);
      if (st && st.overdue > 0) {
        list.push({
          key: 'tasksOverdue', tone: 'danger',
          text: 'Просрочено задач: ' + st.overdue,
          button: 'Показать', action: 'showTasksOverdue', marker: st.overdue + ' просроч.'
        });
      }
      if (lag(t)) {
        list.push({
          key: 'lag', tone: 'warning',
          text: 'Задачи отстают от графика: выполнено ' + st.pct + '% при прошедших ' + timePct(t) + '% срока',
          button: 'Показать невыполненные', action: 'showTasksUndone', marker: null
        });
      }
    }

    if ((s === 'active' || s === 'closing') && daysToEnd(t) <= D.CLOSE_AVAILABLE_DAYS) {
      var de = Math.max(0, daysToEnd(t));
      list.push({
        key: 'closeSoon', tone: 'info',
        text: 'До окончания стажировки ' + pluralN(de, W_DAYS),
        button: 'Начать закрытие стажировки', action: 'startClosing', marker: 'Закрытие через ' + de + ' дн.'
      });
    }

    // danger → warning → info, внутри типа — порядок правил
    return list
      .map(function (n, i) { n.order = i; return n; })
      .sort(function (a, b) { return TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.order - b.order; });
  }
  function needsAttention(t) {
    return getNotifications(t).some(function (n) { return n.tone === 'danger' || n.tone === 'warning'; });
  }
  // Самый важный маркер для дерева и списка
  // Порядок важности маркеров: сначала то, что требует действия руководителя с АП, затем просрочки
  var MARKER_ORDER = ['rejected', 'changed', 'tasksOverdue', 'checklistOverdue', 'noProgram', 'draftStale', 'onApproval', 'closeSoon'];
  function topMarker(t) {
    var list = getNotifications(t).filter(function (n) { return n.marker; });
    list.sort(function (a, b) { return MARKER_ORDER.indexOf(a.key) - MARKER_ORDER.indexOf(b.key); });
    return list[0] || null;
  }

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
    noProgram: 'НетАП', checklistOverdue: 'ПросроченаПодготовка', rejected: 'ВозвратНаДоработку', draftStale: 'ЧерновикНеОтправлен',
    onApproval: 'НаСогласовании', changed: 'ИзмененаПослеСогласования', tasksOverdue: 'ПросроченыЗадачи', lag: 'ОтставаниеОтГрафика',
    closeSoon: 'СкороОкончание',
    done: 'Выполнено', progress: 'ВРаботе', overdue: 'Просрочено', todo: 'НеНачато',
    stage: 'Этап', deadline: 'Срок', status: 'Статус'
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
    return badge(m.tone, text, name || 'ДекорацияЭтапСтажировки');
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
  // Тумблер: items [{value, text}]
  function toggle(name, action, items, current, cls) {
    return '<div class="toggle' + (cls ? ' ' + cls : '') + '"' + a1c('Тумблер', name) + ' role="group">' +
      items.map(function (it) {
        return '<button type="button" class="' + (it.value === current ? 'on' : '') + '" data-action="' + action +
          '" data-value="' + esc(it.value) + '"' + a1c('Тумблер', name + 'Вариант' + it.name) + '>' + esc(it.text) + '</button>';
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
    counterFilter: null,         // id карточки-счётчика: 'awaitProgram' | 'approval' | 'active' | 'closing'
    search: '',
    hideEmpty: true,             // «Скрыть подразделения без стажёров»
    leftMode: 'tree',            // 'tree' | 'attention'
    collapsed: {},               // свёрнутые узлы дерева: {deptId: true}
    summarySort: { key: null, dir: 1 },
    dismissed: {},               // закрытые info-плашки: {'traineeId:key': true}, до перезагрузки
    notesExpanded: false,        // «Ещё N уведомлений» раскрыто
    openMenu: null,              // открытое подменю
    dialog: null,                // открытый диалог
    taskFilter: null,            // фильтр таблицы задач: 'done' | 'progress' | 'overdue' | 'todo' | 'undone'
    taskBlock: 'all',            // 'all' | 'corp' | 'spec'
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
        title: attention ? 'Стажёров, требующих внимания: ' + attention : '' }
    ];
    el('topTabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab' + (state.topTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '"' +
        ' data-action="topTab"' + (t.title ? ' title="' + esc(t.title) + '"' : '') + a1c('Страница', t.name) + '>' + esc(t.text) + '</button>';
    }).join('');
  }

  /* ---------------------------------------------------------------------
   * Левая панель (раздел 7.2)
   * --------------------------------------------------------------------- */

  var COUNTERS = [
    { id: 'awaitProgram', title: 'Ожидают АП',       stages: ['found', 'draft'], tone: 'warning', icon: 'clock',
      verb: ['ожидает АП', 'ожидают АП'], name: 'ОжидаютАП' },
    { id: 'approval',     title: 'На согласовании',  stages: ['approval'],       tone: 'info',    icon: 'docCheck',
      verb: ['на согласовании', 'на согласовании'], name: 'НаСогласовании' },
    { id: 'active',       title: 'Идёт стажировка',  stages: ['active'],         tone: 'success', icon: 'users',
      verb: ['проходит стажировку', 'проходят стажировку'], name: 'ИдетСтажировка' },
    { id: 'closing',      title: 'Ожидают закрытия', stages: ['closing'],        tone: 'warning', icon: 'flag',
      verb: ['ожидает закрытия', 'ожидают закрытия'], name: 'ОжидаютЗакрытия' }
  ];
  function counterById(id) {
    for (var i = 0; i < COUNTERS.length; i++) if (COUNTERS[i].id === id) return COUNTERS[i];
    return null;
  }
  function counterValue(c) {
    return D.trainees.filter(function (t) { return c.stages.indexOf(t.stage) >= 0; }).length;
  }
  // «1 стажёр ожидает АП», «3 стажёра ожидают АП»; число выводится отдельно крупно
  function counterLabel(c, n) {
    return plural(n, W_TRAINEES) + ' ' + (plural(n, [0, 1, 1]) === 0 ? c.verb[0] : c.verb[1]);
  }

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
    return !state.counterFilter || counterById(state.counterFilter).stages.indexOf(t.stage) >= 0;
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

  // Дата для колонки «Срок» и сортировки: до выхода — дата выхода, иначе — дата окончания
  function summaryDate(t) { return t.stage === 'found' ? t.startDate : t.endDate; }
  // Ближайший срок для списка «Требуют внимания»: до начала стажировки важна дата выхода
  function attentionDate(t) { return stageIndex(t.stage) <= stageIndex('approval') ? t.startDate : t.endDate; }
  function hasDanger(t) { return getNotifications(t).some(function (n) { return n.tone === 'danger'; }); }
  function overdueChecklistCount(t) { return checklistOf(t).filter(checklistOverdue).length; }

  function markerBadge(t, name) {
    var m = topMarker(t);
    return m ? '<span class="tree-marker">' + badge(m.tone, m.marker, name) + '</span>' : '';
  }
  function stageDot(t) {
    return '<span class="dot dot-' + stageMeta(t.stage).tone + '" title="' + esc(stageMeta(t.stage).title) + '"></span>';
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

    var filter = state.counterFilter ? counterById(state.counterFilter) : null;
    var html = '<div class="left-inner">' +
      '<div class="col"' + a1c('ГруппаВертикальная', 'ГруппаОбзор') + '>' +
        '<div class="h-block"' + a1c('Надпись', 'ДекорацияЗаголовокОбзор') + '>Обзор по подразделениям</div>' +
        '<div class="row counter-row"' + a1c('ГруппаГоризонтальная', 'ГруппаСчетчикиСтрока1') + '>' + counterCard(COUNTERS[0]) + counterCard(COUNTERS[1]) + '</div>' +
        '<div class="row counter-row"' + a1c('ГруппаГоризонтальная', 'ГруппаСчетчикиСтрока2') + '>' + counterCard(COUNTERS[2]) + counterCard(COUNTERS[3]) + '</div>' +
        (filter ? '<div class="row filter-line"' + a1c('ГруппаГоризонтальная', 'ГруппаФильтрПоЭтапу') + '>' +
          '<span class="grow"' + a1c('Надпись', 'ДекорацияФильтрПоЭтапу') + '>Фильтр: <b>' + esc(filter.title) + '</b></span>' +
          button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Сбросить фильтр', action: 'clearCounterFilter', name: 'КнопкаСброситьФильтрПоЭтапу' }) +
          '</div>' : '') +
      '</div>' +
      '<input type="text" class="input" data-input="search" placeholder="Поиск по ФИО или подразделению" value="' + esc(state.search) + '"' +
        ' title="Поиск по ФИО или подразделению"' + a1c('ПолеВвода', 'ПолеПоиска') + '>' +
      '<div class="row">' +
        '<label class="check"><input type="checkbox" data-change="hideEmpty"' + (state.hideEmpty ? ' checked' : '') +
          a1c('Флажок', 'ФлажокСкрытьПустыеПодразделения') + '> Скрыть подразделения без стажёров</label>' +
      '</div>' +
      toggle('ТумблерРежимПанели', 'leftMode', [
        { value: 'tree', text: 'Структура', name: 'Структура' },
        { value: 'attention', text: 'Требуют внимания', name: 'ТребуютВнимания' }
      ], state.leftMode, 'toggle-full') +
      (state.leftMode === 'tree' ? renderTree() : renderAttentionList()) +
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

  function counterCard(c) {
    var n = counterValue(c);
    var on = state.counterFilter === c.id;
    return '<button type="button" class="counter-card' + (on ? ' on' : '') + '" data-action="counterFilter" data-id="' + c.id + '"' +
      ' aria-pressed="' + on + '" title="' + (on ? 'Сбросить фильтр «' + c.title + '»' : 'Показать: ' + c.title) + '"' +
      a1c('ГруппаВертикальная', 'ГруппаСчетчик' + c.name, 'check') + '>' +
      '<span class="counter-head"><span class="tone-' + c.tone + '"' + a1c('Картинка', 'Картинка' + c.name) + '>' + icon(c.icon) + '</span>' +
      '<span class="counter-num"' + a1c('Гиперссылка', 'Надпись' + c.name + 'Число') + '>' + n + '</span></span>' +
      '<span class="counter-label"' + a1c('Надпись', 'Надпись' + c.name + 'Подпись') + '>' + esc(counterLabel(c, n)) + '</span>' +
      '</button>';
  }

  // Пустой результат фильтров; place — где показан: 'Дерево', 'Список', 'Сводка' (имена в форме уникальны)
  function emptyFilterState(place) {
    var parts = [];
    if (searchQuery()) parts.push(link('Сбросить поиск', { action: 'resetSearch', name: 'ГиперссылкаСброситьПоиск' + place }));
    if (state.counterFilter) parts.push(link('Сбросить фильтр', { action: 'clearCounterFilter', name: 'ГиперссылкаСброситьФильтр' + place }));
    var text = searchQuery() ? 'Никого не нашли' : 'Нет стажёров на этапе «' + counterById(state.counterFilter).title + '»';
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
          ' data-action="toggleDept" data-id="' + n.dept.id + '" style="padding-left:' + (8 + level * 16) + 'px"' +
          (hasKids ? ' title="' + (open ? 'Свернуть' : 'Развернуть') + '"' : '') + '>' +
          '<span class="tree-arrow">' + (hasKids ? icon(open ? 'chevronDown' : 'chevronRight') : '') + '</span>' +
          '<span class="ellipsis bold" title="' + esc(n.dept.name) + '">' + esc(n.dept.name) + '</span>' +
          '<span class="muted tree-count">(' + n.count + ')</span></div>');
        if (open) {
          walk(n.children, level + 1);
          n.trainees.forEach(function (t) {
            out.push('<div class="tree-row tree-trainee' + (state.selectedTraineeId === t.id ? ' selected' : '') + '" role="treeitem" tabindex="0"' +
              ' data-action="selectTrainee" data-id="' + t.id + '" style="padding-left:' + (8 + (level + 1) * 16) + 'px">' +
              '<span class="tree-arrow">' + stageDot(t) + '</span>' +
              '<span class="ellipsis grow" title="' + esc(t.fullName + ' — ' + stageMeta(t.stage).title) + '">' + esc(t.fullName) + '</span>' +
              markerBadge(t, 'ДеревоПодразделенийМаркер') + '</div>');
          });
        }
      });
    })(nodes, 0);
    return '<div class="tree" role="tree"' + a1c('ДеревоФормы', 'ДеревоПодразделений') + '>' + out.join('') + '</div>';
  }

  function renderAttentionList() {
    var list = visibleTrainees().filter(needsAttention).sort(function (a, b) {
      return (hasDanger(b) - hasDanger(a)) || attentionDate(a).localeCompare(attentionDate(b));
    });
    var body;
    if (!list.length) {
      body = (searchQuery() || state.counterFilter) && !visibleTrainees().length ? emptyFilterState('Список') :
        '<div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаНетДействий') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияДействийНеТребуется') + '>Действий не требуется</span>' +
        link('Показать структуру', { action: 'leftMode', data: { value: 'tree' }, name: 'ГиперссылкаПоказатьСтруктуру' }) + '</div>';
    } else {
      body = list.map(function (t) {
        return '<div class="tree-row list-row' + (state.selectedTraineeId === t.id ? ' selected' : '') + '" tabindex="0"' +
          ' data-action="selectTrainee" data-id="' + t.id + '">' +
          '<span class="tree-arrow">' + stageDot(t) + '</span>' +
          '<span class="col gap-0 grow">' +
            '<span class="ellipsis" title="' + esc(t.fullName) + '">' + esc(t.fullName) + '</span>' +
            '<span class="ellipsis muted text-s" title="' + esc(dept(t.departmentId).name) + '">' + esc(dept(t.departmentId).name) + '</span>' +
          '</span>' + markerBadge(t, 'СписокТребуютВниманияМаркер') + '</div>';
      }).join('');
    }
    return '<div class="tree"' + a1c('ТаблицаФормы', 'СписокТребуютВнимания') + '>' + body + '</div>';
  }

  /* ---------------------------------------------------------------------
   * Центральная область
   * --------------------------------------------------------------------- */

  function renderCenter() {
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    el('centerZone').innerHTML = t ? renderTraineeCard(t) : renderSummary();
    Array.prototype.forEach.call(el('centerZone').querySelectorAll('[data-indeterminate]'), function (x) { x.indeterminate = true; });
    placeFloatingMenu();
  }

  // Сводная таблица (раздел 7.3)
  var SUMMARY_SORT = {
    stage: function (t) { return stageIndex(t.stage); },
    overdue: function (t) { return overdueCount(t) + overdueChecklistCount(t); },
    deadline: function (t) { return summaryDate(t); }
  };

  function renderSummary() {
    var list = visibleTrainees().slice();
    var sort = state.summarySort;
    if (sort.key) {
      var key = SUMMARY_SORT[sort.key];
      list.sort(function (a, b) {
        var x = key(a), y = key(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    function th(text, keyName, cls) {
      if (!keyName) return '<th' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</th>';
      var on = sort.key === keyName;
      return '<th' + (cls ? ' class="' + cls + '"' : '') + ' aria-sort="' + (on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" class="th-sort' + (on ? ' on' : '') + '" data-action="sortSummary" data-key="' + keyName + '"' +
        ' title="Сортировать по колонке «' + text + '»"' + a1c('ТаблицаФормы', 'ТаблицаСтажеровСортировка' + n1c(keyName)) + '>' +
        text + (on ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }

    var rows = list.map(function (t) {
      var st = statsOf(t);
      var overTasks = overdueCount(t);
      var overChecklist = overdueChecklistCount(t);
      var over = overTasks + overChecklist;
      var d = dept(t.departmentId).name;
      return '<tr class="clickable" tabindex="0" data-action="selectTrainee" data-id="' + t.id + '" title="Открыть карточку стажёра">' +
        '<td><div class="ellipsis" title="' + esc(t.fullName) + '">' + esc(t.fullName) + '</div>' +
          '<div class="muted text-s ellipsis" title="' + esc(t.position) + '">' + esc(t.position) + '</div></td>' +
        '<td><div class="ellipsis" title="' + esc(d) + '">' + esc(d) + '</div></td>' +
        '<td>' + stageBadge(t, 'ТаблицаСтажеровЭтап') + '</td>' +
        '<td>' + (st ? '<div class="indicator-wrap">' + indicator(st.pct, 'ТаблицаСтажеровИндикаторЗадач') +
          '<span class="pct">' + st.pct + '%</span></div>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="num">' + (over ? '<span class="danger-text bold" title="' + esc('Задач: ' + overTasks + ', пунктов подготовки: ' + overChecklist) + '">' + over + '</span>' : '') + '</td>' +
        '<td class="nowrap">' + (t.stage === 'found' ? 'Выход ' + fmtDate(t.startDate) : 'до ' + fmtDate(t.endDate)) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="col gap-3 summary"' + a1c('ГруппаВертикальная', 'ГруппаСводка') + '>' +
      '<div class="row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗаголовокСводки') + '>' +
        '<div class="h-block grow"' + a1c('Надпись', 'ДекорацияЗаголовокСводки') + '>Стажёры: ' + list.length + '</div>' +
        button('', { cls: 'btn-icon' + (state.helpOpen ? ' pressed' : ''), icon: 'help', action: 'toggleHelp',
          title: state.helpOpen ? 'Скрыть справку' : 'Показать справку', name: 'КнопкаСправкаСводка' }) +
      '</div>' +
      (list.length ?
        '<div class="table-box">' +
        '<table class="grid summary-table"' + a1c('ТаблицаФормы', 'ТаблицаСтажеров') + '>' +
        '<colgroup><col><col><col class="w-stage"><col class="w-tasks"><col class="w-overdue"><col class="w-date"></colgroup>' +
        '<thead><tr>' + th('Стажёр') + th('Подразделение') + th('Этап', 'stage') + th('Задачи') + th('Просрочено', 'overdue', 'num') + th('Срок', 'deadline') +
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
    return '<div class="col gap-4 trainee-card"' + a1c('ГруппаВертикальная', 'ГруппаКарточкаСтажера') + '>' +
      '<div class="row">' + link('← Все стажёры', { action: 'backToList', name: 'ГиперссылкаВсеСтажеры' }) + '</div>' +
      renderHeader(t) +
      renderStepper(t) +
      renderNotes(t) +
      renderCommandBar(t) +
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

  function renderHeader(t) {
    var st = statsOf(t);
    var col3;
    var dates = '<div class="col gap-0"><span class="muted text-s">Даты стажировки</span>' +
      '<span' + a1c('Надпись', 'ДекорацияДатыСтажировки') + '>' + fmtDate(t.startDate) + ' – ' + fmtDate(t.endDate) + '</span></div>';
    if (isClosed(t)) {
      var what = t.closeKind === 'cancelled' ? 'Стажировка отменена ' : 'Стажировка закрыта ';
      var result = t.closeKind === 'passed' ? '. Результат: пройдена' : t.closeKind === 'failed' ? '. Результат: не пройдена' : '';
      col3 = dates + '<div class="bold"' + a1c('Надпись', 'ДекорацияСтажировкаЗакрыта') + '>' + what + fmtDate(t.closedAt) + result + '</div>';
    } else if (t.stage === 'found' || daysToStart(t) > 0) {
      var ds = daysToStart(t);
      col3 = dates + '<div class="bold"' + a1c('Надпись', 'ДекорацияВыходЧерез') + '>' +
        (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate)) + '</div>' +
        (st ? meter('Задачи: ' + st.pct + '%', st.pct, 'ИндикаторЗадачи') : '');
    } else {
      col3 = dates +
        meter('Срок: день ' + dayNo(t) + ' из ' + totalDays(t), timePct(t), 'ИндикаторСрок') +
        (st ? meter('Задачи: ' + st.pct + '%', st.pct, 'ИндикаторЗадачи', 'success') : '') +
        (lag(t) ? '<div class="danger-text bold"' + a1c('Надпись', 'ДекорацияОтставание') + '>Отстаёт от графика</div>' : '');
    }

    return '<div class="panel row top header"' + a1c('ГруппаГоризонтальная', 'ГруппаШапкаСтажера') + '>' +
      // 1. Аватар, ФИО, должность, этап
      '<div class="row top gap-3 header-col1"' + a1c('ГруппаГоризонтальная', 'ГруппаСтажер') + '>' +
        '<div class="avatar"' + a1c('Картинка', 'КартинкаАватар', 'check') + ' title="' + esc(t.fullName) + '">' + esc(initials(t.fullName)) + '</div>' +
        '<div class="col gap-1 grow"' + a1c('ГруппаВертикальная', 'ГруппаФИО') + '>' +
          '<div class="text-xl bold"' + a1c('Надпись', 'ДекорацияФИО') + '>' + esc(t.fullName) + '</div>' +
          '<div' + a1c('Надпись', 'ДекорацияДолжность') + '><span class="muted">Стажёр на должность:</span> ' + esc(t.position) + '</div>' +
          '<div>' + stageBadge(t, 'ДекорацияЭтап') + '</div>' +
        '</div>' +
      '</div>' +
      // 2. Наставник и руководитель
      '<div class="col gap-3 header-col2"' + a1c('ГруппаВертикальная', 'ГруппаОтветственные') + '>' +
        '<div class="col gap-0"><span class="muted text-s">Наставник стажировки</span>' + personLink(t, 'mentor') + '</div>' +
        '<div class="col gap-0"><span class="muted text-s">Руководитель стажировки</span>' + personLink(t, 'head') + '</div>' +
      '</div>' +
      // 3. Сроки
      '<div class="col gap-2 header-col3"' + a1c('ГруппаВертикальная', 'ГруппаСроки') + '>' + col3 + '</div>' +
      '</div>';
  }

  function meter(label, pct, name, tone) {
    return '<div class="col gap-1"><span class="text-s">' + esc(label) + '</span>' +
      '<div class="indicator-wrap">' + indicator(pct, name, tone) + '</div></div>';
  }

  // Степпер этапов: пройденные — галочка, текущий — primary с датой, будущие — серые
  function renderStepper(t) {
    var cur = stageIndex(t.stage);
    var allDone = isClosed(t);
    return '<div class="stepper-wrap"><div class="stepper"' + a1c('ГруппаГоризонтальная', 'ГруппаСтеппер', 'check') + '>' +
      STAGES.map(function (s, i) {
        var state_ = allDone || i < cur ? 'done' : i === cur ? 'current' : 'future';
        var title = s.title;
        if (s.code === 'closed' && t.closeKind === 'cancelled') title = 'Отменена';
        var date = t.stageDates[s.code];
        return '<div class="step step-' + state_ + '"' + a1c('Надпись', 'ДекорацияШаг' + n1c(s.code)) +
          ' title="' + esc(title + (date ? ' с ' + fmtDate(date) : '')) + '">' +
          '<span class="step-mark">' + (state_ === 'done' ? icon('check') : (i + 1)) + '</span>' +
          '<span class="col gap-0 step-text"><span class="step-title">' + esc(title) + '</span>' +
          (state_ === 'current' || (allDone && s.code === 'closed') ? '<span class="text-s muted">' + (date ? 'с ' + fmtDate(date) : '') + '</span>' : '') +
          '</span></div>' + (i < STAGES.length - 1 ? '<span class="step-line' + (state_ === 'done' ? ' done' : '') + '"></span>' : '');
      }).join('') + '</div></div>';
  }

  var NOTE_ICONS = { danger: 'alert', warning: 'clock', info: 'info' };

  // Плашки уведомлений (раздел 7.1)
  function renderNotes(t) {
    var list = getNotifications(t).filter(function (n) { return !state.dismissed[t.id + ':' + n.key]; });
    if (!list.length) return '';
    var shown = state.notesExpanded ? list : list.slice(0, 3);
    var rest = list.length - shown.length;
    return '<div class="col gap-2"' + a1c('ГруппаВертикальная', 'ГруппаУведомления') + '>' +
      shown.map(function (n) {
        var disabled = n.action === 'startClosing' && !canStartClosing(t);
        return '<div class="note note-' + n.tone + '"' + a1c('ГруппаГоризонтальная', 'ГруппаУведомление' + n1c(n.key)) + '>' +
          '<span class="tone-' + n.tone + '"' + a1c('Картинка', 'КартинкаУведомление' + n1c(n.key)) + '>' + icon(NOTE_ICONS[n.tone]) + '</span>' +
          '<span class="grow"' + a1c('Надпись', 'ДекорацияУведомление' + n1c(n.key)) + '>' + esc(n.text) + '</span>' +
          (n.button ? button(n.button, { action: 'noteAction', data: { key: n.key }, name: 'КнопкаУведомление' + n1c(n.key),
            disabled: disabled, title: disabled ? 'Доступно с ' + fmtDate(closeAvailableFrom(t)) : '' }) : '') +
          (n.tone === 'info' ? button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Скрыть уведомление', action: 'dismissNote',
            data: { key: n.key }, name: 'КнопкаСкрытьУведомление' + n1c(n.key) }) : '') +
          '</div>';
      }).join('') +
      (rest > 0 ? '<div>' + link('Ещё ' + pluralN(rest, ['уведомление', 'уведомления', 'уведомлений']), { action: 'toggleNotes', name: 'ГиперссылкаЕщеУведомления' }) + '</div>' : '') +
      (state.notesExpanded && list.length > 3 ? '<div>' + link('Свернуть уведомления', { action: 'toggleNotes', name: 'ГиперссылкаСвернутьУведомления' }) + '</div>' : '') +
      '</div>';
  }

  // Командная панель стажировки
  function renderCommandBar(t) {
    var program = programOf(t);
    var s = t.stage;
    var parts = [];
    var reason = '';

    if (s === 'found' && !program) {
      parts.push(button('Создать АП', { cls: 'btn-primary', action: 'createProgram', name: 'КнопкаСоздатьАП' }));
    } else if (s === 'found' || s === 'draft') {
      parts.push(button('Отправить на согласование', { cls: 'btn-primary', action: 'openDialog', data: { dialog: 'sendToApproval' }, name: 'КнопкаОтправитьНаСогласование' }));
    } else if (s === 'approval') {
      parts.push(button('Отозвать с согласования', { action: 'recallApproval', name: 'КнопкаОтозватьССогласования' }));
    } else if (s === 'active' || s === 'closing') {
      var can = canStartClosing(t);
      parts.push(button('Начать закрытие стажировки', { cls: 'btn-primary', action: 'openDialog', data: { dialog: 'close' },
        disabled: !can, title: can ? '' : 'Закрытие доступно за ' + pluralN(D.CLOSE_AVAILABLE_DAYS, W_DAYS) + ' до окончания стажировки',
        name: 'КнопкаНачатьЗакрытиеСтажировки' }));
      if (!can) reason = '<span class="muted text-s"' + a1c('Надпись', 'ДекорацияЗакрытиеДоступноС') + '>Доступно с ' + fmtDate(closeAvailableFrom(t)) + '</span>';
    }
    if (reason) parts.push(reason);
    if (s === 'active' || s === 'closing') {
      parts.push(button('Продлить срок', { icon: 'calendar', action: 'openDialog', data: { dialog: 'extend' }, name: 'КнопкаПродлитьСрок' }));
    }
    if (program) {
      parts.push(button('Печать АП', { icon: 'print', action: 'printProgram', name: 'КнопкаПечатьАП' }));
      if (!isClosed(t)) parts.push(button('Проверяющие и наблюдатели', { icon: 'users', action: 'openDialog', data: { dialog: 'reviewers' },
        disabled: !!editLock(t), title: editLock(t) || '', name: 'КнопкаПроверяющиеИНаблюдатели' }));
    }

    var menuItems = [];
    if (program) {
      menuItems.push(menuItem('История изменений АП', 'openDialog', { dialog: 'history' }, 'КнопкаИсторияИзмененийАП'));
      menuItems.push(menuItem('Открыть документ АП', 'openProgramDoc', null, 'КнопкаОткрытьДокументАП'));
    }
    if (!isClosed(t)) {
      if (menuItems.length) menuItems.push('<div class="menu-sep"></div>');
      menuItems.push(menuItem('Отменить стажировку', 'openDialog', { dialog: 'cancel' }, 'КнопкаОтменитьСтажировку', 'danger-text'));
    }

    return '<div class="row wrap command-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельСтажировки') + '>' +
      parts.join('') +
      '<span class="grow"></span>' +
      (menuItems.length ? submenu('traineeMore', 'ПодменюЕщеСтажировка', menuItems) : '') +
      button('', { cls: 'btn-icon' + (state.helpOpen ? ' pressed' : ''), icon: 'help', action: 'toggleHelp',
        title: state.helpOpen ? 'Скрыть справку' : 'Показать справку', name: 'КнопкаСправка' }) +
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
  function renderTraineePages(t) {
    var tabs = [
      { id: 'program', text: 'Адаптационная программа', name: 'СтраницаАдаптационнаяПрограмма' },
      { id: 'prepare', text: 'Подготовка к выходу', name: 'СтраницаПодготовкаКВыходу' }
    ];
    var body;
    if (state.traineeTab === 'program') {
      body = renderProgramTab(t);
    } else {
      body = renderPrepareTab(t);
    }
    return '<div class="col gap-3"' + a1c('Страницы', 'СтраницыСтажера') + '>' +
      '<div class="tabs">' + tabs.map(function (x) {
        return '<button type="button" class="tab' + (state.traineeTab === x.id ? ' active' : '') + '" data-tab="' + x.id + '" data-action="traineeTab"' +
          a1c('Страница', x.name) + '>' + esc(x.text) + '</button>';
      }).join('') + '</div>' + body + '</div>';
  }
  var TASK_FILTER_TITLES = { done: 'Выполнено', progress: 'В работе', overdue: 'Просрочено', todo: 'Не начато', undone: 'Невыполненные' };

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
  // Фильтр по счётчику прогресса → статус для показа
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
    if (f === 'undone') return task.status !== 'done';
    return viewStatus(task) === FILTER_STATUS[f];
  }
  // Задачи для таблицы: блок, фильтр, сортировка (по умолчанию — порядок задач в АП)
  function visibleTasks(t) {
    var list = tasksOf(programOf(t)).filter(function (x) {
      return (state.taskBlock === 'all' || x.block === state.taskBlock) && taskMatchesFilter(x, state.taskFilter);
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

  function renderProgramTab(t) {
    var program = programOf(t);
    if (!program) return renderProgramEmpty(t);
    var all = tasksOf(program);
    var lock = editLock(t);
    return '<div class="col gap-3"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаАП') + '>' +
      (all.length ? renderProgress(t, all) : '') +
      (lock ? '<div class="note note-' + (t.stage === 'approval' ? 'info' : 'neutral') + '"' + a1c('ГруппаГоризонтальная', 'ГруппаЗапретРедактирования') + '>' +
        '<span class="tone-info">' + icon('info') + '</span><span' + a1c('Надпись', 'ДекорацияЗапретРедактирования') + '>' + esc(lock) + '</span></div>' : '') +
      renderTaskCommandBar(t, all) +
      (state.taskFilter ? '<div class="row filter-line"' + a1c('ГруппаГоризонтальная', 'ГруппаФильтрЗадач') + '>' +
        '<span class="grow"' + a1c('Надпись', 'ДекорацияФильтрЗадач') + '>Показаны: <b>' + esc(TASK_FILTER_TITLES[state.taskFilter]) + '</b></span>' +
        button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Сбросить фильтр', action: 'taskFilter', data: { value: '' }, name: 'КнопкаСброситьФильтрЗадач' }) +
        '</div>' : '') +
      renderTaskTable(t, all) +
      '</div>';
  }

  // Блок прогресса (7.5.1)
  function renderProgress(t, all) {
    var st = taskStats(all);
    function pct(n) { return Math.round(n / st.total * 100); }
    function seg(cls, n) { return n ? '<span class="' + cls + '" style="width:' + (n / st.total * 100) + '%"></span>' : ''; }
    var counters = [
      { f: 'done', n: st.done, text: 'Выполнено', dot: 'success' },
      { f: 'progress', n: st.progress, text: 'В работе', dot: 'info' },
      { f: 'overdue', n: st.overdue, text: 'Просрочено', dot: 'danger' },
      { f: 'todo', n: st.todo, text: 'Не начато', dot: 'neutral' }
    ].filter(function (c) { return c.n > 0; });
    var byBlock = BLOCKS.map(function (b) {
      var list = all.filter(function (x) { return x.block === b.id; });
      var done = list.filter(function (x) { return x.status === 'done'; }).length;
      return '<div class="col gap-1"' + a1c('ГруппаВертикальная', 'ГруппаПрогресс' + b.name) + '>' +
        '<span' + a1c('Надпись', 'ДекорацияПрогресс' + b.name) + '>' + b.title + ': <b>' + done + ' из ' + list.length + '</b></span>' +
        '<div class="indicator-wrap">' + indicator(list.length ? done / list.length * 100 : 0, 'ИндикаторПрогресс' + b.name, 'success') + '</div></div>';
    }).join('');
    return '<div class="panel row top gap-5"' + a1c('ГруппаГоризонтальная', 'ГруппаПрогресс') + '>' +
      '<div class="col gap-3 grow"' + a1c('ГруппаВертикальная', 'ГруппаПрогрессОбщий') + '>' +
        '<div class="h-block"' + a1c('Надпись', 'ДекорацияПрогрессПоЗадачам') + '>Прогресс по задачам</div>' +
        '<div class="indicator stacked"' + a1c('Индикатор', 'ПолосаПрогрессаСоставная', 'high') +
          ' title="' + esc(counters.map(function (c) { return c.text + ': ' + c.n; }).join(', ')) + '">' +
          seg('seg-done', st.done) + seg('seg-progress', st.progress) + seg('seg-overdue', st.overdue) + seg('seg-todo', st.todo) + '</div>' +
        '<div class="row wrap gap-4"' + a1c('ГруппаГоризонтальная', 'ГруппаСчетчикиЗадач') + '>' +
          counters.map(function (c) {
            var on = state.taskFilter === c.f;
            return '<span class="row gap-1"><span class="dot dot-' + c.dot + '"></span>' +
              link(c.text + ' ' + c.n + ' (' + pct(c.n) + '%)', { cls: on ? 'on' : '', action: 'taskFilter', data: { value: on ? '' : c.f },
                title: on ? 'Сбросить фильтр' : 'Показать задачи: ' + c.text.toLowerCase(), name: 'ГиперссылкаСчетчик' + n1c(c.f) }) + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="col gap-3 progress-blocks"' + a1c('ГруппаВертикальная', 'ГруппаПрогрессПоБлокам') + '>' + byBlock + '</div>' +
      '</div>';
  }

  // Командная панель таблицы (7.5.2)
  function renderTaskCommandBar(t, all) {
    var lock = editLock(t);
    var sel = selectedTaskIds(t).length;
    var corp = all.filter(function (x) { return x.block === 'corp'; }).length;
    var massTitle = lock || (sel ? '' : 'Отметьте задачи флажками');
    var mass = function (text, action, dialog, name) {
      return button(text, { action: action, data: dialog ? { dialog: dialog } : null, disabled: !!massTitle, title: massTitle, name: name });
    };
    return '<div class="row wrap command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельЗадач') + '>' +
      toggle('ТумблерБлокЗадач', 'taskBlock', [
        { value: 'all', text: 'Все (' + all.length + ')', name: 'Все' },
        { value: 'corp', text: 'Корпоративный (' + corp + ')', name: 'Корпоративный' },
        { value: 'spec', text: 'Специальный (' + (all.length - corp) + ')', name: 'Специальный' }
      ], state.taskBlock) +
      submenu('addTask', 'ПодменюДобавитьЗадачу', [
        menuItem('Новая задача', 'openDialog', { dialog: 'task' }, 'КнопкаНоваяЗадача'),
        menuItem('Из шаблона…', 'openDialog', { dialog: 'addFromTemplate' }, 'КнопкаДобавитьИзШаблона')
      ], { text: 'Добавить ▾', icon: 'plus', disabled: !!lock, title: lock || '' }) +
      '<span class="bar-sep"></span>' +
      (sel ? '<span class="bold"' + a1c('Надпись', 'ДекорацияВыбраноЗадач') + '>Выбрано: ' + sel + '</span>' : '') +
      mass('Назначить проверяющего', 'openDialog', 'massReviewer', 'КнопкаНазначитьПроверяющего') +
      mass('Наблюдатели', 'openDialog', 'massObservers', 'КнопкаНаблюдатели') +
      mass('Перенести срок', 'openDialog', 'massDeadline', 'КнопкаПеренестиСрок') +
      mass('Удалить', 'openDialog', 'deleteTasks', 'КнопкаУдалитьЗадачи') +
      '</div>';
  }

  // Таблица задач (7.5.3)
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
    } else if (!list.length) {
      body = '<tr><td colspan="' + cols + '"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаНетЗадачСФильтром') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияНетЗадачСФильтром') + '>Нет задач с таким статусом</span>' +
        link('Сбросить фильтр', { action: 'taskFilter', data: { value: '' }, name: 'ГиперссылкаСброситьФильтрЗадач' }) + '</div></td></tr>';
    } else if (state.taskBlock === 'all') {
      body = BLOCKS.map(function (b) {
        var rows = list.filter(function (x) { return x.block === b.id; });
        if (!rows.length) return '';
        var blockAll = all.filter(function (x) { return x.block === b.id; });
        var done = blockAll.filter(function (x) { return x.status === 'done'; }).length;
        var open = !state.collapsedBlocks[b.id];
        return '<tr class="group-row" tabindex="0" data-action="toggleBlockGroup" data-block="' + b.id + '" title="' + (open ? 'Свернуть группу' : 'Развернуть группу') + '"' +
          a1c('ТаблицаФормы', 'ТаблицаЗадачАПГруппа' + b.name, 'check') + '>' +
          '<td colspan="' + cols + '"><span class="row gap-1">' + icon(open ? 'chevronDown' : 'chevronRight') +
          '<b>' + b.title + '</b><span class="muted">— выполнено ' + done + ' из ' + blockAll.length + '</span></span></td></tr>' +
          (open ? rows.map(function (x) { return taskRow(t, program, x, selectable); }).join('') : '');
      }).join('');
    } else {
      body = list.map(function (x) { return taskRow(t, program, x, selectable); }).join('');
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
        '<th>Проверяющий</th><th>Наблюдатели</th><th>Результат</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function taskRow(t, program, x, selectable) {
    var v = viewStatus(x);
    var sm = STATUS_META[v];
    var selected = !!state.selectedTasks[x.id];
    var late = v === 'overdue' ? diffDays(x.deadline, D.TODAY) : 0;
    var rev = x.reviewerId
      ? '<span title="' + esc(user(x.reviewerId).fullName) + '">' + esc(userShort(x.reviewerId)) + '</span>'
      : '<span class="muted" title="' + esc(user(program.defaultReviewerId).fullName + ' — проверяющий по умолчанию из АП') + '">' + esc(userShort(program.defaultReviewerId)) + ' <span class="text-s">по умолч.</span></span>';
    var obs = observersOf(program, x);
    var obsText = obs.slice(0, 2).map(userShort).join(', ') + (obs.length > 2 ? ' +' + (obs.length - 2) : '');
    var obsHtml = '<span class="' + (x.observerIds.length ? '' : 'muted') + '" title="' + esc(obs.map(function (id) { return user(id).fullName; }).join(', ')) + '">' +
      esc(obsText) + (x.observerIds.length ? '' : ' <span class="text-s">по умолч.</span>') + '</span>';
    return '<tr class="task-row' + (selected ? ' selected' : '') + '" data-task-id="' + x.id + '" title="Двойной клик — открыть карточку задачи">' +
      (selectable ? '<td><input type="checkbox" data-select-task="' + x.id + '"' + (selected ? ' checked' : '') +
        ' title="Выбрать задачу" aria-label="Выбрать задачу «' + esc(x.name) + '»"' + a1c('Флажок', 'ТаблицаЗадачАПВыбрана') + '></td>' : '') +
      '<td><div class="ellipsis" title="' + esc(x.name) + '">' + esc(x.name) + '</div>' +
        (x.description ? '<div class="muted text-s ellipsis" title="' + esc(x.description) + '">' + esc(trunc(x.description, 80)) + '</div>' : '') + '</td>' +
      '<td>' + badge(sm.tone, sm.text, 'ТаблицаЗадачАПСтатус') + '</td>' +
      '<td class="nowrap">' + (late ? '<span class="danger-text">' + fmtDate(x.deadline) + '</span><div class="text-s danger-text">(−' + late + ' дн.)</div>' : fmtDate(x.deadline)) + '</td>' +
      '<td><div class="ellipsis">' + rev + '</div></td>' +
      '<td><div class="ellipsis">' + obsHtml + '</div></td>' +
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
    state.taskBlock = 'all';
    toast('АП создана');
  }
  var newTaskSeq = 1;
  function newTask(program, s) {
    return {
      id: 'task-new-' + (newTaskSeq++), programId: program.id, block: s.block, name: s.name, description: s.description || '',
      status: s.status || 'not_started', deadline: s.deadline, reviewerId: s.reviewerId || null,
      observerIds: s.observerIds || [], result: s.result || null, externalUrl: 'forus-team:task/new'
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
      '<td><div>' + esc(D.ROLE_TITLES[c.responsibleRole]) + '</div><div class="muted text-s">' + esc(userShort(c.responsibleId)) + '</div></td>' +
      '<td class="nowrap"><div class="' + (st.tone === 'danger' ? 'danger-text' : '') + '">' + fmtDate(date) + '</div><div class="muted text-s">' + offsetText(c.offsetDays) + '</div></td>' +
      '<td>' + badge(st.tone, st.text, 'ТаблицаЧекЛистСтатус') +
        (c.done && c.doneBy ? '<div class="muted text-s">' + esc(userShort(c.doneBy)) + ', ' + fmtDate(c.doneAt).slice(0, 5) + '</div>' : '') + '</td>' +
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
      a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоКнопкаЭтап') + '>Демо: этап ' + (t ? '«' + esc(stageMeta(t.stage).title) + '» ' : '') + '▾</button>';
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
          return '<tr><td class="nowrap">' + fmtDateTime(h.at) + '</td><td class="nowrap">' + esc(userShort(h.userId)) + '</td><td>' + esc(h.action) + '</td></tr>';
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
        if (program) addHistory(program, personName(role) + ' изменён: ' + userShort(old) + ' → ' + userShort(v.userId));
        toast(personName(role) + ' изменён: ' + userShort(v.userId));
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
  function namesOf(ids) { return ids.map(userShort).join(', '); }
  function sameList(a, b) { return a.slice().sort().join() === b.slice().sort().join(); }

  // Карточка задачи: новая или существующая
  DIALOGS.task = {
    form: 'ФормаЗадачаАП', submit: 'Сохранить', wide: true,
    titleFn: function () { return dlgCtx().taskId ? (dlgRO() ? 'Задача' : 'Изменить задачу') : 'Новая задача'; },
    init: function (t, ctx) {
      var x = ctx.taskId ? taskById(ctx.taskId) : null;
      if (!x) return { name: '', block: state.taskBlock === 'spec' ? 'spec' : 'corp', description: '', deadline: '', status: 'not_started',
        reviewerId: '', obsInherit: true, observers: [], result: '' };
      return { name: x.name, block: x.block, description: x.description, deadline: x.deadline, status: x.status,
        reviewerId: x.reviewerId || '', obsInherit: !x.observerIds.length, observers: x.observerIds.slice(), result: x.result || '' };
    },
    body: function (t) {
      var program = programOf(t);
      var e = state.dialog.errors;
      var lockNote = dlgRO() ? '<div class="note note-info"><span class="tone-info">' + icon('info') + '</span><span>' + esc(editLock(t)) + '</span></div>' : '';
      return lockNote +
        field('Наименование', inputText('name', 'ПолеНаименование', ro()), { required: true, error: e.name, forId: 'f_name', name: 'Наименование' }) +
        field('Блок', selectOptions('block', 'ПолеБлок', [{ value: 'corp', text: 'Корпоративный' }, { value: 'spec', text: 'Специальный' }]), { forId: 'f_block' }) +
        field('Описание', textarea('description', 'ПолеОписание'), { forId: 'f_description' }) +
        field('Срок', inputDate('deadline', 'ПолеСрок'), { required: true, error: e.deadline, forId: 'f_deadline', name: 'Срок' }) +
        field('Статус', selectOptions('status', 'ПолеСтатус', [
          { value: 'not_started', text: 'Не начата' }, { value: 'in_progress', text: 'В работе' }, { value: 'done', text: 'Выполнена' }]), { forId: 'f_status' }) +
        field('Проверяющий', selectOptions('reviewerId', 'ПолеПроверяющий', userOptions('По умолчанию (' + userShort(program.defaultReviewerId) + ')')), { forId: 'f_reviewerId' }) +
        field('Наблюдатели',
          '<label class="check"><input type="checkbox" data-field="obsInherit" data-rerender="1"' + (dlgValue('obsInherit') ? ' checked' : '') + ro() +
            a1c('Флажок', 'ПолеНаблюдателиКакВАП') + '> Как в АП <span class="muted">(' + esc(namesOf(program.defaultObserverIds)) + ')</span></label>' +
          (dlgValue('obsInherit') ? '' : userCheckList('observers', 'ТаблицаНаблюдатели')),
          { error: e.observers, name: 'Наблюдатели' }) +
        field('Результат', textarea('result', 'ПолеРезультат'), { forId: 'f_result' });
    },
    validate: function (t, v) {
      var e = {};
      if (!required(v.name)) e.name = 'Укажите наименование задачи';
      if (!required(v.deadline)) e.deadline = 'Укажите срок';
      if (!v.obsInherit && !(v.observers || []).length) e.observers = 'Выберите наблюдателей или отметьте «Как в АП»';
      return e;
    },
    apply: function (t, v) {
      var program = programOf(t);
      var spec = {
        name: v.name.trim(), block: v.block, description: (v.description || '').trim(), deadline: v.deadline, status: v.status,
        reviewerId: v.reviewerId || null, observerIds: v.obsInherit ? [] : v.observers.slice(), result: required(v.result) ? v.result.trim() : null
      };
      var x = dlgCtx().taskId ? taskById(dlgCtx().taskId) : null;
      if (!x) {
        D.tasks.push(newTask(program, spec));
        programChanged(t, 'Добавлена задача «' + spec.name + '»');
        toast('Задача добавлена');
        return;
      }
      // Изменением АП считаются наименование, срок, блок, проверяющий и наблюдатели; статус и результат — нет
      var changed = [];
      if (x.name !== spec.name) changed.push('наименование');
      if (x.deadline !== spec.deadline) changed.push('срок ' + fmtDate(x.deadline) + ' → ' + fmtDate(spec.deadline));
      if (x.block !== spec.block) changed.push('блок');
      if ((x.reviewerId || null) !== spec.reviewerId) changed.push('проверяющий');
      if (!sameList(x.observerIds, spec.observerIds)) changed.push('наблюдатели');
      var oldName = x.name;
      for (var k in spec) x[k] = spec[k];
      if (changed.length) programChanged(t, 'Изменена задача «' + oldName + '»: ' + changed.join(', '));
      toast('Задача сохранена');
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
      programChanged(t, 'Назначен проверяющий ' + userShort(v.userId) + ': ' + (list.length === 1 ? 'задача «' + list[0].name + '»' : 'задач ' + list.length));
      state.selectedTasks = {};
      toast('Проверяющий назначен: ' + userShort(v.userId));
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
      if (p.defaultReviewerId !== v.reviewerId) changed.push('проверяющий по умолчанию: ' + userShort(v.reviewerId));
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
      return { block: x.block, name: x.name, description: x.description, deadline: addDays(t.startDate, x.offsetDays) };
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
          deadline: addDays(t.startDate, diffDays(src.startDate, x.deadline)) };
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
        '<th>Задача</th><th>Блок</th><th>Срок</th></tr></thead><tbody>' +
        tp.tasks.map(function (x, i) {
          var has = existing.indexOf(x.name) >= 0;
          return '<tr><td><input type="checkbox" data-field-list="picked" value="' + i + '"' + (picked.indexOf(String(i)) >= 0 ? ' checked' : '') +
            ' aria-label="' + esc(x.name) + '"' + a1c('Флажок', 'ТаблицаЗадачиШаблонаПометка') + '></td>' +
            '<td>' + esc(x.name) + (has ? ' <span class="muted text-s">уже есть в АП</span>' : '') + '</td>' +
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

  function openDialog(type, traineeId, ctx) {
    var def = DIALOGS[type];
    var t = trainee(traineeId);
    ctx = ctx || {};
    var lock = editLock(t);
    if (lock && EDIT_DIALOGS.indexOf(type) >= 0) { toast(lock); return; }
    if (checklistLock(t) && ['checklistItem', 'checklistFill', 'request0911'].indexOf(type) >= 0) { toast(checklistLock(t)); return; }
    state.openMenu = null;
    state.dialog = { type: type, traineeId: traineeId, ctx: ctx, readOnly: type === 'task' && !!lock && !!ctx.taskId, values: {}, errors: {} };
    if (type === 'task' && lock && !ctx.taskId) { state.dialog = null; toast(lock); return; }
    state.dialog.values = def.init ? def.init(t, ctx) : {};
    render();
    var first = el('dialogHost').querySelector('[data-field]') || el('dialogHost').querySelector('.btn-primary');
    if (first) first.focus();
  }
  function closeDialog() { state.dialog = null; renderDialog(); }
  function submitDialog() {
    var d = state.dialog;
    var def = DIALOGS[d.type];
    var t = trainee(d.traineeId);
    if (def.readOnly || d.readOnly) { closeDialog(); return; }
    d.errors = def.validate ? def.validate(t, d.values) : {};
    if (Object.keys(d.errors).length) {
      renderDialog();
      var bad = el('dialogHost').querySelector('[aria-invalid="true"], .toggle.invalid button');
      if (bad) bad.focus();
      return;
    }
    def.apply(t, d.values);
    state.dialog = null;
    render();
  }

  function renderDialog() {
    var host = el('dialogHost');
    var d = state.dialog;
    if (!d) { host.innerHTML = ''; return; }
    var def = DIALOGS[d.type];
    var t = trainee(d.traineeId);
    var title = def.titleFn ? def.titleFn() : def.title;
    var readOnly = def.readOnly || d.readOnly;
    host.innerHTML = '<div class="modal-backdrop">' +
      '<div class="modal' + (def.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"' +
      a1c('ОтдельнаяФорма', def.form) + '>' +
      '<div class="modal-head row"><span class="modal-title grow">' + esc(title) + '</span>' +
        button('', { cls: 'btn-icon btn-flat', icon: 'close', title: 'Закрыть', action: 'dialogCancel', name: def.form + 'Закрыть' }) + '</div>' +
      '<div class="modal-body col gap-3">' + def.body(t) + '</div>' +
      '<div class="modal-foot row"' + a1c('КоманднаяПанель', def.form + 'КоманднаяПанель') + '><span class="grow"></span>' +
        button(readOnly ? 'Закрыть' : def.submit, { cls: def.danger && !readOnly ? 'btn-danger' : 'btn-primary', action: 'dialogSubmit', name: def.form + 'Кнопка' + (readOnly ? 'Закрыть' : 'Выполнить') }) +
        (readOnly ? '' : button('Отмена', { action: 'dialogCancel', name: def.form + 'КнопкаОтмена' })) +
      '</div></div></div>';
  }

  // Выбор стажёра из любого места: дерево раскрывается до него, вкладка — по этапу (раздел 5.4)
  function selectTrainee(id) {
    var t = trainee(id);
    state.selectedTraineeId = id;
    state.traineeTab = t.stage === 'found' ? 'prepare' : 'program';
    state.notesExpanded = false;
    state.taskFilter = null;
    state.taskBlock = 'all';
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
    leftMode: function (btn) { state.leftMode = btn.getAttribute('data-value'); renderLeft(); },
    toggleDept: function (row) {
      if (searchQuery()) return; // при поиске ветки раскрыты
      var id = row.getAttribute('data-id');
      state.collapsed[id] = !state.collapsed[id];
      renderLeft();
    },
    toggleLeft: function () { state.leftCollapsed = !state.leftCollapsed; renderLeft(); },
    selectTrainee: function (row) { selectTrainee(row.getAttribute('data-id')); },
    backToList: function () { state.selectedTraineeId = null; render(); },

    // Сводная таблица
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
      renderCenter();
    },
    toggleHelp: function () { state.helpOpen = !state.helpOpen; render(); },
    openHelp: function () { toast('Инструкция откроется в базе знаний'); },
    toggleNotes: function () { state.notesExpanded = !state.notesExpanded; renderCenter(); },
    dismissNote: function (btn) {
      state.dismissed[state.selectedTraineeId + ':' + btn.getAttribute('data-key')] = true;
      renderCenter();
    },
    noteAction: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var key = btn.getAttribute('data-key');
      var n = getNotifications(t).filter(function (x) { return x.key === key; })[0];
      if (!n) return;
      if (n.action === 'createProgram') actions.createProgram();
      else if (n.action === 'sendToApproval') openDialog('sendToApproval', t.id);
      else if (n.action === 'startClosing') openDialog('close', t.id);
      else if (n.action === 'showTasksOverdue' || n.action === 'showTasksUndone') {
        state.traineeTab = 'program';
        state.taskBlock = 'all';
        state.selectedTasks = {};
        state.collapsedBlocks = {};
        state.taskFilter = n.action === 'showTasksOverdue' ? 'overdue' : 'undone';
        renderCenter();
      } else if (n.action === 'showChecklistOverdue') {
        state.traineeTab = 'prepare';
        state.checklistMode = 'all';
        state.checklistFilter = 'overdue';
        renderCenter();
      }
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
      state.taskFilter = btn.getAttribute('data-value') || null;
      state.selectedTasks = {};
      renderCenter();
    },
    taskBlock: function (btn) {
      state.taskBlock = btn.getAttribute('data-value');
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
    dialogCancel: function () { closeDialog(); },
    dlgChoose: function (btn) {
      state.dialog.values[btn.getAttribute('data-field')] = btn.getAttribute('data-value');
      delete state.dialog.errors[btn.getAttribute('data-field')];
      renderDialog();
      var on = el('dialogHost').querySelector('[data-action="dlgChoose"].on');
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
      if (tgt.hasAttribute('data-rerender') || (state.dialog.type === 'checklistItem' && f === 'date')) {
        if (f === 'template') state.dialog.values.picked = [];
        if (f === 'role') state.dialog.values.userId = roleDefaultUser(trainee(state.dialog.traineeId), tgt.value);
        renderDialog();
      }
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
    if (e.target.getAttribute('data-change') === 'hideEmpty') {
      state.hideEmpty = e.target.checked;
      renderLeft();
    }
  });
  // Двойной клик по строке задачи открывает карточку задачи
  document.addEventListener('dblclick', function (e) {
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
      else if (state.openMenu) { state.openMenu = null; renderCenter(); }
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
      notifications: getNotifications(t).map(function (n) { return n.tone + ': ' + n.text; })
    };
  };
  window.plural = plural;

  // НЕ_ПЕРЕНОСИТЬ: элементы без атрибутов соответствия 1С (раздел 7.9)
  window.check1c = function () {
    return Array.prototype.filter.call(document.querySelectorAll('button, input, select, table, [data-tab]'), function (x) {
      return !x.getAttribute('data-1c') || !x.getAttribute('data-1c-name');
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
