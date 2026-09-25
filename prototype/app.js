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
  function toggle(name, action, items, current) {
    return '<div class="toggle"' + a1c('Тумблер', name) + ' role="group">' +
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

  function renderLeft() {
    el('leftZone').innerHTML =
      '<div class="stub" data-1c="НЕ_ПЕРЕНОСИТЬ" data-1c-name="ЗаглушкаЛевойПанели">Левая панель — фаза 1</div>';
  }

  function renderCenter() {
    el('centerZone').innerHTML = renderPhase0Debug();
  }

  function renderHelp() {
    el('helpZone').classList.toggle('hidden', !state.helpOpen);
    el('helpZone').innerHTML = '';
  }

  // НЕ_ПЕРЕНОСИТЬ: отладочная таблица фазы 0 — производные значения и образцы компонентов
  function renderPhase0Debug() {
    var rows = D.trainees.map(function (t) {
      var st = statsOf(t);
      var notes = getNotifications(t);
      return '<tr class="clickable' + (state.selectedTraineeId === t.id ? ' selected' : '') + '" data-action="debugSelect" data-id="' + t.id + '">' +
        '<td><div>' + esc(t.fullName) + '</div><div class="muted text-s">' + esc(t.position) + '</div></td>' +
        '<td>' + stageBadge(t) + '</td>' +
        '<td>' + (st ? '<div class="indicator-wrap" style="width:140px">' + indicator(st.pct, 'ИндикаторЗадач') + '<span>' + st.pct + '%</span></div>' +
                       '<div class="muted text-s">' + st.done + ' / ' + st.progress + ' / ' + st.overdue + ' / ' + st.todo + '</div>' : '—') + '</td>' +
        '<td>' + timePct(t) + '%<div class="muted text-s">день ' + dayNo(t) + ' из ' + totalDays(t) + '</div></td>' +
        '<td>' + (lag(t) ? '<span class="danger-text">да</span>' : 'нет') + '</td>' +
        '<td>' + (daysToStart(t) > 0 ? 'выход через ' + pluralN(daysToStart(t), W_DAYS) : 'до конца ' + pluralN(daysToEnd(t), W_DAYS)) + '</td>' +
        '<td>' + (notes.length ? notes.map(function (n) { return badge(n.tone, n.marker || n.key); }).join(' ') : '<span class="muted">—</span>') + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="col gap-4" data-1c="НЕ_ПЕРЕНОСИТЬ" data-1c-name="ОтладкаФазы0">' +
      '<div class="debug-note col gap-1"><div class="h-block">Фаза 0: каркас</div>' +
      '<div class="muted">Отладочный экран: производные значения из data.js и образцы компонентов. В фазе 1 заменяется сводной таблицей. ' +
      'Клик по строке выбирает стажёра для демо-переключателя этапа.</div></div>' +
      '<div class="table-box"><table class="grid"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ТаблицаОтладки') + '><thead><tr>' +
      '<th>Стажёр</th><th>Этап</th><th>Задачи (вып./раб./проср./не нач.)</th><th>Срок прошёл</th><th>Отставание</th><th>Сроки</th><th>Уведомления</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="panel col gap-3">' +
      '<div class="h-block">Компоненты</div>' +
      '<div class="row wrap">' + button('Основная кнопка', { cls: 'btn-primary', name: 'ОбразецОсновная' }) +
        button('Обычная кнопка', { name: 'ОбразецОбычная' }) +
        button('С иконкой', { icon: 'print', name: 'ОбразецСИконкой' }) +
        button('', { cls: 'btn-icon', icon: 'more', title: 'Ещё', name: 'ОбразецИконка' }) +
        button('Неактивная', { disabled: true, title: 'Причина неактивности', name: 'ОбразецНеактивная' }) +
        link('Гиперссылка', { name: 'ОбразецСсылка' }) + '</div>' +
      '<div class="row wrap">' + badge('neutral', 'Не начата') + badge('info', 'В работе') + badge('success', 'Выполнена') +
        badge('danger', 'Просрочена') + badge('warning', 'Черновик АП') + '</div>' +
      '<div class="row" style="width:360px">' + indicator(58, 'ОбразецИндикатор') + '<span>58%</span></div>' +
      '<div class="indicator stacked" style="width:360px"' + a1c('Индикатор', 'ОбразецСоставнаяПолоса', 'high') + '>' +
        '<span class="seg-done" style="width:58%"></span><span class="seg-progress" style="width:29%"></span>' +
        '<span class="seg-overdue" style="width:13%"></span></div>' +
      '<div class="row wrap gap-4">' +
        '<label class="check"><input type="checkbox" checked' + a1c('Флажок', 'ОбразецФлажок') + '> Флажок</label>' +
        toggle('ОбразецТумблер', 'noop', [{ value: 'a', text: 'Структура', name: 'Структура' }, { value: 'b', text: 'Требуют внимания', name: 'ТребуютВнимания' }], 'a') +
        '<input class="input" placeholder="Поле ввода" style="width:220px"' + a1c('ПолеВвода', 'ОбразецПолеВвода') + '>' +
      '</div>' +
      '<div class="muted">Склонение: ' + [1, 2, 5, 11, 21, 24].map(function (n) { return pluralN(n, W_TRAINEES); }).join(', ') + '</div>' +
      '</div></div>';
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

  var actions = {
    topTab: function (btn) { state.topTab = btn.getAttribute('data-tab'); render(); },
    noop: function () {},

    // НЕ_ПЕРЕНОСИТЬ
    debugSelect: function (row) { state.selectedTraineeId = row.getAttribute('data-id'); render(); },
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
