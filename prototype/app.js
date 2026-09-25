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
  var W_TASKS = ['задача', 'задачи', 'задач'];

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
  function topMarker(t) {
    var list = getNotifications(t);
    for (var i = 0; i < list.length; i++) if (list[i].marker) return list[i];
    return null;
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
    demoMenuOpen: false,         // НЕ_ПЕРЕНОСИТЬ
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

  function markerBadge(t) {
    var m = topMarker(t);
    return m ? '<span class="tree-marker">' + badge(m.tone, m.marker, 'ДеревоПодразделенийМаркер') + '</span>' : '';
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

  function emptyFilterState() {
    var parts = [];
    if (searchQuery()) parts.push(link('Сбросить поиск', { action: 'resetSearch', name: 'ГиперссылкаСброситьПоиск' }));
    if (state.counterFilter) parts.push(link('Сбросить фильтр', { action: 'clearCounterFilter', name: 'ГиперссылкаСброситьФильтр' }));
    var text = searchQuery() ? 'Никого не нашли' : 'Нет стажёров на этапе «' + counterById(state.counterFilter).title + '»';
    return '<div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаПустойРезультат') + '>' +
      '<span' + a1c('Надпись', 'ДекорацияПустойРезультат') + '>' + esc(text) + '</span>' +
      '<div class="row">' + parts.join('') + '</div></div>';
  }

  function renderTree() {
    var nodes = buildTree();
    if (!nodes.length) return '<div class="tree">' + emptyFilterState() + '</div>';
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
              markerBadge(t) + '</div>');
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
      body = (searchQuery() || state.counterFilter) && !visibleTrainees().length ? emptyFilterState() :
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
          '</span>' + markerBadge(t) + '</div>';
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
        ' title="Сортировать по колонке «' + text + '»"' + a1c('ТаблицаФормы', 'ТаблицаСтажеровСортировка' + keyName) + '>' +
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
      '<div class="h-block"' + a1c('Надпись', 'ДекорацияЗаголовокСводки') + '>Стажёры: ' + list.length + '</div>' +
      (list.length ?
        '<div class="table-box">' +
        '<table class="grid summary-table"' + a1c('ТаблицаФормы', 'ТаблицаСтажеров') + '>' +
        '<colgroup><col><col><col class="w-stage"><col class="w-tasks"><col class="w-overdue"><col class="w-date"></colgroup>' +
        '<thead><tr>' + th('Стажёр') + th('Подразделение') + th('Этап', 'stage') + th('Задачи') + th('Просрочено', 'overdue', 'num') + th('Срок', 'deadline') +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : emptyFilterState()) +
      '</div>';
  }

  // Карточка стажёра — фаза 2. Пока только переход назад и имя.
  function renderTraineeCard(t) {
    return '<div class="col gap-4"' + a1c('ГруппаВертикальная', 'ГруппаКарточкаСтажера') + '>' +
      '<div class="row">' + link('← Все стажёры', { action: 'backToList', name: 'ГиперссылкаВсеСтажеры' }) + '</div>' +
      '<div class="row gap-3"><span class="text-xl bold">' + esc(t.fullName) + '</span>' + stageBadge(t) + '</div>' +
      '<div class="debug-note muted"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ЗаглушкаКарточкиСтажера') + '>Карточка стажёра появится в фазе 2</div>' +
      '</div>';
  }

  function renderHelp() {
    el('helpZone').classList.toggle('hidden', !state.helpOpen);
    el('helpZone').innerHTML = '';
  }

  // НЕ_ПЕРЕНОСИТЬ: демо-переключатель этапа выбранного стажёра
  function renderDemo() {
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    var html = '';
    if (t && state.demoMenuOpen) {
      html += '<div class="menu"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоМенюЭтапов') + '>' +
        STAGES.map(function (s) {
          return '<button type="button" data-action="demoSetStage" data-stage="' + s.code + '"' +
            a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоЭтап_' + s.code) + '>' + (t.stage === s.code ? '● ' : '○ ') + esc(s.title) + '</button>';
        }).join('') + '</div>';
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

  // Выбор стажёра из любого места: дерево раскрывается до него, вкладка — по этапу (раздел 5.4)
  function selectTrainee(id) {
    var t = trainee(id);
    state.selectedTraineeId = id;
    state.traineeTab = t.stage === 'found' ? 'prepare' : 'program';
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
    if (e.target.getAttribute('data-input') === 'search') {
      state.search = e.target.value;
      renderLeft();
      renderCenter();
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-change') === 'hideEmpty') {
      state.hideEmpty = e.target.checked;
      renderLeft();
    }
  });
  // Строки дерева и таблиц открываются с клавиатуры
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.hasAttribute && t.hasAttribute('data-action') &&
        t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') {
      e.preventDefault();
      t.click();
    }
    if (e.key === 'Escape' && state.demoMenuOpen) { state.demoMenuOpen = false; renderDemo(); }
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
