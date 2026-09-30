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
  function userName(id) { var u = user(id); if (u) return u.fullName; var tr = trainee(id); return tr ? tr.fullName : '—'; }   // FT_9: стажёр тоже может быть пользователем
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

  // FT_10: задача «На проверке» (стажёр выполнил, ждёт проверяющего) не считается просроченной
  function isOverdue(task) { return task.status !== 'done' && task.status !== 'review' && task.deadline < D.TODAY; }
  // Статус для показа: просрочка — признак, но в бейдже показывается вместо исходного статуса
  function viewStatus(task) { return isOverdue(task) ? 'overdue' : task.status; }

  function totalDays(t) { return diffDays(t.startDate, t.endDate) + 1; }
  function dayNo(t) { return clamp(diffDays(t.startDate, D.TODAY) + 1, 0, totalDays(t)); }
  function timePct(t) { return Math.round(dayNo(t) / totalDays(t) * 100); }
  function daysToStart(t) { return diffDays(D.TODAY, t.startDate); }
  function daysToEnd(t) { return diffDays(D.TODAY, t.endDate); }

  // Сводка по задачам АП: выполнено / в работе / просрочено / не начато. Просроченная считается только в «просрочено».
  function taskStats(list) {
    var s = { total: list.length, done: 0, progress: 0, review: 0, overdue: 0, todo: 0, pct: 0 };
    list.forEach(function (x) {
      var v = viewStatus(x);
      if (v === 'done') s.done++;
      else if (v === 'overdue') s.overdue++;
      else if (v === 'in_progress') s.progress++;
      else if (v === 'review') s.review++;
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
  // Чек-лист закрытия (фаза 10, 5.2): срок — от даты окончания стажировки
  function closureOf(t) { return D.closureChecklist.filter(function (c) { return c.traineeId === t.id; }); }
  function closureDate(item) { return addDays(trainee(item.traineeId).endDate, item.offsetDays); }
  function closureOverdue(item) { return !item.done && closureDate(item) < D.TODAY; }
  function closureRequired(t) { return closureOf(t).filter(function (c) { return !c.optional; }); }
  function closureLeft(t) { return closureRequired(t).filter(function (c) { return !c.done; }).length; }
  function closureReady(t) { return closureRequired(t).length > 0 && closureLeft(t) === 0; }
  function ensureClosureChecklist(t) {
    if (!closureOf(t).length) Array.prototype.push.apply(D.closureChecklist, D.buildClosureChecklist(t));
  }

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

  // Замечания блока аналитики (фаза 11, 5.2). Поля: id, severity, text. Тот же текст — в дереве и в колонке «Требует действия» сводной (11.7).
  // Порядок: danger → warning → info, внутри уровня — порядок NOTE_IDS (таблица 5.2)
  var NOTE_IDS = ['prep_overdue', 'tasks_overdue', 'closure_overdue', 'no_program', 'draft_stale', 'rejected', 'lag', 'close_soon', 'closure_ready'];
  function getNotifications(t) {
    var list = [];
    var s = t.stage;
    var program = programOf(t);
    if (s === 'closed') return list;

    var clOver = checklistOf(t).filter(checklistOverdue).length;
    if (clOver > 0) {
      list.push({
        id: 'prep_overdue', severity: 'danger',
        text: clOver + ' ' + plural(clOver, ['просроченный пункт', 'просроченных пункта', 'просроченных пунктов']) + ' подготовки к выходу'
      });
    }
    if (s === 'active') {
      var st = statsOf(t);
      if (st && st.overdue > 0) {
        list.push({
          id: 'tasks_overdue', severity: 'danger',
          text: st.overdue + ' ' + plural(st.overdue, ['просроченная задача', 'просроченные задачи', 'просроченных задач']) + ' адаптационной программы'
        });
      }
    }
    if (s === 'closing') {
      var ccOver = closureOf(t).filter(closureOverdue).length;
      if (ccOver > 0) {
        list.push({
          id: 'closure_overdue', severity: 'danger',
          text: ccOver + ' ' + plural(ccOver, ['просроченный пункт', 'просроченных пункта', 'просроченных пунктов']) + ' закрытия стажировки'
        });
      }
    }

    if (s === 'found' && !program) {
      var ds = daysToStart(t);
      list.push({
        id: 'no_program', severity: 'warning',
        text: 'Не создана адаптационная программа. ' +
              (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate))
      });
    }
    if (s === 'draft' && t.draftSince && !t.rejectionComment && diffDays(t.draftSince, D.TODAY) >= 2) {
      var dd = diffDays(t.draftSince, D.TODAY);
      list.push({
        id: 'draft_stale', severity: 'warning',
        text: 'Адаптационная программа не отправлена на согласование уже ' + pluralN(dd, W_DAYS)
      });
    }
    // Фаза 11, 5.2: возврат на доработку — warning (красный — только просрочки)
    if (s === 'draft' && t.rejectionComment) {
      list.push({
        id: 'rejected', severity: 'warning',
        text: 'Адаптационная программа возвращена на доработку: «' + t.rejectionComment + '»'
      });
    }
    if (s === 'active' && lag(t)) {
      list.push({
        id: 'lag', severity: 'warning',
        text: 'Задачи отстают от графика: выполнено ' + statsOf(t).pct + '% при прошедших ' + timePct(t) + '% срока'
      });
    }

    // Фаза 11, 5.2: «пора начинать закрытие» — только этап active с ≤ CLOSE_AVAILABLE_DAYS дней до окончания
    if (closeSoon(t)) {
      var de = Math.max(0, daysToEnd(t));
      list.push({
        id: 'close_soon', severity: 'info',
        text: 'До окончания стажировки ' + pluralN(de, W_DAYS) + ', пора начинать закрытие'
      });
    }
    if (s === 'closing' && closureReady(t)) {
      list.push({
        id: 'closure_ready', severity: 'info',
        text: 'Все обязательные пункты закрытия выполнены'
      });
    }

    return list.sort(function (a, b) {
      return TONE_ORDER[a.severity] - TONE_ORDER[b.severity] || NOTE_IDS.indexOf(a.id) - NOTE_IDS.indexOf(b.id);
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
    dot: '<circle cx="8" cy="8" r="5" fill="currentColor"/>',
    circleX: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    arrowFill: '<path d="M2 6h6.5V3L14 8l-5.5 5v-3H2z" fill="currentColor"/>',
    arrowUp: '<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowDown: '<path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    flag: '<path d="M3.5 14V2.5M3.5 3h8l-1.8 3 1.8 3h-8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    print: '<path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><rect x="4.5" y="9.5" width="7" height="4" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    plus: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    // FT_10: настройка важности, удаление уровня, флажок важности (заливка)
    gear: '<path d="M6.2 3.3 6.4 1.3 9.6 1.3 9.8 3.3 11.1 4.1 13.0 3.3 14.6 6.0 12.9 7.2 12.9 8.8 14.6 10.0 13.0 12.7 11.1 11.9 9.8 12.7 9.6 14.7 6.4 14.7 6.2 12.7 4.9 11.9 3.0 12.7 1.4 10.0 3.1 8.8 3.1 7.2 1.4 6.0 3.0 3.3 4.9 4.1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/>',   // Err_2: классическая шестерёнка (6 зубцов)
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9M7 7v4.5M9 7v4.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    flagFill: '<path d="M3.5 14V2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3.5 3h8l-1.8 3 1.8 3h-8z" fill="currentColor"/>',
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
    more: '<circle cx="12" cy="6.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor"/>',
    close: '<path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  var SHELL_LOGO = '<svg viewBox="0 0 46 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M3 6.5L7 4v15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M29.5 6.2A8.5 8.5 0 1 0 21 19.5h24" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '<path d="M26 9A4.8 4.8 0 1 0 21 15.5h24" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
  function shellIcon(name) {
    if (name === 'logo') return SHELL_LOGO;
    var size = name === 'home' ? 16 : name === 'refresh' || name === 'more' ? 18 : name === 'back' ? 20 : 22;
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
    close_soon: 'СкороОкончание', closure_overdue: 'ПросроченоЗакрытие', closure_ready: 'ЗакрытиеГотово',
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
    // Вид тумблера (выбранный вариант, рамка) рисует платформа — сверить с 1С 8.5 (фаза 9, 4.5)
    return '<div class="toggle' + (cls ? ' ' + cls : '') + '"' + a1c('Тумблер', name, 'check') + ' role="group">' +
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
    analyticsOpen: false,        // блок «Аналитика по адаптационной программе» развёрнут — общий для всех стажёров до перезагрузки
    openMenu: null,              // открытое подменю
    dialog: null,                // открытый диалог (верхний)
    dialogStack: [],             // формы-владельцы под открытым диалогом
    taskFilter: null,            // тумблер статусов таблицы задач: null («Все») | 'overdue' | 'progress' | 'todo' | 'done'
    taskSort: { key: null, dir: 1 },
    selectedTasks: {},           // выбранные флажками задачи: {taskId: true}. Только выбор, не отметка выполнения
    collapsedBlocks: {},         // свёрнутые группы «Корпоративный / Специальный блок»
    programViewOf: null,         // стажёр, для которого открыта вкладка АП (фаза 11, 6.2: при открытии группы свёрнуты)
    checklistMode: 'all',        // 'all' | 'mine'
    closureMode: 'all',          // чек-лист закрытия: 'all' | 'mine'
    demoMenuOpen: false,         // НЕ_ПЕРЕНОСИТЬ
    demoUserMenuOpen: false,     // НЕ_ПЕРЕНОСИТЬ: меню демо-переключателя пользователя (FT_8)
    formMenuOpen: false,         // FT_12, НЕ_ПЕРЕНОСИТЬ: меню «Ещё» (⋮) окна формы
    markup: false,               // НЕ_ПЕРЕНОСИТЬ: режим разметки 1С (Shift+D)
    // FT_11: вкладки окон клиента. tabs — открытые карточки стажёров {id, traineeId, ctx}; active — id открытой (null — «Начало»);
    // home — состояние карточки / сводной окна «Начало», пока открыта другая вкладка
    shell: { tabs: [], active: null, home: null },
    // FT_10: вкладка «Задачи и уведомления»
    tv: {
      sub: 'tasks',              // 'tasks' | 'notes'
      filter: 'all',             // 'all' | 'overdue' | 'attention' | 'today'
      sourcesOff: {}, typesOff: {},   // снятые флажки отборов «По источнику», «По типу задачи»
      level: null,               // отбор по уровню важности
      search: '',
      collapsed: {},             // свёрнутые группы «Просроченные / Требуют внимания / Остальные»
      selected: {},              // выбранные флажками задачи: {ключ: true}
      noteFilter: 'all', noteSourcesOff: {}, noteSearch: ''
    },
    toasts: []
  };

  /* =====================================================================
   * Рендер
   * ===================================================================== */

  function el(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------------
   * FT_9: демо-пользователи и видимость. НЕ_ПЕРЕНОСИТЬ — список вариантов; в 1С видимость задаётся ролями
   * и правами на уровне записей (RLS) по подразделению, руководителю стажировки и стажёру.
   * scope: 'all' — все стажёры; 'dept' — стажёры подразделения dept и подчинённых; 'head' — где пользователь руководитель
   * стажировки; 'ksh' — пустая страница (свой кабинет позже); 'trainee' — только свои задачи АП.
   * --------------------------------------------------------------------- */
  var DEMO_USERS = [
    { id: 'u-strygin',     label: 'Стрыгин К.М. (заместитель руководителя ЦАС)', role: 'Заместитель руководителя ЦАС', scope: 'all', name: 'ЗамРуководителяЦАС' },
    { id: 'u-kladova',     label: 'Кладова Я.С. (руководитель отдела)',           role: 'Руководитель отдела',          scope: 'dept', dept: 'd-corp', name: 'РуководительОтдела' },
    { id: 'u-sizova',      label: 'Сизова А.В. (руководитель стажировки)',        role: 'Руководитель стажировки',      scope: 'head', name: 'РуководительСтажировки' },
    { id: 'u-sudomoykina', label: 'Судомойкина А.Н. (HR-менеджер)',               role: 'HR-менеджер',                  scope: 'all', name: 'HRМенеджер' },
    { id: 'u-baeva',       label: 'Баева Д.В. (Сотрудник КШ)',                    role: 'Сотрудник КШ',                 scope: 'ksh', name: 'СотрудникКШ' },
    { id: 't-ivanov',      label: 'Иванов П.С. (Стажер)',                         role: 'Стажёр',                       scope: 'trainee', name: 'Стажер' }
  ];
  function demoUser() { return byId(DEMO_USERS, D.CURRENT_USER_ID) || DEMO_USERS[0]; }
  function isTraineeUser() { return demoUser().scope === 'trainee'; }
  function isKshUser() { return demoUser().scope === 'ksh'; }
  // Стажёры, доступные текущему пользователю
  function myTrainees() {
    var u = demoUser();
    return D.trainees.filter(function (t) {
      if (u.scope === 'all') return true;
      if (u.scope === 'dept') return deptChain(t.departmentId).some(function (d) { return d.id === u.dept; });
      if (u.scope === 'head') return t.headId === u.id;
      if (u.scope === 'trainee') return t.id === u.id;
      return false;
    });
  }

  /* ---------------------------------------------------------------------
   * FT_11: вкладки окон клиента (НЕ_ПЕРЕНОСИТЬ — рисует платформа). Ссылка «Предмет» в карточке задачи открывает
   * карточку стажёра в новом окне; в 1С — ОткрытьФорму(...) без блокировки владельца, платформа добавляет вкладку.
   * У каждой вкладки своё состояние карточки (выбранная страница, фильтр задач, выбор, свёрнутые группы).
   * --------------------------------------------------------------------- */
  var CTX_KEYS = ['selectedTraineeId', 'traineeTab', 'taskFilter', 'taskSort', 'selectedTasks', 'collapsedBlocks', 'programViewOf', 'checklistMode', 'closureMode'];
  function activeDoc() { return state.shell.active ? byId(state.shell.tabs, state.shell.active) : null; }
  function docTitle(tab) { return 'Адаптационная программа (' + trainee(tab.traineeId).fullName + ')'; }
  function saveCtx() { var c = {}; CTX_KEYS.forEach(function (k) { c[k] = state[k]; }); return c; }
  function loadCtx(c) { CTX_KEYS.forEach(function (k) { state[k] = c[k]; }); state.openMenu = null; }
  function switchShell(id) {
    if (state.shell.active === id) return;
    var cur = activeDoc();
    if (cur) cur.ctx = saveCtx(); else state.shell.home = saveCtx();
    state.shell.active = id;
    var next = activeDoc();
    loadCtx(next ? next.ctx : state.shell.home);
  }
  function openDocTab(traineeId, page) {
    var id = 'ap:' + traineeId;
    state.dialog = null; state.dialogStack = [];
    if (!byId(state.shell.tabs, id)) {
      state.shell.tabs.push({ id: id, traineeId: traineeId, ctx: { selectedTraineeId: traineeId, traineeTab: page, taskFilter: null,
        taskSort: { key: null, dir: 1 }, selectedTasks: {}, collapsedBlocks: {}, programViewOf: null, checklistMode: 'all', closureMode: 'all' } });
      switchShell(id);
    } else {
      switchShell(id);
      state.traineeTab = page;   // уже открытая вкладка — на странице предмета
    }
    render();
  }
  function closeDocTab(id) {
    if (state.shell.active === id) switchShell(null);
    state.shell.tabs = state.shell.tabs.filter(function (x) { return x.id !== id; });
    render();
  }
  function renderShellTabs() {
    var home = !state.shell.active;
    el('shellTabs').innerHTML =
      '<button type="button" role="tab" aria-selected="' + home + '" class="shell-tab shell-home' + (home ? ' active' : '') + '" data-action="shellTab" data-id=""' +
        a1c('НЕ_ПЕРЕНОСИТЬ', 'ВкладкаОкнаНачало') + '>' + shellIcon('home') + '<span>Начало</span></button>' +
      state.shell.tabs.map(function (x) {
        var on = state.shell.active === x.id;
        var title = docTitle(x);
        return '<span class="shell-tab shell-doc' + (on ? ' active' : '') + '">' +
          '<button type="button" role="tab" aria-selected="' + on + '" class="shell-tab-title" data-action="shellTab" data-id="' + x.id + '" title="' + esc(title) + '"' +
            a1c('НЕ_ПЕРЕНОСИТЬ', 'ВкладкаОкнаКарточкаСтажера') + '>' + esc(title) + '</button>' +
          '<button type="button" class="shell-tab-close" data-action="shellClose" data-id="' + x.id + '" title="Закрыть" aria-label="' + esc('Закрыть: ' + title) + '"' +
            a1c('НЕ_ПЕРЕНОСИТЬ', 'ВкладкаОкнаЗакрыть') + '>' + icon('close') + '</button></span>';
      }).join('');
  }

  function render() {
    renderShellTabs();
    var doc = activeDoc();   // FT_11: открыта вкладка с карточкой стажёра
    el('window').classList.toggle('hidden', !!doc);
    el('docWindow').classList.toggle('hidden', !doc);
    if (doc) {
      el('docTitle').textContent = docTitle(doc);
      renderCenter();
      renderDialog();
      renderToasts();
      return;
    }
    renderTopTabs();
    var isAdaptation = state.topTab === 'adaptation';
    var isTasks = state.topTab === 'tasks';   // FT_10
    el('adaptationPage').classList.toggle('hidden', !isAdaptation);
    el('tasksPage').classList.toggle('hidden', !isTasks);
    el('stubZone').classList.toggle('hidden', isAdaptation || isTasks);
    if (isTasks) renderTasksPage();
    if (isAdaptation) {
      // FT_9: у стажёра и сотрудника КШ левой панели нет
      var noLeft = isTraineeUser() || isKshUser();
      el('leftZone').classList.toggle('hidden', noLeft);
      if (noLeft) el('leftZone').innerHTML = ''; else renderLeft();
      renderCenter();
      renderHelp();
    }
    renderDialog();
    renderDemo();
    renderFormMenu();
    renderToasts();
  }

  // Перерисовка зон открытой страницы (после открытия / закрытия подменю)
  function renderMain() {
    if (state.dialog) renderDialog();   // FT_11: подменю в подвале карточки задачи
    if (activeDoc()) { renderCenter(); return; }
    if (state.topTab === 'tasks') { renderTasksPage(); return; }
    renderLeft();
    renderCenter();
  }

  function renderTopTabs() {
    var attention = isTraineeUser() || isKshUser() ? 0 : myTrainees().filter(needsAttention).length;
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

  // Скоро окончание: этап active и до окончания ≤ CLOSE_AVAILABLE_DAYS дней (фаза 11, 3.2)
  function closeSoon(t) { return t.stage === 'active' && daysToEnd(t) <= D.CLOSE_AVAILABLE_DAYS; }

  // Фильтры левой панели (фаза 11, 3.2; FT_8: без «Просроченные»): плоский список, взаимоисключающие, активен максимум один.
  // Разделитель — после «Требуют внимания» (sepAfter)
  var FILTERS = [
    { id: 'attention',    title: 'Требуют внимания',    icon: 'alert',    color: 'danger', name: 'ТребуютВнимания', sepAfter: true,
      match: function (t) { return needsAttention(t); } },
    { id: 'awaitProgram', title: 'Ожидают АП',          icon: 'clock',    color: 'warning',        stages: ['found', 'draft'], name: 'ОжидаютАП' },
    { id: 'approval',     title: 'На согласовании',     icon: 'docCheck', color: 'info',           stages: ['approval'],       name: 'НаСогласовании' },
    { id: 'active',       title: 'Проходят стажировку', icon: 'users',    color: 'success',        name: 'ПроходятСтажировку',
      match: function (t) { return t.stage === 'active' && !closeSoon(t); } },
    { id: 'closing',      title: 'Ожидают закрытия',    icon: 'flag',     color: 'stage-closing',  name: 'ОжидаютЗакрытия',
      match: function (t) { return t.stage === 'closing' || closeSoon(t); } }
  ];
  function filterById(id) {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].id === id) return FILTERS[i];
    return null;
  }
  function filterMatches(f, t) { return f.match ? f.match(t) : f.stages.indexOf(t.stage) >= 0; }
  function filterValue(f) { return myTrainees().filter(function (t) { return filterMatches(f, t); }).length; }

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
    return myTrainees().filter(function (t) { return traineeMatchesCounter(t) && traineeMatchesSearch(t, q); });
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
    return 'Этап: ' + stageMeta(t.stage).title + (n ? '. ' + n.text : '');
  }

  function renderLeft() {
    var zone = el('leftZone');
    if (isTraineeUser() || isKshUser()) { zone.innerHTML = ''; return; }   // FT_9: левой панели нет
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

    // Фаза 11, 3.1: заголовка панели нет; меню ⋮ — в строке «Требуют внимания», справа от числа
    var html = '<div class="left-inner">' +
      '<div class="filter-list"' + a1c('ГруппаВертикальная', 'ГруппаФильтры') + '>' +
        FILTERS.map(function (f) { return filterRow(f) + (f.sepAfter ? '<div class="filter-sep"></div>' : ''); }).join('') +
      '</div>' +
      '<label class="search-field">' + icon('search') +
        '<input type="text" class="input" data-input="search" placeholder="Поиск по ФИО или подразделению" value="' + esc(state.search) + '"' +
        ' title="Поиск по ФИО или подразделению"' + a1c('ПолеВвода', 'ПолеПоиска') + '></label>' +
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
      '<span class="filter-num c-' + f.color + '"' + a1c('Надпись', 'НадписьФильтр' + f.name + 'Число') + '>' + filterValue(f) + '</span>' +
      '<span class="filter-reset">' + (on ? button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Сбросить фильтр', action: 'clearCounterFilter', name: 'КнопкаСброситьФильтр' + f.name }) : '') + '</span>' +
      '<span class="filter-menu">' + (f.id === 'attention' ? submenu('leftPanel', 'ПодменюЛеваяПанель', [
          '<button type="button" role="menuitemcheckbox" aria-checked="' + state.hideEmpty + '" data-action="toggleHideEmpty"' +
            a1c('Кнопка', 'КомандаСкрытьПустыеПодразделения') + '><span class="menu-check">' + (state.hideEmpty ? '✓' : '') + '</span>' +
            'Скрыть подразделения без стажёров</button>'
        ], { title: 'Настройки панели', small: true }) : '') + '</span>' +
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
        // Три колонки без заголовков (фаза 9, 7.2): наименование (отступ уровня, стрелка) | статус 20px | количество 32px
        out.push('<div class="tree-row tree-dept" role="treeitem" tabindex="0" aria-expanded="' + open + '"' +
          ' data-action="toggleDept" data-id="' + n.dept.id + '"' + (hasKids ? ' title="' + (open ? 'Свернуть' : 'Развернуть') + '"' : '') + '>' +
          '<span class="tree-col-name" style="padding-left:' + (8 + level * 14) + 'px">' +
            '<span class="tree-arrow">' + (hasKids ? icon(open ? 'chevronDown' : 'chevronRight') : '') + '</span>' +
            '<span class="tree-name bold" title="' + esc(n.dept.name) + '"' + a1c('Надпись', 'ДеревоПодразделенийНаименование') + '>' + esc(n.dept.name) + '</span>' +
          '</span>' +
          '<span class="tree-col-status"></span>' +
          '<span class="tree-col-count muted"' + a1c('Надпись', 'ДеревоПодразделенийКоличество') + '>' + n.count + '</span></div>');
        if (open) {
          walk(n.children, level + 1);
          n.trainees.forEach(function (t) {
            var n = treeNotification(t);
            out.push('<div class="tree-row tree-trainee' + (state.selectedTraineeId === t.id ? ' selected' : '') + '" role="treeitem" tabindex="0"' +
              ' data-action="selectTrainee" data-id="' + t.id + '" title="' + esc(treeRowTitle(t)) + '">' +
              '<span class="tree-col-name" style="padding-left:' + (8 + (level + 1) * 14) + 'px">' +
                '<span class="tree-arrow"></span>' +
                '<span class="tree-name"' + a1c('Надпись', 'ДеревоПодразделенийСтажер', 'check') + '>' + esc(t.fullName) + '</span>' +
              '</span>' +
              '<span class="tree-col-status">' +
                (n ? '<span class="tree-marker c-' + n.severity + '" aria-label="' + esc(TONE_TITLES[n.severity] + ': ' + n.text) + '"' +
                  a1c('Картинка', 'ДеревоПодразделенийЗначок') + '>' + icon(TONE_ICONS[n.severity]) + '</span>' : '') + '</span>' +
              '<span class="tree-col-count">' + (state.selectedTraineeId === t.id ? '<span class="tree-chevron">' + icon('chevronRight') + '</span>' : '') + '</span></div>');
          });
        }
      });
    })(nodes, 0);
    return '<div class="tree" role="tree"' + a1c('ДеревоФормы', 'ДеревоПодразделений') + '>' + out.join('') + '</div>';
  }

  /* ---------------------------------------------------------------------
   * Центральная область
   * --------------------------------------------------------------------- */

  // FT_11: центральная зона — окна «Начало» или открытой вкладки с карточкой стажёра
  function centerEl() { return activeDoc() ? el('docCenter') : el('centerZone'); }
  function renderCenter() {
    if (isKshUser() && !activeDoc()) {   // FT_9: у сотрудника КШ — пустая вкладка, свой кабинет будет реализован позже
      el('centerZone').innerHTML = '<div class="empty ksh-empty"' + a1c('Надпись', 'ДекорацияКабинетКШ') + '>Здесь пока ничего нет</div>';
      return;
    }
    if (isTraineeUser()) state.selectedTraineeId = D.CURRENT_USER_ID;   // FT_9: стажёр видит только себя
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    centerEl().innerHTML = t ? renderTraineeCard(t) : renderSummary();
    if (!t && state.summaryFocus) {
      state.summaryFocus = false;
      var cur = el('centerZone').querySelector('.summary-row.selected');
      if (cur) cur.focus();
    }
    Array.prototype.forEach.call(centerEl().querySelectorAll('[data-indeterminate]'), function (x) { x.indeterminate = true; });
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
        '<span' + a1c('Надпись', 'ТаблицаСтажеровТребуетДействия') + '>' + esc(n.text) + '</span></div>' +
      (list.length > 1 ? '<div class="muted text-s action-more"' + a1c('Надпись', 'ТаблицаСтажеровЕщеУведомлений') + ' title="' +
        esc(list.slice(1).map(function (x) { return x.text; }).join('; ')) + '">ещё ' +
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
          '<div class="muted text-s"' + a1c('Надпись', 'ТаблицаСтажеровДолжность') + '>' + esc(formatPosition(t)) + '</div></td>' +
        '<td><div title="' + esc(deptPath(t)) + '"' + a1c('Надпись', 'ТаблицаСтажеровПодразделение') + '>' + esc(d) + '</div></td>' +
        '<td>' + stageBadge(t, 'ТаблицаСтажеровЭтап') + '</td>' +
        '<td>' + actionCell(t) + '</td>' +
        '<td>' + tasksCell(t) + '</td>' +
        '<td class="nowrap">' + dateCell(t) + '</td>' +
        '</tr>';
    }).join('');

    var total = myTrainees().length;
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
  function isClosed(t) { return t.stage === 'closed'; }

  function renderTraineeCard(t) {
    // Крупные блоки через 16px (фаза 9, раздел 4.1): «← Все стажёры» с ⋮ ?, карточка, уведомления, вкладки
    return '<div class="col gap-4 trainee-card"' + a1c('ГруппаВертикальная', 'ГруппаКарточкаСтажера') + '>' +
      '<div class="row back-row"' + a1c('ГруппаГоризонтальная', 'ГруппаНавигацияСтажера') + '>' +
        (isTraineeUser() || activeDoc() ? '' : link('← Все стажёры', { action: 'backToList', name: 'ГиперссылкаВсеСтажеры' })) +   // FT_9: стажёр списка стажёров не видит; FT_11: в отдельном окне списка нет
        '<span class="grow"></span>' + renderTraineeMenu(t) + '</div>' +
      renderHeader(t) +
      renderAnalytics(t) +
      renderTraineePages(t) +
      '</div>';
  }

  function personLink(t, role) {
    var id = role === 'mentor' ? t.mentorId : t.headId;
    var u = user(id);
    var name = role === 'mentor' ? 'ГиперссылкаНаставник' : 'ГиперссылкаРуководительСтажировки';
    if (isClosed(t) || isTraineeUser()) return '<span' + a1c('Надпись', name) + '>' + esc(u.fullName) + '</span>';   // FT_9: у стажёра — без ссылок
    return link(u.fullName, {
      action: 'openDialog', data: { dialog: role === 'mentor' ? 'changeMentor' : 'changeHead' },
      title: role === 'mentor' ? 'Сменить наставника' : 'Сменить руководителя стажировки', name: name
    });
  }

  // Должность и квалификационный уровень (фаза 11, 4.2): «Аналитик, А2»; недопустимый уровень — только должность и предупреждение в консоль
  function formatPosition(t) {
    if (!t.positionFamily || !t.qualificationLevel) return t.position;
    var allowed = D.QUALIFICATION_LEVELS[t.positionFamily] || [];
    if (allowed.indexOf(t.qualificationLevel) < 0) {
      if (window.console) console.warn('Недопустимый квалификационный уровень «' + t.qualificationLevel + '» для семейства «' + t.positionFamily + '» у стажёра ' + t.fullName);
      return t.position;
    }
    return t.position + ', ' + t.qualificationLevel;
  }

  // Карточка стажёра (фаза 11, 4.1): аватар и ФИО | наставник | руководитель | даты; части разделены вертикальными линиями, кнопок нет
  function renderHeader(t) {
    // Строки дат: календарь — «Даты стажировки»; часы — строка по этапу; при отставании — третья строка цветом warning
    var line2 = '';
    var line3 = '';
    if (isClosed(t)) {
      var result = t.closeKind === 'passed' ? 'Результат: пройдена' : t.closeKind === 'failed' ? 'Результат: не пройдена' : '';
      line2 = '<span' + (result ? ' title="' + result + '"' : '') + a1c('Надпись', 'ДекорацияСтажировкаЗакрыта') + '>' +
        (t.closeKind === 'cancelled' ? 'Стажировка отменена ' : 'Стажировка закрыта ') + fmtDate(t.closedAt) + '</span>';
    } else if (t.stage === 'found' || daysToStart(t) > 0) {
      var ds = daysToStart(t);
      line2 = '<span class="bold"' + a1c('Надпись', 'ДекорацияВыходЧерез') + '>' +
        (ds > 0 ? 'Выход через ' + pluralN(ds, W_DAYS) : ds === 0 ? 'Выход сегодня' : 'Стажёр вышел ' + fmtDate(t.startDate)) + '</span>';
    } else {
      var de = daysToEnd(t);
      line2 = '<span' + a1c('Надпись', 'ДекорацияДоЗакрытия') + ' title="' + esc('день ' + dayNo(t) + ' из ' + totalDays(t)) + '">' +
        (de >= 0 ? 'До закрытия: ' + pluralN(de, W_DAYS) : 'Срок окончания прошёл ' + fmtDate(t.endDate)) + '</span>';
      if (lag(t)) line3 = '<div class="tcard-line tcard-indent c-warning"' + a1c('Надпись', 'ДекорацияОтклонениеОтГрафика') + '>Задачи отстают от графика</div>';
    }
    var dep = dept(t.departmentId);

    // Рамка со скруглением у группы формы — data-1c-risk="check" (фаза 11, 8)
    return '<div class="panel tcard"' + a1c('ГруппаГоризонтальная', 'ГруппаКарточкаСтажераШапка', 'check') + '>' +
      // 1. Аватар; ФИО, подразделение, должность с уровнем
      '<div class="row gap-3 tcard-part tcard-who"' + a1c('ГруппаГоризонтальная', 'ГруппаСтажер') + '>' +
        '<div class="avatar"' + a1c('Картинка', 'КартинкаАватар', 'check') + ' title="' + esc(t.fullName) + '">' + esc(initials(t.fullName)) + '</div>' +
        '<div class="col gap-0 tcard-who-text"' + a1c('ГруппаВертикальная', 'ГруппаФИО') + '>' +
          '<div class="bold tcard-name"' + a1c('Надпись', 'ДекорацияФИО') + '>' + esc(t.fullName) + '</div>' +
          '<div class="tcard-line tcard-dept">' + (isTraineeUser() ? '<span class="tcard-dept-text" title="' + esc(dep ? dep.name : '') + '"' + a1c('Надпись', 'ГиперссылкаПодразделение') + '>' + esc(dep ? dep.name : '') + '</span>'
            : link(dep ? dep.name : '', { action: 'openDeptCard', title: 'Открыть карточку подразделения «' + (dep ? dep.name : '') + '»', name: 'ГиперссылкаПодразделение' })) + '</div>' +
          '<div class="muted tcard-line"' + a1c('Надпись', 'ДекорацияДолжность') + '>' + esc(formatPosition(t)) + '</div>' +
        '</div>' +
      '</div>' +
      // 2–3. Наставник и руководитель: подпись серым сверху, ФИО полностью снизу
      '<div class="col gap-0 tcard-part tcard-person"' + a1c('ГруппаВертикальная', 'ГруппаНаставник') + '>' +
        '<span class="muted"' + a1c('Надпись', 'ДекорацияПодписьНаставник') + '>Наставник</span>' + personLink(t, 'mentor') + '</div>' +
      '<div class="col gap-0 tcard-part tcard-person"' + a1c('ГруппаВертикальная', 'ГруппаРуководитель') + '>' +
        '<span class="muted"' + a1c('Надпись', 'ДекорацияПодписьРуководитель') + '>Руководитель</span>' + personLink(t, 'head') + '</div>' +
      // 4. Даты
      '<div class="col gap-0 tcard-part tcard-dates"' + a1c('ГруппаВертикальная', 'ГруппаСроки') + '>' +
        '<div class="row tcard-line tcard-term"><span class="tcard-ico"' + a1c('Картинка', 'КартинкаДатыСтажировки') + '>' + icon('calendar') + '</span>' +
          '<span class="muted"' + a1c('Надпись', 'ДекорацияЗаголовокДаты') + '>Даты стажировки</span>' +
          '<span' + a1c('Надпись', 'ДекорацияДатыСтажировки') + '>' + fmtDate(t.startDate) + ' – ' + fmtDate(t.endDate) + '</span></div>' +
        '<div class="row tcard-line tcard-term"' + a1c('ГруппаГоризонтальная', 'ГруппаСрок') + '><span class="tcard-ico"' + a1c('Картинка', 'КартинкаСрок') + '>' + icon('clock') + '</span>' + line2 + '</div>' +
        line3 +
      '</div>' +
      '</div>';
  }


  // Вкладка «Закрытие стажировки» (фаза 10, 5.1) — на этапах «Закрытие» и «Закрыта»
  function hasClosureTab(t) { return t.stage === 'closing' || t.stage === 'closed'; }

  // Меню ⋮ и справка ? — справа в строке «← Все стажёры» (фаза 10, 2.1)
  function renderTraineeMenu(t) {
    var program = programOf(t);
    var menuItems = [];
    if (program) {
      menuItems.push(menuItem('История изменений АП', 'openDialog', { dialog: 'history' }, 'КнопкаИсторияИзмененийАП'));
      menuItems.push(menuItem('Открыть документ АП', 'openProgramDoc', null, 'КнопкаОткрытьДокументАП'));
    }
    if (!isClosed(t)) {
      if (menuItems.length) menuItems.push('<div class="menu-sep"></div>');
      menuItems.push(menuItem('Отменить стажировку', 'openDialog', { dialog: 'cancel' }, 'КнопкаОтменитьСтажировку', 'danger-text'));
    }
    if (isTraineeUser()) menuItems = [];   // FT_9: у стажёра меню ⋮ нет
    return '<div class="row command-bar trainee-actions"' + a1c('КоманднаяПанель', 'КоманднаяПанельСтажировки') + '>' +
      (menuItems.length ? submenu('traineeMore', 'ПодменюЕщеСтажировка', menuItems) : '') +
      (activeDoc() ? '' : button('', { cls: 'btn-icon' + (state.helpOpen ? ' pressed' : ''), icon: 'help', action: 'toggleHelp',
        title: state.helpOpen ? 'Скрыть справку' : 'Показать справку', name: 'КнопкаСправка' })) +   // FT_11: справка — только в окне «Начало»
      '</div>';
  }

  // Блок «Аналитика по адаптационной программе» (фаза 10, раздел 3): сворачиваемая группа без рамки и фона.
  // N — все уведомления стажёра с кнопкой, без учёта вкладки и фильтров; при N = 0 блока нет. По умолчанию свёрнут,
  // состояние общее для всех стажёров до перезагрузки. Все кнопки обычные; кнопка уведомления, ведущего в текущий вид, скрыта (3.3).
  // В 1С — обычная группа с Поведение = Свертываемая, заголовок с числом задаётся кодом; строки — заранее созданные слоты.
  // Кнопки действий блока аналитики по стадии (фаза 11, 5.3); main — кандидаты в основную (первая показанная из них — основная)
  function analyticsActions(t) {
    var list = [];
    var s = t.stage;
    if (s === 'closed') return list;
    if (!programOf(t)) list.push({ text: 'Создать АП', main: true, action: 'createProgram', name: 'КнопкаСоздатьАП' });
    if (programOf(t) && canSendToApproval(t)) list.push({ text: 'Отправить на согласование', main: true, action: 'openDialog', data: { dialog: 'sendToApproval' }, name: 'КнопкаОтправитьНаСогласование' });
    if (closeSoon(t)) list.push({ text: 'Начать закрытие стажировки', main: true, action: 'openDialog', data: { dialog: 'startClosing' }, name: 'КнопкаНачатьЗакрытиеСтажировки' });
    // FT_8, п. 5: лист согласования — на согласовании и после возврата на доработку (только просмотр прошлого маршрута)
    if (s === 'approval' || (s === 'draft' && programOf(t) && programOf(t).approval)) list.push({ text: 'Открыть лист согласования', action: 'openApprovalSheet', name: 'КнопкаОткрытьЛистСогласования' });
    if (s === 'active' || s === 'closing') {
      list.push({ text: 'Продлить стажировку', action: 'openDialog', data: { dialog: 'extend' }, name: 'КнопкаПродлитьСтажировку' });
      list.push({ text: 'Отменить стажировку', cls: 'btn-danger-text', action: 'openDialog', data: { dialog: 'cancel' }, name: 'КнопкаАналитикиОтменитьСтажировку' });
    }
    var primary = list.filter(function (x) { return x.main; })[0];
    if (primary) primary.primary = true;
    return list;
  }

  // Блок «Аналитика по адаптационной программе» (фаза 11, 5.1; FT_8: без иконки в заголовке, у строк — только цветные кружки):
  // рамка и заливка — по самому критичному замечанию,
  // кнопки действий — в строке заголовка (видны и в свёрнутом блоке); у строк замечаний кнопок нет
  function renderAnalytics(t) {
    var list = getNotifications(t);
    var acts = analyticsActions(t);
    // FT_9: стажёр видит только просрочку по задачам, кнопок нет
    if (isTraineeUser()) { list = list.filter(function (n) { return n.id === 'tasks_overdue'; }); acts = []; }
    if (!list.length && !acts.length) return '';
    var n = list.length;
    var sev = n ? list[0].severity : 'none';
    var open = state.analyticsOpen && n > 0;
    var title = '<span class="analytics-title"' + a1c('Надпись', 'ДекорацияЗаголовокАналитики') + '>Аналитика по адаптационной программе (' + n + ')</span>';
    var head = n
      ? '<button type="button" class="analytics-head" data-action="toggleAnalytics" aria-expanded="' + open + '"' +
          ' title="' + (open ? 'Свернуть' : 'Развернуть') + '"' + a1c('ЗаголовокГруппы', 'ГруппаАналитикаЗаголовок') + '>' +
          '<span class="analytics-arrow">' + icon(open ? 'chevronDown' : 'chevronRight') + '</span>' + title + '</button>'
      : '<div class="analytics-head"' + a1c('ЗаголовокГруппы', 'ГруппаАналитикаЗаголовок') + '>' + title + '</div>';
    function row(x, i) {
      var k = i + 1;
      return '<div class="row analytics-row"' + a1c('ГруппаГоризонтальная', 'ГруппаСтрокаАналитики' + k) + '>' +
        '<span class="analytics-row-icon c-' + x.severity + '"' + a1c('Картинка', 'КартинкаАналитики' + k) + '>' + icon('dot') + '</span>' +
        '<span class="analytics-row-text"' + a1c('Надпись', 'ДекорацияАналитики' + k) + '>' + esc(x.text) + '</span>' +
        '</div>';
    }
    return '<div class="col analytics sev-' + sev + (open ? ' open' : '') + '"' + a1c('ГруппаВертикальная', 'ГруппаАналитика', 'check') + '>' +
      '<div class="row analytics-top"' + a1c('ГруппаГоризонтальная', 'ГруппаАналитикаСтрокаЗаголовка') + '>' + head +
        '<span class="grow"></span>' +
        (acts.length ? '<div class="row analytics-actions"' + a1c('ГруппаГоризонтальная', 'ГруппаДействияАналитики') + '>' +
          acts.map(function (x) { return button(x.text, { cls: (x.primary ? 'btn-primary' : '') + (x.cls ? ' ' + x.cls : ''), action: x.action, data: x.data, name: x.name }); }).join('') +
        '</div>' : '') +
      '</div>' +
      (open ? '<div class="col gap-0 analytics-list"' + a1c('ГруппаВертикальная', 'ГруппаСписокАналитики') + '>' + list.map(row).join('') + '</div>' : '') +
      '</div>';
  }

  // Пункт подменю, недоступный с причиной в подсказке
  function menuItemIf(text, action, data, name, reason) {
    var attrs = '';
    if (data) for (var k in data) attrs += ' data-' + k + '="' + esc(data[k]) + '"';
    return '<button type="button" data-action="' + action + '"' + attrs + (reason ? ' disabled title="' + esc(reason) + '"' : '') + a1c('Кнопка', name) + '>' + esc(text) + '</button>';
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
    var r = (m.parentNode.querySelector('[data-action="toggleMenu"]') || m.parentNode.querySelector('button')).getBoundingClientRect();
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
      { id: 'prepare', text: 'Подготовка к выходу ' + cl.text, name: 'СтраницаПодготовкаКВыходу', pic: cl.pic, done: prepCompleted(t) },
      { id: 'program', text: 'Адаптационная программа', name: 'СтраницаАдаптационнаяПрограмма' }
    ];
    // Третья вкладка — «Закрытие стажировки X/Y» на этапах «Закрытие» и «Закрыта» (фаза 10, 5.1, 5.3)
    if (hasClosureTab(t)) {
      var cs = closureSummary(t);
      tabs.push({ id: 'closure', text: 'Закрытие стажировки' + (cs.text ? ' ' + cs.text : ''), name: 'СтраницаЗакрытие', pic: cs.pic });
    }
    if (isTraineeUser()) { tabs = [tabs[1]]; state.traineeTab = 'program'; }   // FT_9: стажёр чек-листы подготовки и закрытия не видит
    if (state.traineeTab === 'closure' && !hasClosureTab(t)) state.traineeTab = 'program';
    // Фаза 11, 6.2: при открытии вкладки АП (переход на неё или выбор стажёра) обе группы блоков свёрнуты
    if (state.traineeTab !== 'program') state.programViewOf = null;
    else if (state.programViewOf !== t.id && programOf(t)) {
      state.programViewOf = t.id;
      state.collapsedBlocks = {};
      BLOCKS.forEach(function (b) { state.collapsedBlocks[b.id] = true; });
    }
    var body;
    if (state.traineeTab === 'program') {
      body = renderProgramTab(t);
    } else if (state.traineeTab === 'closure') {
      body = renderClosureTab(t);
    } else {
      body = renderPrepareTab(t);
    }
    return '<div class="col gap-4"' + a1c('Страницы', 'СтраницыСтажера') + '>' +
      '<div class="tabs">' + tabs.map(function (x) {
        // Цветной текст в заголовке страницы в 1С не штатный — статус передаётся картинкой страницы
        var pic = x.pic ? '<span class="tab-pic ' + x.pic.cls + '" title="' + esc(x.pic.title) + '"' +
          a1c('Картинка', x.id === 'closure' ? 'КартинкаСтраницыЗакрытие' : 'КартинкаСтраницыПодготовка', 'check') + '>' + icon(x.pic.icon) + '</span>' : '';
        // завершённая подготовка — название серым и на активной вкладке (фаза 10, 4.2)
        return '<button type="button" class="tab' + (state.traineeTab === x.id ? ' active' : '') + (x.done ? ' tab-done' : '') + '" data-tab="' + x.id + '" data-action="traineeTab"' +
          (x.pic ? ' title="' + esc(x.pic.title) + '"' : '') + a1c('Страница', x.name) + '>' + pic + esc(x.text) + '</button>';
      }).join('') + '</div>' + body + '</div>';
  }


  /* ---------------------------------------------------------------------
   * Вкладка «Адаптационная программа» (раздел 7.5)
   * --------------------------------------------------------------------- */

  var STATUS_META = {
    overdue:     { text: 'Просрочена', tone: 'danger',  order: 0 },
    in_progress: { text: 'В работе',   tone: 'info',    order: 1 },
    review:      { text: 'На проверке', tone: 'warning', order: 2 },   // FT_10
    not_started: { text: 'Не начата',  tone: 'neutral', order: 3 },
    done:        { text: 'Выполнена',  tone: 'success', order: 4 }
  };
  var BLOCKS = [
    { id: 'corp', title: 'Корпоративный блок', short: 'Корпоративный', name: 'Корпоративный' },
    { id: 'spec', title: 'Специальный блок',   short: 'Специальный',   name: 'Специальный' }
  ];
  // Вариант тумблера статусов → статус задачи
  var FILTER_STATUS = { done: 'done', progress: 'in_progress', review: 'review', overdue: 'overdue', todo: 'not_started' };

  function blockMeta(id) { return id === 'spec' ? BLOCKS[1] : BLOCKS[0]; }
  function trunc(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; }

  // Причина, по которой задачи АП менять нельзя (раздел 7.5.4); null — можно
  function editLock(t) {
    if (t.stage === 'approval') return 'АП на согласовании — изменения недоступны до окончания согласования';
    if (t.stage === 'closed') return 'Стажировка закрыта — АП доступна только для просмотра';
    return null;
  }
  // Изменение АП: запись в историю (FT_8: изменения согласованной АП повторного согласования не требуют)
  function programChanged(t, action) {
    addHistory(programOf(t), action);
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
  // Проверяющего и наблюдателей по умолчанию нет (FT_6): у задачи — только свои значения.
  // Ответственный за подразделение — ближайший заданный вверх по иерархии
  function deptResponsible(deptId) {
    var d = dept(deptId);
    while (d && !d.responsibleId) d = d.parentId ? dept(d.parentId) : null;
    return d ? d.responsibleId : null;
  }
  // Наблюдатели новой задачи: руководитель стажировки, наставник, HR-менеджер, ответственный за подразделение
  function newTaskObservers(t) {
    var list = [];
    [t.headId, t.mentorId, t.hrId, deptResponsible(t.departmentId)].forEach(function (id) { if (id && list.indexOf(id) < 0) list.push(id); });
    return list;
  }

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
    { f: 'review', text: 'На проверке', name: 'НаПроверке' },   // FT_10
    { f: 'todo', text: 'Не начато', name: 'НеНачато' },
    { f: 'done', text: 'Выполнено', name: 'Выполнено' }
  ];
  function syncTaskFilter(all) {
    var f = state.taskFilter;
    if (f && !all.some(function (x) { return taskMatchesFilter(x, f); })) state.taskFilter = null;
  }

  function renderProgramTab(t) {
    var program = programOf(t);
    if (!program && isTraineeUser()) return '<div class="empty"' + a1c('Надпись', 'ДекорацияАПЕщеНеСоздана') + '>Адаптационная программа ещё не создана</div>';
    if (!program) return renderProgramEmpty(t);
    var all = tasksOf(program);
    var lock = isTraineeUser() ? null : editLock(t);   // FT_9: у стажёра строки запрета нет — изменения ему недоступны в принципе
    syncTaskFilter(all);
    return '<div class="col gap-2"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаАП') + '>' +
      // Запрет редактирования — строка без заливки (фаза 9, 4.x): иконка и серый текст
      (lock ? '<div class="row lock-note"' + a1c('ГруппаГоризонтальная', 'ГруппаЗапретРедактирования') + '>' +
        '<span class="note-icon c-info">' + icon('info') + '</span><span class="muted"' + a1c('Надпись', 'ДекорацияЗапретРедактирования') + '>' + esc(lock) + '</span></div>' : '') +
      renderTaskCommandBar(t, all) +
      renderTaskTable(t, all) +
      '</div>';
  }


  // Фаза 11, 6.1: строка кнопок («Добавить ▾», «Печать АП», справа — действия с выбранными), под ней отдельной строкой — тумблер статусов
  function renderTaskCommandBar(t, all) {
    var lock = editLock(t);
    var trainee_ = isTraineeUser();   // FT_9: у стажёра — только тумблер статусов
    var sel = selectedTaskIds(t).length;
    var allCorp = sel > 0 && selectedTaskIds(t).every(function (id) { return corpLocked(taskById(id)); });   // FT_8, п. 4
    var items = [{ value: 'all', text: 'Все ' + all.length, name: 'Все' }].concat(STATUS_VARIANTS.map(function (v) {
      var n = all.filter(function (x) { return taskMatchesFilter(x, v.f); }).length;
      return n ? { value: v.f, text: v.text + ' ' + n, name: v.name, cls: v.cls, risk: v.risk } : null;
    }).filter(Boolean));
    return (trainee_ ? '' : '<div class="row wrap command-bar command-bar-flat task-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельЗадач') + '>' +
      (isClosed(t) ? '' : submenu('addTask', 'ПодменюДобавитьЗадачу', [
        menuItem('Новая задача', 'openDialog', { dialog: 'task' }, 'КнопкаНоваяЗадача'),
        menuItem('Из шаблона…', 'openDialog', { dialog: 'addFromTemplate' }, 'КнопкаДобавитьИзШаблона')
      ], { text: 'Добавить ▾', icon: 'plus', disabled: !!lock, title: lock || '' })) +  // закрытая — только просмотр (фаза 10, 5.4)
      button('Печать АП', { icon: 'print', action: 'printProgram', name: 'КнопкаПечатьАП' }) +
      '<span class="grow"></span>' +
      (sel ? '<span class="row gap-3"' + a1c('ГруппаГоризонтальная', 'ГруппаВыбранныеЗадачи') + '>' +
          '<span' + a1c('Надпись', 'ДекорацияВыбраноЗадач') + '>Выбрано: ' + sel + '</span>' +
          submenu('massActions', 'ПодменюДействияСВыбранными', [
            menuItemIf('Назначить проверяющего', 'openDialog', { dialog: 'massReviewer' }, 'КнопкаНазначитьПроверяющего', allCorp ? CORP_LOCK_TEXT : ''),
            menuItem('Наблюдатели', 'openDialog', { dialog: 'massObservers' }, 'КнопкаНаблюдатели'),
            menuItemIf('Перенести срок', 'openDialog', { dialog: 'massDeadline' }, 'КнопкаПеренестиСрок', allCorp ? CORP_LOCK_TEXT : ''),
            '<div class="menu-sep"></div>',
            menuItem('Удалить', 'openDialog', { dialog: 'deleteTasks' }, 'КнопкаУдалитьЗадачи', 'danger-text')
          ], { text: 'Действия с выбранными ▾' }) +
          link('Снять выделение', { action: 'clearTaskSelection', name: 'ГиперссылкаСнятьВыделение' }) +
        '</span>' : '') +
      '</div>') +
      '<div class="row toggle-row"' + a1c('ГруппаГоризонтальная', 'ГруппаТумблерСтатусовЗадач') + '>' +
        toggle('ТумблерСтатусЗадач', 'taskFilter', items, state.taskFilter || 'all') +
      '</div>';
  }
  // FT_8, п. 3: «Отправить на согласование» — только АП, которая ещё ни разу не отправлялась, или возвращённая на доработку (этап «Черновик АП»)
  function canSendToApproval(t) { return t.stage === 'draft'; }

  // Таблица задач (8.4, 5.3–5.4): всегда сгруппирована по блокам
  function renderTaskTable(t, all) {
    var program = programOf(t);
    var lock = editLock(t);
    var selectable = !lock && !isTraineeUser();
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
        '<th>Проверяющий</th><th>Наблюдатели</th><th>Результат</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // Строка задачи: проверяющий и наблюдатели задачи
  function taskRow(t, program, x, selectable) {
    var v = viewStatus(x);
    var sm = STATUS_META[v];
    var selected = !!state.selectedTasks[x.id];
    var late = v === 'overdue' ? diffDays(x.deadline, D.TODAY) : 0;
    // Проверяющий и наблюдатели задачи (FT_6: умолчаний нет — пусто, если не назначены)
    var rev = x.reviewerId ? '<span title="' + esc(userName(x.reviewerId)) + '">' + esc(userName(x.reviewerId)) + '</span>' : '';
    var obs = x.observerIds.length ? '<span title="' + esc(namesOf(x.observerIds)) + '">' + esc(namesBrief(x.observerIds, 1)) + '</span>' : '';
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
      '<td>' + (isTraineeUser() ? '' : taskRowMenu(t, x)) + '</td>' +
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
      item('Назначить проверяющего', 'openDialog', { dialog: 'massReviewer', task: x.id }, 'КонтекстноеМенюЗадачиНазначитьПроверяющего', lock || (corpLocked(x) ? CORP_LOCK_TEXT : '')),
      item('Перенести срок', 'openDialog', { dialog: 'massDeadline', task: x.id }, 'КонтекстноеМенюЗадачиПеренестиСрок', lock || (corpLocked(x) ? CORP_LOCK_TEXT : '')),
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
        '<div' + a1c('Надпись', 'ДекорацияСоздание' + name) + '>' + esc(title) + '</div>' +
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
      history: []
    };
    D.programs.push(program);
    taskSpecs.forEach(function (s) { D.tasks.push(newTask(program, withObservers(t, s))); });
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
  // FT_8, п. 4: реквизиты задач корпоративного блока меняет только HR-менеджер; руководитель — только наблюдателей.
  // Добавить задачу в корпоративный блок можно только из шаблона (новая задача и перенос из спец. блока — нельзя)
  var CORP_LOCK_TEXT = 'Реквизиты задач корпоративного блока изменяет только HR-менеджер';
  function isHR() { return D.HR_IDS.indexOf(D.CURRENT_USER_ID) >= 0; }
  function corpLocked(x) { return !!x && x.block === 'corp' && !isHR(); }
  function withObservers(t, s) { s.observerIds = newTaskObservers(t); return s; }
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

  // Подготовка завершена: все пункты выполнены и стажёр получил задачи — вкладка только для просмотра (фаза 10, раздел 4).
  // Разблокировки нет (открытый вопрос 2). В 1С — ТолькоПросмотр у таблицы и видимость командной панели.
  function prepCompleted(t) {
    var all = checklistOf(t);
    return all.length > 0 && all.every(function (c) { return c.done; }) && ['active', 'closing', 'closed'].indexOf(t.stage) >= 0;
  }
  function prepCompletedAt(t) {
    return checklistOf(t).reduce(function (m, c) { return c.doneAt && c.doneAt > m ? c.doneAt : m; }, '');
  }
  function checklistLock(t) {
    if (prepCompleted(t)) return 'Подготовка завершена ' + fmtDate(prepCompletedAt(t)) + '. Изменения недоступны.';
    return isClosed(t) ? 'Стажировка закрыта — чек-лист доступен только для просмотра' : null;
  }
  function offsetText(n) {
    if (n < 0) return 'за ' + (-n) + ' дн. до выхода';
    if (n === 0) return 'в день выхода';
    return 'через ' + n + ' дн. после выхода';
  }
  function requestKind(c) { return c.name.indexOf('пропуск') >= 0 ? 'выпуск пропуска' : 'создание учётной записи'; }

  // Список всегда отсортирован по сроку по возрастанию, при равенстве — по порядку в данных (фаза 9, 6.1)
  function visibleChecklist(t) {
    var all = checklistOf(t);
    return all.filter(function (c) { return state.checklistMode === 'all' || c.responsibleId === D.CURRENT_USER_ID; })
      .sort(function (a, b) {
        var x = checklistDate(a), y = checklistDate(b);
        return x < y ? -1 : x > y ? 1 : all.indexOf(a) - all.indexOf(b);
      });
  }

  // Вкладка «Подготовка к выходу» (фаза 9, раздел 6): командная панель и таблица из пяти колонок
  function renderPrepareTab(t) {
    var lock = checklistLock(t);
    var list = visibleChecklist(t);

    // Только просмотр: строка с замком, кнопки изменения скрыты; тумблер «Все | Мои» остаётся — он не меняет данных
    var lockRow = lock ? '<div class="row lock-note"' + a1c('ГруппаГоризонтальная', 'ГруппаЗапретИзмененияПодготовки') + '>' +
      '<span class="note-icon muted"' + a1c('Картинка', 'КартинкаЗапретИзмененияПодготовки') + '>' + icon('lock') + '</span>' +
      '<span class="muted"' + a1c('Надпись', 'ДекорацияЗапретИзмененияПодготовки') + '>' + esc(lock) + '</span></div>' : '';
    // Фаза 11, 7.1: строка кнопок, под ней — тумблер «Все | Мои»
    var bar = (lock ? '' : '<div class="row wrap command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельЧекЛиста') + '>' +
        button('Добавить пункт', { icon: 'plus', action: 'openDialog', data: { dialog: 'checklistItem' }, name: 'КнопкаДобавитьПункт' }) +
        button('Заполнить по шаблону', { action: 'openDialog', data: { dialog: 'checklistFill' }, name: 'КнопкаЗаполнитьПоШаблону' }) +
      '</div>') +
      '<div class="row toggle-row"' + a1c('ГруппаГоризонтальная', 'ГруппаТумблерМоиПункты') + '>' +
      toggle('ТумблерМоиПункты', 'clMode', [
        { value: 'all', text: 'Все', name: 'Все' },
        { value: 'mine', text: 'Мои', name: 'Мои' }
      ], state.checklistMode) +
      '</div>';

    var body;
    if (!list.length) {
      body = '<tr><td colspan="6"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаЧекЛистПуст') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияЧекЛистПуст') + '>У вас нет пунктов в чек-листе</span>' +
        link('Показать все', { action: 'clMode', data: { value: 'all' }, name: 'ГиперссылкаПоказатьВсеПункты' }) +
        '</div></td></tr>';
    } else {
      body = list.map(function (c) { return checklistRow(t, c, lock); }).join('');
    }

    var table = '<div class="table-box"><table class="grid checklist-table"' + a1c('ТаблицаФормы', 'ТаблицаЧекЛистПодготовки') + '>' +
      '<colgroup><col class="w-check"><col><col class="w-resp"><col class="w-date"><col class="w-fact"><col class="w-action"></colgroup>' +
      '<thead><tr><th title="Выполнено"></th><th>Пункт</th><th>Ответственный</th><th>Срок</th><th>Дата выполнения (факт)</th><th>Действие</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';

    return '<div class="col gap-2"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаПодготовка') + '>' + lockRow + bar + table + '</div>';
  }

  /* ---------------------------------------------------------------------
   * Вкладка «Закрытие стажировки» (фаза 10, раздел 5)
   * --------------------------------------------------------------------- */

  // Название «Закрытие стажировки X/Y»: Y — обязательные пункты, X — выполненные обязательные.
  // Картинка страницы: все обязательные выполнены — галочка; есть просроченные — «!»; иначе нет
  function closureSummary(t) {
    var all = closureOf(t);
    if (!all.length) return { text: '', pic: null };
    var req = closureRequired(t);
    var done = req.filter(function (c) { return c.done; }).length;
    var over = all.filter(closureOverdue).length;
    var pic = req.length && done === req.length ? { icon: 'check', cls: 'c-success', title: 'Все обязательные пункты закрытия выполнены' }
      : over ? { icon: 'alert', cls: 'c-danger', title: 'Просрочено пунктов закрытия: ' + over } : null;
    return { text: done + '/' + req.length, pic: pic };
  }
  function closureLock(t) {
    if (!isClosed(t)) return null;
    return (t.closeKind === 'cancelled' ? 'Стажировка отменена ' : 'Стажировка завершена ') + fmtDate(t.closedAt) + '. Изменения недоступны.';
  }
  // Имя ответственного или исполнителя: сотрудник или сам стажёр (роль «Стажёр»)
  function personById(id) { var u = user(id); if (u) return u.fullName; var tr = trainee(id); return tr ? tr.fullName : '—'; }
  function closureOffsetText(n) {
    if (n < 0) return 'за ' + (-n) + ' дн. до окончания';
    if (n === 0) return 'в день окончания';
    return 'через ' + n + ' дн. после окончания';
  }
  function visibleClosure(t) {
    var all = closureOf(t);
    return all.filter(function (c) { return state.closureMode === 'all' || c.responsibleId === D.CURRENT_USER_ID; })
      .sort(function (a, b) {
        var x = closureDate(a), y = closureDate(b);
        return x < y ? -1 : x > y ? 1 : all.indexOf(a) - all.indexOf(b);
      });
  }

  function renderClosureTab(t) {
    var lock = closureLock(t);
    var list = visibleClosure(t);
    var left = closureLeft(t);
    var lockRow = lock ? '<div class="row lock-note"' + a1c('ГруппаГоризонтальная', 'ГруппаЗапретИзмененияЗакрытия') + '>' +
      '<span class="note-icon muted"' + a1c('Картинка', 'КартинкаЗапретИзмененияЗакрытия') + '>' + icon('lock') + '</span>' +
      '<span class="muted"' + a1c('Надпись', 'ДекорацияЗапретИзмененияЗакрытия') + '>' + esc(lock) + '</span></div>' : '';
    // Фаза 11, 7.1: [+ Добавить пункт] … «Осталось обязательных пунктов: N» [Завершить стажировку] — основная; под строкой — тумблер «Все | Мои»
    var bar = (lock ? '' : '<div class="row wrap command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельЧекЛистаЗакрытия') + '>' +
        button('Добавить пункт', { icon: 'plus', action: 'openDialog', data: { dialog: 'closureItem' }, name: 'КнопкаДобавитьПунктЗакрытия' }) +
        '<span class="grow"></span>' +
        '<span class="row gap-2"' + a1c('ГруппаГоризонтальная', 'ГруппаЗавершение') + '>' +
          (left ? '<span class="muted"' + a1c('Надпись', 'ДекорацияОсталосьОбязательных') + '>Осталось обязательных пунктов: ' + left + '</span>' : '') +
          button('Завершить стажировку', { cls: 'btn-primary', action: 'openDialog', data: { dialog: 'close' }, disabled: left > 0,
            title: left ? 'Сначала выполните обязательные пункты закрытия' : '', name: 'КнопкаЗавершитьСтажировку' }) +
        '</span>' +
      '</div>') +
      '<div class="row toggle-row"' + a1c('ГруппаГоризонтальная', 'ГруппаТумблерМоиПунктыЗакрытия') + '>' +
      toggle('ТумблерМоиПунктыЗакрытия', 'ccMode', [
        { value: 'all', text: 'Все', name: 'Все' },
        { value: 'mine', text: 'Мои', name: 'Мои' }
      ], state.closureMode) +
      '</div>';

    var body;
    if (!closureOf(t).length) {
      body = '<tr><td colspan="6"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаЧекЛистЗакрытияПуст') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияЧекЛистЗакрытияНеФормировался') + '>Чек-лист закрытия не формировался</span></div></td></tr>';
    } else if (!list.length) {
      body = '<tr><td colspan="6"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаЧекЛистЗакрытияМоиПуст') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияЧекЛистЗакрытияМоиПуст') + '>У вас нет пунктов закрытия</span>' +
        link('Показать все', { action: 'ccMode', data: { value: 'all' }, name: 'ГиперссылкаПоказатьВсеПунктыЗакрытия' }) + '</div></td></tr>';
    } else {
      body = list.map(function (c) { return closureRow(t, c, lock); }).join('');
    }
    var table = '<div class="table-box"><table class="grid checklist-table"' + a1c('ТаблицаФормы', 'ТаблицаЧекЛистЗакрытия') + '>' +
      '<colgroup><col class="w-check"><col><col class="w-resp"><col class="w-date"><col class="w-fact"><col class="w-action"></colgroup>' +
      '<thead><tr><th title="Выполнено"></th><th>Пункт</th><th>Ответственный</th><th>Срок</th><th>Дата выполнения (факт)</th><th>Действие</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
    return '<div class="col gap-2"' + a1c('ГруппаВертикальная', 'ГруппаСтраницаЗакрытие') + '>' + lockRow + bar + table + '</div>';
  }

  // Ответственный (фаза 11, 7.2): только ФИО; если выполнил другой человек — второй строкой серым «Выполнил: ФИО»
  function whoCell(doneBy, responsibleId, done, prefix, byName) {
    return '<td><div class="ellipsis" title="' + esc(byName(responsibleId)) + '"' + a1c('Надпись', prefix + 'Ответственный') + '>' + esc(byName(responsibleId)) + '</div>' +
      (done && doneBy && doneBy !== responsibleId ? '<div class="muted text-s ellipsis" title="' + esc('Выполнил: ' + byName(doneBy)) + '"' + a1c('Надпись', prefix + 'Выполнил') + '>Выполнил: ' + esc(byName(doneBy)) + '</div>' : '') + '</td>';
  }
  // Срок (фаза 11, 7.2): дата; второй строкой — смещение, у невыполненного просроченного — «просрочено на N дн.» (дата и текст danger)
  function dueCell(date, over, offset, prefix) {
    return '<td class="nowrap"><div class="' + (over ? 'danger-text' : '') + '"' + a1c('Надпись', prefix + 'Срок') + '>' + fmtDate(date) + '</div>' +
      '<div class="text-s ' + (over ? 'danger-text' : 'muted') + '"' + a1c('Надпись', prefix + 'СрокПояснение') + '>' +
        esc(over ? 'просрочено на ' + diffDays(date, D.TODAY) + ' дн.' : offset) + '</div></td>';
  }
  // Дата выполнения (факт): ДД.ММ.ГГ для выполненных, пусто для невыполненных
  function factCell(c, prefix) {
    return '<td class="nowrap"><span' + a1c('Надпись', prefix + 'ДатаВыполнения') + '>' + (c.done && c.doneAt ? fmtDate(c.doneAt) : '') + '</span></td>';
  }

  function closureRow(t, c, lock) {
    var boxTitle = lock || (c.done ? 'Снять отметку о выполнении' : 'Отметить выполненным');
    var action = c.linkedDocType === 'forus' ? link('Открыть Forus Team', { action: 'ccOpenForus', name: 'ТаблицаЧекЛистЗакрытияОткрытьForusTeam' })
      : c.linkedDocType === 'sit' ? link('Открыть СИТ', { action: 'ccOpenSit', name: 'ТаблицаЧекЛистЗакрытияОткрытьСИТ' }) : '';
    return '<tr data-id="' + c.id + '">' +
      '<td><input type="checkbox" data-cc-done="' + c.id + '"' + (c.done ? ' checked' : '') + (lock ? ' disabled' : '') +
        ' title="' + esc(boxTitle) + '" aria-label="' + esc(boxTitle + ': ' + c.name) + '"' + a1c('Флажок', 'ТаблицаЧекЛистЗакрытияВыполнено') + '></td>' +
      '<td><div class="ellipsis" title="' + esc(c.name) + '"' + a1c('Надпись', 'ТаблицаЧекЛистЗакрытияПункт') + '>' + esc(c.name) + '</div>' +
        (c.optional ? '<div class="muted text-s"' + a1c('Надпись', 'ТаблицаЧекЛистЗакрытияНеобязательно') + '>необязательно</div>' : '') + '</td>' +
      whoCell(c.doneBy, c.responsibleId, c.done, 'ТаблицаЧекЛистЗакрытия', personById) +
      dueCell(closureDate(c), closureOverdue(c), closureOffsetText(c.offsetDays), 'ТаблицаЧекЛистЗакрытия') +
      factCell(c, 'ТаблицаЧекЛистЗакрытия') +
      '<td>' + action + '</td>' +
      '</tr>';
  }

  function checklistRow(t, c, lock) {
    var date = checklistDate(c);
    var auto = c.linkedDocType === 'program';
    var boxTitle = lock || (auto ? 'Отметится автоматически, когда АП будет создана' : c.done ? 'Снять отметку о выполнении' : 'Отметить выполненным');
    var action = '';
    if (c.linkedDocType === 'request0911') {
      action = c.linkedDocNumber
        ? link('Заявка ' + c.linkedDocNumber, { action: 'clOpenRequest', name: 'ТаблицаЧекЛистДокумент' })
        : lock ? '' : link('Создать заявку', { action: 'openDialog', data: { dialog: 'request0911', item: c.id }, name: 'ТаблицаЧекЛистСоздатьЗаявку' });  // только просмотр — только ссылки на существующие документы
    } else if (c.linkedDocType === 'bitrix') {
      action = link('Открыть Bitrix', { action: 'clOpenBitrix', name: 'ТаблицаЧекЛистОткрытьBitrix' });
    } else if (c.linkedDocType === 'program') {
      action = link('Перейти к АП', { action: 'traineeTab', data: { tab: 'program' }, name: 'ТаблицаЧекЛистПерейтиКАП' });
    }
    return '<tr data-id="' + c.id + '">' +
      '<td><input type="checkbox" data-cl-done="' + c.id + '"' + (c.done ? ' checked' : '') + (lock || auto ? ' disabled' : '') +
        ' title="' + esc(boxTitle) + '" aria-label="' + esc(boxTitle + ': ' + c.name) + '"' + a1c('Флажок', 'ТаблицаЧекЛистВыполнено') + '></td>' +
      '<td><div class="ellipsis" title="' + esc(c.name) + '"' + a1c('Надпись', 'ТаблицаЧекЛистПункт') + '>' + esc(c.name) + '</div></td>' +
      whoCell(c.doneBy, c.responsibleId, c.done, 'ТаблицаЧекЛист', userName) +
      dueCell(date, checklistOverdue(c), offsetText(c.offsetDays), 'ТаблицаЧекЛист') +
      factCell(c, 'ТаблицаЧекЛист') +
      '<td>' + action + '</td>' +
      '</tr>';
  }

  /* =====================================================================
   * FT_10: вкладка «Задачи и уведомления»
   * Задачи текущего пользователя из двух источников: «Подбор персонала» (тестовые данные, модуля подбора в прототипе нет)
   * и «Адаптация персонала» (связаны с данными: действие в списке меняет шаг согласования, пункт чек-листа или задачу АП).
   * Выполненная задача из списка уходит; «Взять в работу» оставляет её с отметкой «В работе».
   * ===================================================================== */

  var TV_SOURCES = [
    { id: 'recruit',    text: 'Подбор персонала',    short: 'Подбор',    name: 'ПодборПерсонала' },
    { id: 'adaptation', text: 'Адаптация персонала', short: 'Адаптация', name: 'АдаптацияПерсонала' }
  ];
  var TV_TYPES = [
    { id: 'approve',  text: 'Согласовать',  tone: 'danger',  name: 'Согласовать' },
    { id: 'execute',  text: 'Выполнить',    tone: 'success', name: 'Выполнить' },
    { id: 'acquaint', text: 'Ознакомиться', tone: 'info',    name: 'Ознакомиться' },
    { id: 'review',   text: 'Проверить',    tone: 'warning', name: 'Проверить' }
  ];
  // Команды типа задачи: основная кнопка выполняет main, меню ▾ — items [команда, текст, имя 1С] (ответ заказчика по FT_10)
  var TV_COMMANDS = {
    approve:  { main: 'approve',  items: [['approve', 'Согласовано', 'Согласовано'], ['reject', 'Не согласовано', 'НеСогласовано']] },
    execute:  { main: 'done',     items: [['work', 'Взять в работу', 'ВзятьВРаботу'], ['done', 'Выполнить', 'Выполнить']] },
    acquaint: { main: 'acquaint', items: [] },
    review:   { main: 'checked',  items: [['checked', 'Проверено', 'Проверено'], ['return', 'Вернуть на доработку', 'ВернутьНаДоработку']] }
  };
  var TV_DONE_TEXT = { approve: 'Согласовано', work: 'Задача взята в работу', done: 'Задача выполнена', acquaint: 'Ознакомление отмечено',
    checked: 'Задача проверена', reject: 'Не согласовано', 'return': 'Задача возвращена на доработку' };
  var TV_MAIN_TITLES = { approve: 'Согласовано', execute: 'Выполнено', acquaint: 'Ознакомлен(а)', review: 'Проверено' };
  var TV_GROUPS = [
    { id: 'overdue',   title: 'Просроченные',     name: 'Просроченные' },
    { id: 'attention', title: 'Требуют внимания', name: 'ТребуютВнимания' },
    { id: 'other',     title: 'Остальные',        name: 'Остальные' }
  ];
  var TV_FILTERS = [
    { id: 'all',       title: 'Все задачи',       icon: 'docCheck', color: 'muted',     name: 'ВсеЗадачи' },
    { id: 'overdue',   title: 'Просроченные',     icon: 'alert',    color: 'c-danger',  name: 'Просроченные' },
    { id: 'attention', title: 'Требуют внимания', icon: 'warn',     color: 'c-warning', name: 'ТребуютВнимания' },
    { id: 'today',     title: 'Сегодня',          icon: 'calendar', color: 'c-info',    name: 'Сегодня' }
  ];
  var NOTE_FILTERS = [
    { id: 'all',     title: 'Все уведомления',  icon: 'docCheck', color: 'muted',     name: 'ВсеУведомления' },
    { id: 'danger',  title: 'Критичные',        icon: 'alert',    color: 'c-danger',  name: 'Критичные' },
    { id: 'warning', title: 'Требуют внимания', icon: 'warn',     color: 'c-warning', name: 'ТребуютВнимания' },
    { id: 'info',    title: 'Информация',       icon: 'info',     color: 'c-info',    name: 'Информация' }
  ];
  var ATTENTION_DAYS = 3;     // «Требуют внимания»: срок сегодня или в ближайшие 3 дня
  var EVENT_DAYS = 7;         // события адаптации показываются в уведомлениях 7 дней
  var START_SOON_DAYS = 7;    // уведомление «стажёр выходит через N дней» — за 7 дней до выхода
  var IMPORTANCE_MAX = 6;     // до 6 уровней важности
  var IMP_COLORS = ['imp-red', 'imp-yellow', 'imp-blue', 'imp-green', 'imp-purple', 'imp-grey'];   // цвет флажка — по месту уровня

  function lowerFirst(s) { return /^[А-ЯЁA-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
  function upperFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Автор задачи «Согласовать» — кто отправил АП на согласование (последняя запись истории), иначе руководитель стажировки
  function approvalSender(program, t) {
    var h = program.history.filter(function (x) { return x.action.indexOf('АП отправлена на согласование') === 0; }).pop();
    return h ? h.userId : t.headId;
  }
  // Автор пункта чек-листа — HR-менеджер стажёра; у пунктов самого HR-менеджера — руководитель стажировки
  function checklistAuthor(t, c) { return c.responsibleId === t.hrId ? t.headId : t.hrId; }
  // Подразделение автора: у стажёра — его подразделение, у сотрудника — подразделение, за которое он отвечает
  function authorDept(id) {
    var tr = trainee(id);
    if (tr) return dept(tr.departmentId).name;
    var d = D.departments.filter(function (x) { return x.responsibleId === id; })[0];
    return d ? d.name : '';
  }

  /* ---------- Задача пользователя: общие поля (FT_11: описание, дата создания, предмет) ----------
   * key — ключ задачи (он же ключ отметки важности, у выполненной — markKey), kind — вид объекта-источника,
   * page — страница карточки стажёра, которую открывает ссылка «Предмет». У выполненной — done: {by, at, result, comment}.
   */
  function recruitTask(r) {
    return { key: r.id, kind: 'rt', source: 'recruit', type: r.type, subject: r.subject, context: '', deadline: r.deadline,
      authorId: r.authorId, inWork: r.status === 'in_progress', ref: r, description: r.description || '', createdAt: r.createdAt || '', subjectText: r.doc || r.subject };
  }
  function traineeTask(t, o) {
    o.source = 'adaptation'; o.traineeId = t.id;
    o.subjectText = 'Адаптационная программа (' + t.fullName + ')';
    return o;
  }
  function approvalTask(t, program, a, i) {
    var st = a.steps[i];
    return traineeTask(t, { key: 'ap:' + program.id, kind: 'ap', type: 'approve', ref: program, page: 'program',
      subject: 'АП стажёра ' + t.fullName, context: ROUTE_TITLES[st.role],
      deadline: routeDeadlines(a.startedAt, a.steps)[i], authorId: approvalSender(program, t),
      createdAt: i > 0 && a.steps[i - 1].doneAt ? a.steps[i - 1].doneAt : a.startedAt,
      description: 'Согласуйте адаптационную программу стажёра ' + t.fullName + ' (' + t.position + ', ' + dept(t.departmentId).name + '). ' +
        'Выход — ' + fmtDate(t.startDate) + ', задач в программе: ' + tasksOf(program).length + '. Шаг маршрута: «' + ROUTE_TITLES[st.role] + '».' });
  }
  function checklistTask(t, c, kind) {
    var prep = kind === 'cl';
    return traineeTask(t, { key: kind + ':' + c.id, kind: kind, type: 'execute', ref: c, inWork: !!c.inWork, page: prep ? 'prepare' : 'closure',
      subject: c.name, context: (prep ? 'Подготовка к выходу' : 'Закрытие стажировки') + ' · стажёр ' + t.fullName,
      deadline: prep ? checklistDate(c) : closureDate(c), authorId: checklistAuthor(t, c),
      createdAt: (prep ? t.stageDates.found : t.stageDates.closing) || '',
      description: prep
        ? 'Пункт чек-листа подготовки к выходу стажёра ' + t.fullName + '. Дата выхода — ' + fmtDate(t.startDate) + ', срок пункта — ' + offsetText(c.offsetDays) + '.'
        : 'Пункт чек-листа закрытия стажировки ' + t.fullName + (c.optional ? ' (необязательный)' : '') + '. Окончание стажировки — ' + fmtDate(t.endDate) +
          ', срок пункта — ' + closureOffsetText(c.offsetDays) + '.' });
  }
  function reviewTask(t, x) {
    return traineeTask(t, { key: 'rv:' + x.id, kind: 'rv', type: 'review', ref: x, page: 'program',
      subject: x.name, context: 'Задача АП · стажёр ' + t.fullName, deadline: x.deadline, authorId: t.id,
      createdAt: x.reviewRequestedAt || '',
      description: 'Проверьте выполнение задачи адаптационной программы стажёра ' + t.fullName + '.' +
        (x.description ? ' Задача: ' + x.description + '.' : '') + (x.result ? ' Результат стажёра: «' + x.result + '».' : '') });
  }
  function ownTask(t, program, x) {
    return traineeTask(t, { key: 'tr:' + x.id, kind: 'tr', type: 'execute', ref: x, inWork: x.status === 'in_progress', page: 'program',
      subject: x.name, context: 'Адаптационная программа · ' + blockMeta(x.block).title, deadline: x.deadline, authorId: t.headId,
      createdAt: (program.approval && program.approval.finishedAt) || t.stageDates.active || '', description: x.description || '' });
  }
  function approvalsOf(program) { return (program.approvalArchive || []).concat(program.approval ? [program.approval] : []); }

  // Задачи текущего пользователя, которые нужно выполнить
  function myTasks() {
    var me = D.CURRENT_USER_ID;
    var list = [];
    D.recruitTasks.forEach(function (r) {
      if (r.assigneeId === me && r.status !== 'done') list.push(recruitTask(r));
    });
    D.trainees.forEach(function (t) {
      if (isClosed(t)) return;
      var program = programOf(t);
      // Текущий шаг маршрута согласования АП
      var i = t.stage === 'approval' ? currentStepIndex(program) : -1;
      if (i >= 0 && program.approval.steps[i].userId === me) list.push(approvalTask(t, program, program.approval, i));
      // Пункты чек-листов подготовки и закрытия, где пользователь ответственный («Создать АП» отмечается автоматически)
      checklistOf(t).forEach(function (c) {
        if (!c.done && c.responsibleId === me && c.linkedDocType !== 'program') list.push(checklistTask(t, c, 'cl'));
      });
      closureOf(t).forEach(function (c) {
        if (!c.done && c.responsibleId === me) list.push(checklistTask(t, c, 'cc'));
      });
      if (!program) return;
      // Стажёр получает задачи своей АП после согласования (этапы «Стажировка» и «Закрытие»)
      var own = t.id === me && (t.stage === 'active' || t.stage === 'closing');
      tasksOf(program).forEach(function (x) {
        if (x.status === 'review' && x.reviewerId === me) list.push(reviewTask(t, x));
        if (own && (x.status === 'not_started' || x.status === 'in_progress')) list.push(ownTask(t, program, x));
      });
    });
    return list;
  }
  // FT_11: выполненные задачи текущего пользователя — из данных источников (кто и когда выполнил хранится в источнике)
  function doneTask(x, key, done) { x.markKey = x.key; x.key = key; x.done = done; x.inWork = false; return x; }
  function myDoneTasks() {
    var me = D.CURRENT_USER_ID;
    var list = [];
    D.recruitTasks.forEach(function (r) {
      if (r.assigneeId === me && r.status === 'done') list.push(doneTask(recruitTask(r), 'done:' + r.id, { by: r.doneBy || me, at: r.doneAt || '', result: r.result, comment: r.comment }));
    });
    D.trainees.forEach(function (t) {
      var program = programOf(t);
      if (program) approvalsOf(program).forEach(function (a, ai) {
        a.steps.forEach(function (st, i) {
          if (st.userId !== me || (st.status !== 'approved' && st.status !== 'rejected')) return;
          list.push(doneTask(approvalTask(t, program, a, i), 'done:ap:' + program.id + ':' + ai + ':' + i,
            { by: st.userId, at: st.doneTime || st.doneAt, result: st.status === 'approved' ? 'approve' : 'reject', comment: st.comment }));
        });
      });
      checklistOf(t).forEach(function (c) {
        if (c.done && c.responsibleId === me && c.linkedDocType !== 'program') list.push(doneTask(checklistTask(t, c, 'cl'), 'done:cl:' + c.id, { by: c.doneBy, at: c.doneTime || c.doneAt, result: 'done' }));
      });
      closureOf(t).forEach(function (c) {
        if (c.done && c.responsibleId === me) list.push(doneTask(checklistTask(t, c, 'cc'), 'done:cc:' + c.id, { by: c.doneBy, at: c.doneTime || c.doneAt, result: 'done' }));
      });
      if (!program) return;
      tasksOf(program).forEach(function (x) {
        (x.reviews || []).forEach(function (r, ri) {
          if (r.by === me) list.push(doneTask(reviewTask(t, x), 'done:rv:' + x.id + ':' + ri, { by: r.by, at: r.at, result: r.result, comment: r.comment }));
        });
        if (t.id === me && (x.status === 'done' || x.status === 'review')) list.push(doneTask(ownTask(t, program, x), 'done:tr:' + x.id, { by: x.doneBy || me, at: x.doneAt || '', result: x.status === 'review' ? 'review' : 'done' }));
      });
    });
    return list;
  }
  function tvTaskByKey(key) {
    var list = key.indexOf('done:') === 0 ? myDoneTasks() : myTasks();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function tvDays(x) { return diffDays(D.TODAY, x.deadline); }
  function tvGroup(x) { var d = tvDays(x); return d < 0 ? 'overdue' : d <= ATTENTION_DAYS ? 'attention' : 'other'; }
  function tvFilterMatch(x, f) {
    if (f === 'overdue') return tvDays(x) < 0;
    if (f === 'attention') return tvGroup(x) === 'attention';
    if (f === 'today') return tvDays(x) === 0;
    return true;   // 'all' и 'done' (FT_11: список выполненных строится отдельно)
  }
  function tvCanRedirect(x) { return x.kind !== 'tr'; }   // задачи своей АП стажёр выполняет сам
  function tvVisibleTasks(all) {
    var q = state.tv.search.trim().toLowerCase();
    var lv = state.tv.level;
    var marks = importanceOf().marks;
    var list = all.filter(function (x) {
      return tvFilterMatch(x, state.tv.filter) && !state.tv.sourcesOff[x.source] && !state.tv.typesOff[x.type] &&
        (!lv || marks[x.markKey || x.key] === lv) &&
        (!q || (x.subject + ' ' + x.context + ' ' + personById(x.authorId) + ' ' + authorDept(x.authorId)).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) {
      if (a.done) return a.done.at < b.done.at ? 1 : a.done.at > b.done.at ? -1 : 0;   // выполненные — новые сверху
      return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
    });
    return sortBySetting(list, 'tasks');   // FT_12: сортировка по колонке; группы по сроку строятся из этого порядка
  }
  function tvSelected(all) { return all.filter(function (x) { return state.tv.selected[x.key]; }); }

  /* ---------- Важность: личные настройки пользователя (D.importance) ---------- */
  var impSeq = 100;
  function importanceOf() {
    var me = D.CURRENT_USER_ID;
    if (!D.importance[me]) {
      D.importance[me] = { levels: D.IMPORTANCE_DEFAULT.map(function (n, i) { return { id: 'lv-' + (i + 1), name: n }; }), marks: {} };
    }
    return D.importance[me];
  }
  function levelIndex(id) { return importanceOf().levels.map(function (l) { return l.id; }).indexOf(id); }
  function impFlag(idx, title, name) {
    return '<span class="imp-flag ' + IMP_COLORS[idx] + '"' + (title ? ' title="' + esc(title) + '"' : '') + a1c('Картинка', name, 'check') + '>' + icon('flagFill') + '</span>';
  }

  /* ---------- Уведомления ---------- */
  var notesRead = {};        // прочитанные уведомления: {userId: {ключ: true}}
  var userNoteSeq = 1;
  function pushUserNote(userId, severity, text, traineeId, taskId) {
    D.userNotes.push({ id: 'un-' + (userNoteSeq++), userId: userId, severity: severity, text: text, at: nowStamp(), traineeId: traineeId, taskId: taskId });
  }
  var EVENT_RE = /^(АП отправлена на согласование|АП согласована|АП возвращена на доработку|Начато закрытие стажировки|Стажировка завершена|Стажировка отменена)/;
  // Уведомление по аналитике стажёра: замечания блока аналитики одной строкой. Если выход в ближайшие 7 дней — «выходит через N дней»
  // и что не готово к выходу (пример заказчика: «выходит через 2 дня, не завершены подготовительные задачи, не создана АП, не согласована АП»)
  function analyticsNote(t) {
    var notes = getNotifications(t);
    if (isTraineeUser()) {   // стажёр — только просрочку своих задач (как в блоке аналитики, FT_9)
      notes = notes.filter(function (n) { return n.id === 'tasks_overdue'; });
      return notes.length ? { severity: notes[0].severity, text: 'У вас ' + notes[0].text, ids: notes[0].id } : null;
    }
    var ds = daysToStart(t);
    var soon = ['found', 'draft', 'approval'].indexOf(t.stage) >= 0 && ds >= 0 && ds <= START_SOON_DAYS;
    var has = function (id) { return notes.some(function (n) { return n.id === id; }); };
    var parts = notes.map(function (n) {
      return { id: n.id, severity: n.severity, text: n.id === 'no_program' && soon ? 'не создана адаптационная программа' : lowerFirst(n.text) };
    });
    if (soon) {
      var sev = ds <= ATTENTION_DAYS ? 'warning' : 'info';
      var all = checklistOf(t);
      var left = all.filter(function (c) { return !c.done; }).length;
      if (left && !has('prep_overdue')) parts.push({ id: 'prep_left', severity: sev, text: 'не завершены пункты подготовки к выходу: ' + left + ' из ' + all.length });
      if (t.stage === 'approval' || (t.stage === 'draft' && !has('rejected') && !has('draft_stale'))) parts.push({ id: 'not_approved', severity: sev, text: 'адаптационная программа не согласована' });
    }
    if (!parts.length) return null;
    parts.sort(function (a, b) { return TONE_ORDER[a.severity] - TONE_ORDER[b.severity]; });
    var head = 'Стажёр ' + t.fullName + (soon ? (ds === 0 ? ' выходит сегодня' : ' выходит через ' + pluralN(ds, W_DAYS)) : '');
    return { severity: parts[0].severity, text: head + ': ' + parts.map(function (p) { return p.text; }).join('; '),
      ids: parts.map(function (p) { return p.id; }).join(',') };
  }
  // Уведомления текущего пользователя: подбор (тестовые), аналитика по стажёрам, события адаптации за 7 дней, адресные события
  function myNotes(withRead) {
    var me = D.CURRENT_USER_ID;
    var read = notesRead[me] || {};
    var from = addDays(D.TODAY, -EVENT_DAYS);
    var list = [];
    D.recruitNotes.forEach(function (n) {
      if (n.userId === me) list.push({ key: n.id, kind: 'rn', source: 'recruit', severity: n.severity, text: n.text, at: n.at });
    });
    D.userNotes.forEach(function (n) {
      if (n.userId === me) list.push({ key: n.id, kind: 'un', source: 'adaptation', severity: n.severity, text: n.text, at: n.at, traineeId: n.traineeId, taskId: n.taskId });
    });
    if (!isKshUser()) myTrainees().forEach(function (t) {
      var a = analyticsNote(t);
      if (a) list.push({ key: 'an:' + t.id + ':' + a.ids, kind: 'an', source: 'adaptation', severity: a.severity, text: a.text, at: D.TODAY, traineeId: t.id });
      var who = isTraineeUser() ? '' : 'Стажёр ' + t.fullName + ': ';
      var program = programOf(t);
      if (program) program.history.forEach(function (h, i) {
        if (h.userId === me || h.at.slice(0, 10) < from || !EVENT_RE.test(h.action)) return;
        var text = h.action.split('. Маршрут:')[0];
        list.push({ key: 'ev:' + program.id + ':' + i, kind: 'ev', source: 'adaptation', severity: /доработку|отменена/.test(text) ? 'warning' : 'info',
          text: who ? who + lowerFirst(text) : text, at: h.at, traineeId: t.id });
      });
      if ((t.stage === 'active' || t.stage === 'closing') && t.startDate <= D.TODAY && t.startDate >= from && !isTraineeUser()) {
        list.push({ key: 'st:' + t.id, kind: 'st', source: 'adaptation', severity: 'info', text: who + 'выход на стажировку ' + fmtDate(t.startDate), at: t.startDate, traineeId: t.id });
      }
    });
    return list.filter(function (n) { return withRead || !read[n.key]; }).sort(function (a, b) {
      return a.at < b.at ? 1 : a.at > b.at ? -1 : TONE_ORDER[a.severity] - TONE_ORDER[b.severity];
    });
  }
  function noteByKey(key) {
    var list = myNotes(true);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function tvVisibleNotes(all) {
    var q = state.tv.noteSearch.trim().toLowerCase();
    return sortBySetting(all.filter(function (n) {
      return (state.tv.noteFilter === 'all' || n.severity === state.tv.noteFilter) && !state.tv.noteSourcesOff[n.source] &&
        (!q || n.text.toLowerCase().indexOf(q) >= 0);
    }), 'notes');
  }

  /* ---------- FT_12: колонки таблиц «Задачи» и «Уведомления» ----------
   * Видимость и заголовки меняются в «Изменить форму» (меню «⋮» окна), сортировка — щелчком по заголовку «Источник» / «Тип задачи».
   * Настройки — свои у каждого пользователя (D.formSettings[userId][table] = {sort: {key, dir}, cols: {id: {hidden, title}}}).
   * locked — колонку убрать нельзя (наименование и действие). В 1С — платформенные пользовательские настройки формы.
   */
  var TV_COLS = [
    { id: 'task',   title: 'Задача', locked: true, name: 'Задача' },
    { id: 'source', title: 'Источник', w: 'w-src', sort: true, name: 'Источник' },
    { id: 'type',   title: 'Тип задачи', w: 'w-type', sort: true, name: 'ТипЗадачи' },
    { id: 'due',    title: 'Срок', w: 'w-due', name: 'Срок' },
    { id: 'author', title: 'Автор', w: 'w-author', name: 'Автор' },
    { id: 'adept',  title: 'Подразделение автора', w: 'w-adept', name: 'ПодразделениеАвтора' },
    { id: 'action', title: 'Действие', doneTitle: 'Результат', w: 'w-act', locked: true, name: 'Действие' }
  ];
  var NOTE_COLS = [
    { id: 'sev',    title: 'Важность', w: 'w-sev', noHeader: true, name: 'Важность' },
    { id: 'text',   title: 'Уведомление', locked: true, name: 'Текст' },
    { id: 'source', title: 'Источник', w: 'w-src', sort: true, name: 'Источник' },
    { id: 'date',   title: 'Дата', w: 'w-date', name: 'Дата' },
    { id: 'action', title: 'Действие', w: 'w-note-act', locked: true, name: 'Действие' }
  ];
  var TABLE_1C = { tasks: 'ТаблицаМоиЗадачи', notes: 'ТаблицаУведомления' };
  function colsOf(table) { return table === 'notes' ? NOTE_COLS : TV_COLS; }
  function formSettings(table) {
    var me = D.CURRENT_USER_ID;
    var u = D.formSettings[me] = D.formSettings[me] || {};
    return u[table] = u[table] || { sort: { key: null, dir: 1 }, cols: {} };
  }
  function visibleCols(table) {
    var cfg = formSettings(table).cols;
    return colsOf(table).filter(function (c) { return c.locked || !(cfg[c.id] && cfg[c.id].hidden); });
  }
  function colTitle(table, c, doneMode) {
    var cfg = formSettings(table).cols[c.id];
    return cfg && cfg.title ? cfg.title : doneMode && c.doneTitle ? c.doneTitle : c.title;
  }
  function colGroup(table, lead) {
    return '<colgroup>' + (lead || '') + visibleCols(table).map(function (c) { return '<col' + (c.w ? ' class="' + c.w + '"' : '') + '>'; }).join('') + '</colgroup>';
  }
  // Заголовок колонки; у сортируемой — кнопка: ▲ по возрастанию, ▼ по убыванию, повторный щелчок меняет направление
  function colHeader(table, c, doneMode) {
    var cfg = formSettings(table).cols[c.id];
    var title = colTitle(table, c, doneMode);
    if (c.noHeader && !(cfg && cfg.title)) return '<th title="' + esc(title) + '"></th>';
    if (!c.sort) return '<th>' + esc(title) + '</th>';
    var s = formSettings(table).sort;
    var on = s.key === c.id;
    return '<th aria-sort="' + (on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" class="th-sort' + (on ? ' on' : '') + '" data-action="tvSort" data-table="' + table + '" data-key="' + c.id + '"' +
      ' title="' + esc(on ? 'Сортировать в обратном порядке' : 'Сортировать по колонке «' + title + '»') + '"' +
      a1c('ТаблицаФормы', TABLE_1C[table] + 'Сортировка' + c.name) + '>' + esc(title) + (on ? (s.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
  }
  // Одна сортировка на таблицу: по представлению источника или типа; при равенстве — прежний порядок (срок / дата)
  var SORT_TEXT = {
    source: function (x) { return byId(TV_SOURCES, x.source).text; },
    type: function (x) { return byId(TV_TYPES, x.type).text; }
  };
  function sortBySetting(list, table) {
    var s = formSettings(table).sort;
    if (!s.key) return list;
    var f = SORT_TEXT[s.key];
    return list.map(function (x, i) { return [x, i]; }).sort(function (a, b) {
      return f(a[0]).localeCompare(f(b[0]), 'ru') * s.dir || a[1] - b[1];
    }).map(function (p) { return p[0]; });
  }

  /* ---------- Рендер страницы ---------- */
  function renderTasksPage() {
    // Поле поиска перерисовывается вместе со страницей — сохраняем фокус и курсор
    var active = document.activeElement;
    var key = active && active.getAttribute && active.getAttribute('data-input');
    var selStart = key ? active.selectionStart : 0, selEnd = key ? active.selectionEnd : 0;
    var open = myTasks();
    var done = myDoneTasks();
    var all = state.tv.filter === 'done' ? done : open;   // FT_11: фильтр «Выполненные» показывает выполненные задачи
    var notes = myNotes();
    // Выбор — только среди невыполненных задач, которые ещё есть в списке
    var keys = open.map(function (x) { return x.key; });
    Object.keys(state.tv.selected).forEach(function (k) { if (keys.indexOf(k) < 0) delete state.tv.selected[k]; });
    el('tasksLeft').innerHTML = state.tv.sub === 'notes' ? renderNotesLeft(notes) : renderTasksLeft(open, done, all);
    el('tasksCenter').innerHTML = '<div class="col gap-2 tv-center">' +
      '<div class="tabs tv-tabs"' + a1c('Страницы', 'СтраницыЗадачиУведомления') + '>' +
        [{ id: 'tasks', text: 'Задачи', name: 'СтраницаМоиЗадачи' }, { id: 'notes', text: 'Уведомления' + (notes.length ? ' ' + notes.length : ''), name: 'СтраницаУведомления' }].map(function (x) {
          return '<button type="button" class="tab' + (state.tv.sub === x.id ? ' active' : '') + '" data-tab="' + x.id + '" data-action="tvSub"' + a1c('Страница', x.name) + '>' + esc(x.text) + '</button>';
        }).join('') +
      '</div>' +
      (state.tv.sub === 'notes' ? renderNotesList(notes) : renderTaskList(all)) + '</div>';
    Array.prototype.forEach.call(el('tasksCenter').querySelectorAll('[data-indeterminate]'), function (x) { x.indeterminate = true; });
    if (key === 'tvSearch' || key === 'noteSearch') {
      var input = el('tasksCenter').querySelector('[data-input="' + key + '"]');
      if (input) { input.focus(); input.setSelectionRange(selStart, selEnd); }
    }
    placeFloatingMenu();
  }

  // Строка отбора левой панели: иконка, подпись, число
  function tvFilterRow(f, count, on, action, prefix) {
    return '<div class="filter-row' + (on ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + on + '" data-action="' + action + '" data-id="' + f.id + '"' +
      ' title="' + esc('Показать: ' + f.title) + '"' + a1c('ГруппаГоризонтальная', prefix + f.name, 'check') + '>' +
      '<span class="filter-icon ' + f.color + '"' + a1c('Картинка', prefix + f.name + 'Картинка') + '>' + icon(f.icon) + '</span>' +
      '<span class="grow filter-label"' + a1c('Гиперссылка', prefix + f.name + 'Заголовок') + '>' + esc(f.title) + '</span>' +
      '<span class="filter-num"' + a1c('Надпись', prefix + f.name + 'Число') + '>' + count + '</span></div>';
  }
  // Флажок отбора: «По источнику», «По типу задачи»
  function tvCheckRow(attr, id, text, count, on, name, pic) {
    return '<label class="tv-check-row" title="' + esc((on ? 'Скрыть: ' : 'Показать: ') + text) + '">' +
      '<input type="checkbox" ' + attr + '="' + id + '"' + (on ? ' checked' : '') + a1c('Флажок', name) + '>' + (pic || '') +
      '<span class="grow ellipsis">' + esc(text) + '</span>' +
      '<span class="filter-num muted"' + a1c('Надпись', name + 'Число') + '>' + count + '</span></label>';
  }
  function tvSection(text, name, extra) {
    return '<div class="row tv-sect"><span class="grow"' + a1c('Надпись', name) + '>' + esc(text) + '</span>' + (extra || '') + '</div>';
  }
  function countBy(list, fn) { return list.filter(fn).length; }

  var TV_DONE_FILTER = { id: 'done', title: 'Выполненные', icon: 'check', color: 'c-success', name: 'Выполненные' };
  // open — невыполненные задачи (счётчики фильтров), view — текущий список (счётчики флажков и важности)
  function renderTasksLeft(open, done, view) {
    var all = open;
    var imp = importanceOf();
    return '<div class="left-inner tv-left"' + a1c('ГруппаВертикальная', 'ГруппаОтборыЗадач') + '>' +
      '<div class="row tv-left-head"><span class="grow"' + a1c('Надпись', 'ДекорацияМоиЗадачи') + '>Мои задачи</span>' +
        '<span class="tv-left-num"' + a1c('Надпись', 'ДекорацияМоиЗадачиЧисло') + '>' + all.length + '</span></div>' +
      '<div class="filter-list">' + TV_FILTERS.map(function (f) {
        return tvFilterRow(f, countBy(all, function (x) { return tvFilterMatch(x, f.id); }), state.tv.filter === f.id, 'tvFilter', 'ГруппаОтборЗадач');
      }).join('') + '<div class="filter-sep"></div>' +
        tvFilterRow(TV_DONE_FILTER, done.length, state.tv.filter === 'done', 'tvFilter', 'ГруппаОтборЗадач') + '</div>' +
      '<div class="filter-sep"></div>' +
      tvSection('По источнику', 'ДекорацияПоИсточнику') +
      '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаОтборПоИсточнику') + '>' + TV_SOURCES.map(function (s) {
        return tvCheckRow('data-tv-source', s.id, s.text, countBy(view, function (x) { return x.source === s.id; }), !state.tv.sourcesOff[s.id], 'ФлажокИсточник' + s.name);
      }).join('') + '</div>' +
      tvSection('По типу задачи', 'ДекорацияПоТипуЗадачи') +
      '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаОтборПоТипу') + '>' + TV_TYPES.map(function (tp) {
        return tvCheckRow('data-tv-type', tp.id, tp.text, countBy(view, function (x) { return x.type === tp.id; }), !state.tv.typesOff[tp.id], 'ФлажокТип' + tp.name);
      }).join('') + '</div>' +
      tvSection('По важности', 'ДекорацияПоВажности',
        button('', { cls: 'btn-icon btn-flat btn-small', icon: 'gear', action: 'openImportanceSettings', title: 'Настроить важность: названия и количество уровней', name: 'КнопкаНастройкаВажности' })) +
      // Уровни задаёт пользователь (до 6) — в 1С таблица значений на форме
      '<div class="filter-list"' + a1c('ТаблицаФормы', 'ТаблицаОтборПоВажности', 'check') + '>' + imp.levels.map(function (l, i) {
        var on = state.tv.level === l.id;
        var n = countBy(view, function (x) { return imp.marks[x.markKey || x.key] === l.id; });
        return '<div class="filter-row' + (on ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + on + '" data-action="tvLevel" data-id="' + l.id + '"' +
          ' title="' + esc((on ? 'Сбросить отбор: ' : 'Показать: ') + l.name) + '">' +
          impFlag(i, '', 'ТаблицаОтборПоВажностиФлажок') +
          '<span class="grow filter-label ellipsis"' + a1c('Надпись', 'ТаблицаОтборПоВажностиНазвание') + '>' + esc(l.name) + '</span>' +
          '<span class="filter-num"' + a1c('Надпись', 'ТаблицаОтборПоВажностиЧисло') + '>' + n + '</span></div>';
      }).join('') + '</div>' +
      '</div>';
  }

  function renderNotesLeft(notes) {
    return '<div class="left-inner tv-left"' + a1c('ГруппаВертикальная', 'ГруппаОтборыУведомлений') + '>' +
      '<div class="row tv-left-head"><span class="grow"' + a1c('Надпись', 'ДекорацияМоиУведомления') + '>Мои уведомления</span>' +
        '<span class="tv-left-num"' + a1c('Надпись', 'ДекорацияМоиУведомленияЧисло') + '>' + notes.length + '</span></div>' +
      '<div class="filter-list">' + NOTE_FILTERS.map(function (f) {
        return tvFilterRow(f, countBy(notes, function (n) { return f.id === 'all' || n.severity === f.id; }), state.tv.noteFilter === f.id, 'noteFilter', 'ГруппаОтборУведомлений');
      }).join('') + '</div>' +
      '<div class="filter-sep"></div>' +
      tvSection('По источнику', 'ДекорацияУведомленияПоИсточнику') +
      '<div class="col gap-0"' + a1c('ГруппаВертикальная', 'ГруппаОтборУведомленийПоИсточнику') + '>' + TV_SOURCES.map(function (s) {
        return tvCheckRow('data-note-source', s.id, s.text, countBy(notes, function (n) { return n.source === s.id; }), !state.tv.noteSourcesOff[s.id], 'ФлажокУведомленияИсточник' + s.name);
      }).join('') + '</div>' +
      '</div>';
  }

  function sourceBadge(id, name) {
    var s = byId(TV_SOURCES, id);
    return '<span class="badge badge-src-' + id + '" title="' + esc(s.text) + '"' + a1c('Надпись', name, 'check') + '>' + esc(s.short) + '</span>';
  }
  function tvFiltersActive() {
    return state.tv.filter !== 'all' || !!state.tv.level || !!state.tv.search.trim() ||
      Object.keys(state.tv.sourcesOff).length > 0 || Object.keys(state.tv.typesOff).length > 0;
  }

  // FT_11: результат выполненной задачи — [тон бейджа, текст]
  var DONE_RESULT = { approve: ['success', 'Согласовано'], reject: ['danger', 'Не согласовано'], done: ['success', 'Выполнено'],
    acquaint: ['success', 'Ознакомлен(а)'], checked: ['success', 'Проверено'], 'return': ['warning', 'Возвращено на доработку'],
    review: ['warning', 'На проверке'] };   // задача своей АП, отправленная стажёром на проверку
  function renderTaskList(all) {
    var doneMode = state.tv.filter === 'done';   // FT_11: выполненные — только просмотр, без выбора и групп
    var list = tvVisibleTasks(all);
    var sel = doneMode ? [] : tvSelected(all);
    var imp = importanceOf();
    var redirectable = sel.filter(tvCanRedirect);
    var bar = '<div class="row wrap command-bar command-bar-flat tv-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельМоиЗадачи') + '>' +
      button('Перенаправить задачу', { icon: 'arrowFill', action: 'tvRedirect', disabled: !redirectable.length, name: 'КнопкаПеренаправитьЗадачу',
        title: doneMode ? 'Недоступно для выполненных задач' : !sel.length ? 'Отметьте задачи флажками' : !redirectable.length ? 'Задачи своей адаптационной программы стажёр выполняет сам' : 'Передать выбранные задачи другому сотруднику' }) +
      submenu('tvImportance', 'ПодменюУстановитьВажность', imp.levels.map(function (l, i) {
        return '<button type="button" data-action="tvSetLevel" data-id="' + l.id + '"' + a1c('Кнопка', 'КомандаУстановитьВажность' + (i + 1), 'check') + '>' +
          '<span class="row gap-2">' + impFlag(i, '', 'КомандаУстановитьВажность' + (i + 1) + 'Флажок') + esc(l.name) + '</span></button>';
      }).concat(['<div class="menu-sep"></div>', menuItem('Снять важность', 'tvSetLevel', { id: '' }, 'КомандаСнятьВажность')]),
        { text: 'Установить важность ▾', icon: 'flag', disabled: !sel.length, title: doneMode ? 'Недоступно для выполненных задач' : sel.length ? '' : 'Отметьте задачи флажками' }) +
      button('', { cls: 'btn-icon', icon: 'refresh', action: 'tvRefresh', title: 'Обновить список', name: 'КнопкаОбновитьЗадачи' }) +
      (sel.length ? '<span class="row gap-3"' + a1c('ГруппаГоризонтальная', 'ГруппаВыбраноМоихЗадач') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияВыбраноМоихЗадач') + '>Выбрано: ' + sel.length + '</span>' +
        link('Снять выделение', { action: 'tvClearSelection', name: 'ГиперссылкаСнятьВыделениеМоихЗадач' }) + '</span>' : '') +
      '<span class="grow"></span>' +
      '<label class="search-field tv-search">' + icon('search') +
        '<input type="text" class="input" data-input="tvSearch" placeholder="Поиск по задачам…" value="' + esc(state.tv.search) + '"' +
        ' title="Поиск по задаче, стажёру, автору и подразделению"' + a1c('ПолеВвода', 'ПолеПоискаЗадач') + '></label>' +
      '</div>';

    var span = visibleCols('tasks').length + 1;   // FT_12: колонки по настройке формы + флажок выбора
    var body;
    if (!all.length) {
      body = '<tr><td colspan="' + span + '"><div class="empty"' + a1c('Надпись', doneMode ? 'ДекорацияВыполненныхЗадачНет' : 'ДекорацияЗадачНет') + '>' +
        (doneMode ? 'Выполненных задач нет' : 'Задач нет') + '</div></td></tr>';
    } else if (doneMode && list.length) {
      body = list.map(tvTaskRow).join('');
    } else if (!list.length) {
      body = '<tr><td colspan="' + span + '"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаНетЗадачПоОтбору') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияНетЗадачПоОтбору') + '>Нет задач по выбранным условиям</span>' +
        link('Сбросить отбор', { action: 'tvResetFilters', name: 'ГиперссылкаСброситьОтборЗадач' }) + '</div></td></tr>';
    } else {
      body = TV_GROUPS.map(function (g) {
        var rows = list.filter(function (x) { return tvGroup(x) === g.id; });
        if (!rows.length) return '';
        var open = !state.tv.collapsed[g.id];
        return '<tr class="group-row" tabindex="0" data-action="tvToggleGroup" data-group="' + g.id + '" title="' + (open ? 'Свернуть группу' : 'Развернуть группу') + '"' +
          a1c('ТаблицаФормы', 'ТаблицаМоиЗадачиГруппа' + g.name, 'check') + '>' +
          '<td colspan="' + span + '"><span class="row gap-1">' + icon(open ? 'chevronDown' : 'chevronRight') +
            '<b' + (g.id === 'overdue' ? ' class="danger-text"' : '') + '>' + g.title + ' (' + rows.length + ')</b></span></td></tr>' +
          (open ? rows.map(tvTaskRow).join('') : '');
      }).join('');
    }
    var keys = doneMode ? [] : list.map(function (x) { return x.key; });
    var selVisible = keys.filter(function (k) { return state.tv.selected[k]; }).length;
    return bar + '<div class="table-box"><table class="grid tv-table"' + a1c('ТаблицаФормы', 'ТаблицаМоиЗадачи') + '>' +
      colGroup('tasks', '<col class="w-check">') +
      '<thead><tr><th><input type="checkbox" data-tv-select-all="1" title="Выбрать все видимые задачи"' +
        (keys.length && selVisible === keys.length ? ' checked' : '') + (keys.length ? '' : ' disabled') +
        (selVisible && selVisible < keys.length ? ' data-indeterminate="1"' : '') + a1c('Флажок', 'ТаблицаМоиЗадачиВыбратьВсе') + '></th>' +
        visibleCols('tasks').map(function (c) { return colHeader('tasks', c, doneMode); }).join('') + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function tvDueHint(x) {
    var d = tvDays(x);
    return d < 0 ? { cls: 'danger-text', text: 'Просрочено на ' + d * -1 + ' дн.' }
      : d === 0 ? { cls: 'warning-text', text: 'Сегодня' }
      : { cls: 'muted', text: plural(d, ['Остался', 'Осталось', 'Осталось']) + ' ' + pluralN(d, W_DAYS) };
  }
  function tvDueCell(x) {
    if (x.done) {   // FT_11: у выполненной — в срок или с опозданием
      var late = x.done.at ? diffDays(x.deadline, x.done.at.slice(0, 10)) : 0;
      return '<td class="nowrap"><div' + a1c('Надпись', 'ТаблицаМоиЗадачиСрок') + '>' + fmtDate(x.deadline) + '</div>' +
        '<div class="text-s ' + (late > 0 ? 'warning-text' : 'muted') + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиСрокПояснение') + '>' +
        (late > 0 ? 'С опозданием на ' + late + ' дн.' : 'В срок') + '</div></td>';
    }
    var d = tvDays(x);
    var hint = tvDueHint(x);
    return '<td class="nowrap"><div class="' + (d < 0 ? 'danger-text' : '') + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиСрок') + '>' + fmtDate(x.deadline) + '</div>' +
      '<div class="text-s ' + hint.cls + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиСрокПояснение') + '>' + esc(hint.text) + '</div></td>';
  }
  // Действие: основная кнопка — главная команда типа задачи; ▾ — остальные команды. В 1С кнопок в строке таблицы нет — см. 1c-mapping.md
  function tvActionCell(x) {
    var cmd = TV_COMMANDS[x.type];
    var tm = byId(TV_TYPES, x.type);
    var main = button(tm.text, { cls: 'split-main', action: 'tvAct', data: { key: x.key, act: cmd.main }, name: 'ТаблицаМоиЗадачиДействие',
      title: TV_MAIN_TITLES[x.type] });
    var host = '<div class="menu-host tv-action"' + a1c('ГруппаГоризонтальная', 'ТаблицаМоиЗадачиГруппаДействие', 'high') + '>';
    if (!cmd.items.length) return host + '<div class="split">' + main + '</div></div>';
    var id = 'row:tk:' + x.key;
    var items = cmd.items.map(function (it) {
      return menuItemIf(it[1], 'tvAct', { key: x.key, act: it[0] }, 'ТаблицаМоиЗадачиДействие' + it[2], it[0] === 'work' && x.inWork ? 'Задача уже в работе' : '');
    });
    return host + '<div class="split">' + main +
      button('', { cls: 'btn-icon split-arrow', icon: 'chevronDown', action: 'toggleMenu', data: { menu: id }, title: 'Другие действия', type: 'Подменю', name: 'ТаблицаМоиЗадачиДействиеМеню' }) +
      '</div>' + (state.openMenu === id ? '<div class="menu menu-float"' + a1c('Подменю', 'ТаблицаМоиЗадачиДействиеМенюСписок') + '>' + items.join('') + '</div>' : '') + '</div>';
  }
  // FT_11: результат выполненной задачи вместо кнопок
  function tvResultCell(x) {
    var r = DONE_RESULT[x.done.result] || DONE_RESULT.done;
    return '<div' + a1c('ГруппаВертикальная', 'ТаблицаМоиЗадачиГруппаРезультат') + '>' + badge(r[0], r[1], 'ТаблицаМоиЗадачиРезультат') +
      (x.done.at ? '<div class="muted text-s"' + a1c('Надпись', 'ТаблицаМоиЗадачиДатаВыполнения') + '>' + fmtStamp(x.done.at) + '</div>' : '') + '</div>';
  }
  function tvTaskRow(x) {
    var tm = byId(TV_TYPES, x.type);
    var imp = importanceOf();
    var li = levelIndex(imp.marks[x.markKey || x.key]);
    var selected = !!state.tv.selected[x.key];
    var full = tm.text + ': ' + x.subject;
    var dept_ = authorDept(x.authorId);
    var cells = {   // FT_12: ячейки по колонкам; выводятся видимые по настройке формы
      task: '<td><div class="row gap-1 tv-subject">' +
          (li >= 0 ? impFlag(li, 'Важность: ' + imp.levels[li].name, 'ТаблицаМоиЗадачиВажность') : '') +
          '<span class="clamp2 grow" title="' + esc(full) + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиЗадача', 'check') + '><b>' + esc(tm.text) + ':</b> ' + esc(x.subject) + '</span>' +
          (x.inWork ? badge('info', 'В работе', 'ТаблицаМоиЗадачиВРаботе') : '') + '</div>' +
        (x.context ? '<div class="muted text-s ellipsis" title="' + esc(x.context) + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиКонтекст') + '>' + esc(x.context) + '</div>' : '') + '</td>',
      source: '<td>' + sourceBadge(x.source, 'ТаблицаМоиЗадачиИсточник') + '</td>',
      type: '<td>' + badge(tm.tone, tm.text, 'ТаблицаМоиЗадачиТипЗадачи') + '</td>',
      due: tvDueCell(x),
      author: '<td><div class="clamp2" title="' + esc(personById(x.authorId)) + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиАвтор') + '>' + esc(personById(x.authorId)) + '</div></td>',
      adept: '<td><div class="clamp2' + (dept_ ? '' : ' muted') + '" title="' + esc(dept_ || 'Подразделение не указано') + '"' + a1c('Надпись', 'ТаблицаМоиЗадачиПодразделениеАвтора') + '>' + esc(dept_ || '—') + '</div></td>',
      action: '<td>' + (x.done ? tvResultCell(x) : tvActionCell(x)) + '</td>'
    };
    return '<tr class="tv-row' + (selected ? ' selected' : '') + '" data-tv-key="' + esc(x.key) + '" title="Двойной клик — открыть карточку задачи">' +
      '<td>' + (x.done ? '' : '<input type="checkbox" data-tv-select="' + esc(x.key) + '"' + (selected ? ' checked' : '') + ' title="Выбрать задачу" aria-label="' + esc('Выбрать задачу «' + full + '»') + '"' + a1c('Флажок', 'ТаблицаМоиЗадачиВыбрана') + '>') + '</td>' +
      visibleCols('tasks').map(function (c) { return cells[c.id]; }).join('') + '</tr>';
  }

  function renderNotesList(all) {
    var list = tvVisibleNotes(all);
    var bar = '<div class="row wrap command-bar command-bar-flat tv-bar"' + a1c('КоманднаяПанель', 'КоманднаяПанельУведомления') + '>' +
      button('', { cls: 'btn-icon', icon: 'refresh', action: 'tvRefresh', title: 'Обновить список', name: 'КнопкаОбновитьУведомления' }) +
      '<span class="grow"></span>' +
      '<label class="search-field tv-search">' + icon('search') +
        '<input type="text" class="input" data-input="noteSearch" placeholder="Поиск по уведомлениям…" value="' + esc(state.tv.noteSearch) + '"' +
        ' title="Поиск по тексту уведомления"' + a1c('ПолеВвода', 'ПолеПоискаУведомлений') + '></label>' +
      '</div>';
    var span = visibleCols('notes').length;
    var body;
    if (!all.length) {
      body = '<tr><td colspan="' + span + '"><div class="empty"' + a1c('Надпись', 'ДекорацияУведомленийНет') + '>Новых уведомлений нет</div></td></tr>';
    } else if (!list.length) {
      body = '<tr><td colspan="' + span + '"><div class="empty"' + a1c('ГруппаВертикальная', 'ГруппаНетУведомленийПоОтбору') + '>' +
        '<span' + a1c('Надпись', 'ДекорацияНетУведомленийПоОтбору') + '>Нет уведомлений по выбранным условиям</span>' +
        link('Сбросить отбор', { action: 'noteResetFilters', name: 'ГиперссылкаСброситьОтборУведомлений' }) + '</div></td></tr>';
    } else {
      body = list.map(function (n) {
        var cells = {
          sev: '<td class="tv-sev"><span class="note-dot c-' + n.severity + '" title="' + esc(TONE_TITLES[n.severity]) + '"' + a1c('Картинка', 'ТаблицаУведомленияВажность', 'check') + '>' + icon('dot') + '</span></td>',
          text: '<td><div class="tv-note-text"' + a1c('Надпись', 'ТаблицаУведомленияТекст') + '>' + esc(n.text) + '</div></td>',
          source: '<td>' + sourceBadge(n.source, 'ТаблицаУведомленияИсточник') + '</td>',
          date: '<td class="nowrap"' + a1c('Надпись', 'ТаблицаУведомленияДата') + '>' + (n.at.length > 10 ? fmtDateTime(n.at) : fmtDate(n.at)) + '</td>',
          action: '<td class="nowrap"><span class="row gap-2"' + a1c('ГруппаГоризонтальная', 'ТаблицаУведомленияГруппаДействие', 'high') + '>' +
            button('Перейти', { action: 'noteGo', data: { key: n.key }, title: n.source === 'recruit' ? 'Открыть документ подбора' : 'Открыть стажёра в разделе «Адаптация персонала»', name: 'ТаблицаУведомленияПерейти' }) +
            button('Прочитано', { action: 'noteRead', data: { key: n.key }, title: 'Отметить прочитанным — уведомление уйдёт из списка', name: 'ТаблицаУведомленияПрочитано' }) +
          '</span></td>'
        };
        return '<tr class="tv-row" data-note-key="' + esc(n.key) + '" title="Двойной клик — перейти">' +
          visibleCols('notes').map(function (c) { return cells[c.id]; }).join('') + '</tr>';
      }).join('');
    }
    return bar + '<div class="table-box"><table class="grid tv-table tv-notes"' + a1c('ТаблицаФормы', 'ТаблицаУведомления') + '>' +
      colGroup('notes') +
      '<thead><tr>' + visibleCols('notes').map(function (c) { return colHeader('notes', c); }).join('') + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- Действия с задачами ---------- */

  // Команда задачи. Задача адаптации меняет связанные данные: шаг согласования, пункт чек-листа, задачу АП
  function tvPerform(x, act, comment) {
    var me = D.CURRENT_USER_ID;
    var r = x.ref;
    var t = x.traineeId ? trainee(x.traineeId) : null;
    var program = t ? programOf(t) : null;
    var msg = TV_DONE_TEXT[act];
    if (x.kind === 'rt') {
      if (act === 'work') r.status = 'in_progress';
      else { r.status = 'done'; r.result = act; r.comment = required(comment) ? comment.trim() : null; r.doneBy = me; r.doneAt = nowStamp(); }
    } else if (x.kind === 'ap') {
      var res = routeResult(t, act === 'approve' ? 'approved' : 'rejected', comment);
      if (res !== 'next') msg = null;   // «АП согласована» / «АП возвращена на доработку» — оповещение уже показано
    } else if (x.kind === 'cl') {
      if (act === 'work') r.inWork = true;
      else { markChecklistDone(r, true); delete r.inWork; }
    } else if (x.kind === 'cc') {
      if (act === 'work') r.inWork = true;
      else { r.done = true; r.doneBy = me; r.doneAt = D.TODAY; r.doneTime = nowStamp(); delete r.inWork; }
    } else if (x.kind === 'tr') {
      setTaskStatusByTrainee(r, act === 'work' ? 'in_progress' : 'done');
      if (r.status === 'review') msg = 'Задача отправлена на проверку';
    } else if (x.kind === 'rv') {
      // FT_11: результат проверки хранится у задачи АП — по нему видна выполненная задача «Проверить»
      (r.reviews = r.reviews || []).push({ by: me, at: nowStamp(), result: act, comment: required(comment) ? comment.trim() : null });
      if (act === 'checked') {
        r.status = 'done';
        addHistory(program, 'Задача «' + r.name + '» проверена');
        pushUserNote(t.id, 'info', 'Задача «' + r.name + '» проверена: ' + userName(me), t.id, r.id);
      } else {
        r.status = 'in_progress';
        addHistory(program, 'Задача «' + r.name + '» возвращена на доработку. Комментарий: «' + comment.trim() + '»');
        pushUserNote(t.id, 'warning', 'Задача «' + r.name + '» возвращена на доработку: «' + comment.trim() + '»', t.id, r.id);
      }
    }
    if (act !== 'work') delete state.tv.selected[x.key];
    state.openMenu = null;
    render();
    if (msg) toast(msg + ': ' + x.subject);
  }

  // Перенаправление: новый исполнитель записывается в объект-источник
  function tvRedirectTask(x, uid, comment) {
    var note = required(comment) ? '. Комментарий: «' + comment.trim() + '»' : '';
    var change = userName(D.CURRENT_USER_ID) + ' → ' + userName(uid) + note;
    var t = x.traineeId ? trainee(x.traineeId) : null;
    var program = t ? programOf(t) : null;
    if (x.kind === 'rt') x.ref.assigneeId = uid;
    else if (x.kind === 'ap') {
      x.ref.approval.steps[currentStepIndex(x.ref)].userId = uid;
      addHistory(x.ref, 'Согласование перенаправлено: ' + change);
    } else if (x.kind === 'cl' || x.kind === 'cc') {
      x.ref.responsibleId = uid;
      delete x.ref.inWork;
      if (program) addHistory(program, 'Пункт «' + x.ref.name + '» перенаправлен: ' + change);
    } else if (x.kind === 'rv') {
      x.ref.reviewerId = uid;
      addHistory(program, 'Проверка задачи «' + x.ref.name + '» перенаправлена: ' + change);
    }
    delete state.tv.selected[x.key];
  }

  // Двойной клик по строке: открыть объект-источник. Адаптация — стажёр на вкладке «Адаптация персонала»
  var TV_OPEN_WHAT = { ap: 'лист согласования АП', cl: 'чек-лист подготовки', cc: 'чек-лист закрытия', rv: 'задача АП', tr: 'задача АП' };
  function openTraineeFrom(traineeId, tab, then) {
    var t = trainee(traineeId);
    state.topTab = 'adaptation';
    state.openMenu = null;
    selectTrainee(t.id);
    if (tab) { state.traineeTab = tab; render(); }
    if (then) then(t);
  }
  function canOpenTrainee(t, kind) {
    if (isKshUser() || myTrainees().indexOf(t) < 0) return false;
    return !(isTraineeUser() && (kind === 'cc' || kind === 'cl'));   // стажёр чек-листов не видит (FT_9)
  }
  // FT_11: ссылка «Предмет» — документ подбора (заглушка) или карточка стажёра в новой вкладке окна клиента
  function openTaskSubject(x) {
    if (x.source === 'recruit') { toast('Ещё не реализовано в прототипе'); return; }
    var t = trainee(x.traineeId);
    if (isTraineeUser() && t.id === D.CURRENT_USER_ID) { openDocTab(t.id, 'program'); return; }   // стажёр видит только свою АП
    if (!canOpenTrainee(t, x.kind)) { toast('Откроется ' + TV_OPEN_WHAT[x.kind] + ' стажёра ' + t.fullName); return; }
    openDocTab(t.id, x.page);
  }
  function openNoteSource(n) {
    if (n.source === 'recruit') { toast('Откроется документ подбора персонала'); return; }
    var t = trainee(n.traineeId);
    if (!canOpenTrainee(t, n.kind)) { toast('Откроется карточка стажёра ' + t.fullName); return; }
    if (n.taskId && taskById(n.taskId)) openTraineeFrom(t.id, 'program', function () { openDialog('task', t.id, { taskId: n.taskId }); });
    else openTraineeFrom(t.id, isTraineeUser() ? 'program' : null);
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

  // НЕ_ПЕРЕНОСИТЬ: демо-переключатели пользователя (FT_8, п. 4) и этапа выбранного стажёра
  function renderDemo() {
    var t = state.selectedTraineeId ? trainee(state.selectedTraineeId) : null;
    var me = demoUser();
    var html = '';
    if (state.markup) {
      html += '<span class="markup-flag"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ИндикаторРежимаРазметки') + '>Режим разметки 1С · Shift+D — выключить</span>';
    }
    html += '<div class="demo-host">' +
      (state.demoUserMenuOpen ? '<div class="menu"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоМенюПользователей') + '>' +
        DEMO_USERS.map(function (u) {
          return '<button type="button" data-action="demoSetUser" data-user="' + u.id + '"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоПользователь' + u.name) + '>' +
            (D.CURRENT_USER_ID === u.id ? '● ' : '○ ') + esc(u.label) + '</button>';
        }).join('') + '</div>' : '') +
      '<button type="button" class="btn demo-btn" data-action="demoUserToggle" title="' + esc('Текущий пользователь: ' + personById(me.id) + ' (' + me.role + ')') + '"' +
        a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоКнопкаПользователь') + '><span>Демо: ' + esc(me.role) + ' ▾</span></button>' +
      '</div>';
    html += '<div class="demo-host">' +
      (t && state.demoMenuOpen ? '<div class="menu"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоМенюЭтапов') + '>' +
        STAGES.map(function (s) {
          return '<button type="button" data-action="demoSetStage" data-stage="' + s.code + '"' +
            a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоЭтап' + n1c(s.code)) + '>' + (t.stage === s.code ? '● ' : '○ ') + esc(s.title) + '</button>';
        }).join('') + '</div>' : '') +
      '<button type="button" class="btn demo-btn" data-action="demoToggle"' +
        (t ? ' title="Сменить этап: ' + esc(t.fullName) + '"' : ' disabled title="Выберите стажёра, чтобы сменить этап"') +
        a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоКнопкаЭтап') + '><span>Демо: этап ' + (t ? '«' + esc(stageMeta(t.stage).title) + '» ' : '') + '▾</span></button>' +
      '</div>';
    el('demoDock').innerHTML = html;
  }

  /* FT_12, НЕ_ПЕРЕНОСИТЬ: меню «Ещё» (⋮) окна формы — платформенное меню 1С. В прототипе действует только «Изменить форму»:
   * настройка видимости и заголовков колонок открытой таблицы вкладки «Задачи и уведомления». Остальные пункты — изображение */
  var PM_ICONS = {
    star: '<path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    chevron: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function pmIcon(name) { return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' + (PM_ICONS[name] || '') + '</svg>'; }
  function formSettingsTable() { return state.topTab === 'tasks' && !activeDoc() ? (state.tv.sub === 'notes' ? 'notes' : 'tasks') : null; }
  function renderFormMenu() {
    var host = el('formMenu');
    if (!state.formMenuOpen) { host.innerHTML = ''; return; }
    var table = formSettingsTable();
    function stat(ico, text, key, arrow) {   // пункт-изображение: без действия
      return '<div class="pm-item pm-static"><span class="pm-ico">' + (ico ? pmIcon(ico) : '') + '</span><span class="grow">' + esc(text) + '</span>' +
        (key ? '<span class="pm-key">' + esc(key) + '</span>' : '') + (arrow ? '<span class="pm-arrow">' + pmIcon('chevron') + '</span>' : '') + '</div>';
    }
    host.innerHTML = '<div class="platform-menu" role="menu"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'МенюЕщеПлатформы') + '>' +
      stat('star', 'Добавить в избранное', 'Ctrl+D') + stat('chain', 'Получить ссылку...', 'Ctrl+F11') +
      '<div class="pm-sep"></div>' +
      '<button type="button" role="menuitem" class="pm-item pm-active" data-action="openFormSettings"' +
        (table ? ' title="Настроить колонки таблицы «' + (table === 'notes' ? 'Уведомления' : 'Задачи') + '»"' : ' disabled title="Изменить форму в прототипе можно на вкладке «Задачи и уведомления»"') +
        a1c('НЕ_ПЕРЕНОСИТЬ', 'КомандаИзменитьФорму') + '><span class="pm-ico"></span><span class="grow">Изменить форму</span></button>' +
      '<div class="pm-sep"></div>' + stat('', 'Правка', '', true) +
      '<div class="pm-sep"></div>' + stat('', 'Информация для технического специалиста') +
      '</div>';
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
    if (code === 'closing') ensureClosureChecklist(t);   // фаза 10, 5.1: чек-лист закрытия — из шаблона, если его ещё нет
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

  // Фаза 11, 5.4: автоматического перехода в «Закрытие» нет — этап начинается кнопкой «Начать закрытие стажировки».
  // Продление, уводящее окончание дальше порога при этапе closing, возвращает этап active; чек-лист закрытия сохраняется.
  function syncClosingStage(t) {
    if (t.stage === 'closing' && daysToEnd(t) > D.CLOSE_AVAILABLE_DAYS) { setStage(t, 'active'); return 'active'; }
    return null;
  }
  // Начало закрытия (фаза 11, 5.4): этап closing, чек-лист закрытия (в setStage), вкладка закрытия открыта, запись в историю, оповещение
  function startClosing(t) {
    setStage(t, 'closing');
    var program = programOf(t);
    if (program) addHistory(program, 'Начато закрытие стажировки');
    state.traineeTab = 'closure';
    toast('Закрытие стажировки начато');
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
      (min ? ' min="' + min + '"' : '') + (state.dialog.readOnly || state.dialog.corpLock ? ' disabled' : '') + (state.dialog.errors[name] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', oneC) + '>';
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
    return '<div class="toggle' + (state.dialog.errors[name] ? ' invalid' : '') + '" role="radiogroup"' + a1c('Тумблер', oneC, 'check') + '>' +
      items.map(function (it) {
        return '<button type="button" role="radio" aria-checked="' + (dlgValue(name) === it.value) + '" class="' + (dlgValue(name) === it.value ? 'on' : '') + '"' +
          ' data-action="dlgChoose" data-field="' + name + '" data-value="' + it.value + '"' + a1c('Тумблер', oneC + 'Вариант' + it.name) + '>' + esc(it.text) + '</button>';
      }).join('') + '</div>';
  }
  function required(v) { return String(v == null ? '' : v).trim() !== ''; }
  function personName(role) { return role === 'mentor' ? 'Наставник' : 'Руководитель стажировки'; }

  var DIALOGS = {
    startClosing: {
      title: 'Начать закрытие стажировки', form: 'ФормаНачатьЗакрытие', submit: 'Начать закрытие',
      body: function () {
        return '<p class="dlg-text"' + a1c('Надпись', 'ДекорацияВопросНачатьЗакрытие') + '>Начать закрытие стажировки? Появится вкладка с чек-листом закрытия</p>';
      },
      apply: function (t) { startClosing(t); }
    },
    // Фаза 11, 5.3: заголовок и кнопка — «Продлить стажировку»
    extend: {
      title: 'Продлить стажировку', form: 'ФормаПродлитьСрок', submit: 'Продлить стажировку',
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
        // Продление дальше порога возвращает этап «Стажировка»: вкладка закрытия скрывается, открывается АП
        var moved = syncClosingStage(t);
        if (moved === 'active' && state.traineeTab === 'closure') state.traineeTab = 'program';
        toast('Срок стажировки продлён до ' + fmtDate(v.endDate));
      }
    },
    close: {
      title: 'Завершить стажировку', form: 'ФормаЗавершениеСтажировки', submit: 'Завершить стажировку',
      body: function (t) {
        var st = statsOf(t) || { done: 0, total: 0, overdue: 0 };
        return '<div class="dlg-summary"' + a1c('Надпись', 'ДекорацияСводкаЗадач') + '>Выполнено задач: ' + st.done + ' из ' + st.total +
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
        if (program) addHistory(program, 'Стажировка завершена. Результат: ' + (v.result === 'passed' ? 'пройдена' : 'не пройдена') +
          (required(v.comment) ? '. Комментарий: «' + v.comment.trim() + '»' : ''));
        state.traineeTab = 'closure';
        toast('Стажировка завершена');
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
  function ro() { return dlgRO() || state.dialog.corpLock ? ' disabled' : ''; }
  // Задачи, к которым применяется массовое действие: из строки или выбранные флажками
  function targetTasks(t) {
    var ids = dlgCtx().taskIds || selectedTaskIds(t);
    return ids.map(taskById).filter(Boolean);
  }
  // FT_8, п. 4: проверяющий и срок — только у задач, реквизиты которых текущий пользователь может менять
  function editableTargets(t) { return targetTasks(t).filter(function (x) { return !corpLocked(x); }); }
  function corpSkipNote(t) {
    var n = targetTasks(t).length - editableTargets(t).length;
    return n ? '<div class="note note-info"' + a1c('ГруппаГоризонтальная', 'ГруппаПропускКорпБлока') + '><span class="tone-info">' + icon('info') + '</span><span' + a1c('Надпись', 'ДекорацияПропускКорпБлока') + '>' +
      esc('Задачи корпоративного блока (' + n + ') не изменятся: ' + CORP_LOCK_TEXT.charAt(0).toLowerCase() + CORP_LOCK_TEXT.slice(1) + '.') + '</span></div>' : '';
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
    var ro_ = dlgRO() || !!state.dialog.corpLock;
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
      '<div class="tf-links-title"' + a1c('Надпись', 'ДекорацияСсылкиДляОзнакомления') + '>Ссылки для ознакомления</div>' +
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
      // Новая задача и задача шаблона: проверяющий — из шаблона (если есть), наблюдатели — руководитель стажировки, наставник,
      // HR-менеджер и ответственный за подразделение (FT_6)
      if (tt) return { name: tt.name, block: tt.block, description: tt.description, deadline: addDays(t.startDate, tt.offsetDays), status: 'not_started',
        reviewerId: tt.reviewerId || '', observers: newTaskObservers(t), result: '', type: tt.type, required: tt.required, links: links(tt.links) };
      if (!x) return { name: '', block: 'spec', description: '', deadline: '', status: 'not_started',
        reviewerId: '', observers: newTaskObservers(t), result: '', type: 'task', required: false, links: [] };
      return { name: x.name, block: x.block, description: x.description, deadline: x.deadline, status: x.status,
        reviewerId: x.reviewerId || '', observers: x.observerIds.slice(), result: x.result || '',
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
        : state.dialog.traineeMode ? ''
        : dlgRO() ? '<div class="note note-info"><span class="tone-info">' + icon('info') + '</span><span>' + esc(editLock(t)) + '</span></div>'
        : state.dialog.corpLock ? '<div class="note note-info"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаКорпБлока') + '><span class="tone-info">' + icon('info') + '</span><span' + a1c('Надпись', 'ДекорацияЗадачаКорпБлока') + '>' +
          esc('Задача корпоративного блока: изменить можно только наблюдателей. ' + CORP_LOCK_TEXT + '.') + '</span></div>' : '';
      // Блок (FT_8): в корпоративный блок задача попадает только из шаблона — у новой задачи и у задачи спец. блока варианта «Корпоративный» нет
      var curTask = ctx.taskId ? taskById(ctx.taskId) : null;
      var blockOptions = fromTemplate || (curTask && curTask.block === 'corp')
        ? [{ value: 'corp', text: 'Корпоративный' }, { value: 'spec', text: 'Специальный' }] : [{ value: 'spec', text: 'Специальный' }];
      var reviewerId = dlgValue('reviewerId');
      var obs = state.dialog.values.observers;
      var obsText = namesBrief(obs, 2);
      var obsTitle = obs.length ? namesOf(obs) : 'Наблюдатели не назначены';
      // Наблюдатели: поле со списком через запятую, выбор — форма с флажками, «✕» — очистить
      var observersField = fromTemplate || dlgRO()
        ? '<input type="text" class="input grow" disabled value="' + esc(obs.length ? obsText : 'Не назначены') + '" title="' + esc(obsTitle) + '"' + a1c('ПолеВвода', 'ПолеНаблюдатели') + '>'
        : '<div class="input obs-field row gap-1" title="' + esc(obsTitle) + '">' +
            '<input type="text" readonly class="obs-text grow' + (obs.length ? '' : ' muted') + '" id="f_observers" data-action="openObserversPicker"' +
              ' value="' + esc(obs.length ? obsText : '') + '" placeholder="Не назначены"' + (e.observers ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', 'ПолеНаблюдатели') + '>' +
            (obs.length ? button('', { cls: 'btn-icon btn-flat btn-small', icon: 'close', title: 'Очистить наблюдателей', action: 'observersClear', name: 'КнопкаОчиститьНаблюдателей' }) : '') +
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
                ? '<input type="text" class="input grow" disabled value="' + esc(reviewerId ? userName(reviewerId) : 'Не назначен') + '"' + a1c('ПолеВвода', 'ПолеПроверяющий') + '>'
                : selectOptions('reviewerId', 'ПолеПроверяющий', userOptions('Не назначен'), state.dialog.corpLock ? ' title="' + esc(CORP_LOCK_TEXT) + '"' : '')) +
              (fromTemplate ? '' : button('', { cls: 'btn-icon btn-flat', icon: 'openCard', action: 'openReviewerCard', disabled: !reviewerId,
                title: reviewerId ? 'Открыть карточку сотрудника: ' + userName(reviewerId) : 'Проверяющий не назначен', name: 'КнопкаОткрытьКарточкуПроверяющего' })) + '</div>',
            { forId: 'f_reviewerId' }) +
          tfField('Наблюдатели', observersField, { forId: 'f_observers', error: e.observers, name: 'Наблюдатели' }) +
        '</div>' +
        '<div class="tf-row"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаТипСрок') + '>' +
          tfField('Тип задачи', selectOptions('type', 'ПолеТипЗадачи', D.taskTypes), { forId: 'f_type' }) +
          tfField('Срок выполнения', inputDate('deadline', 'ПолеСрокВыполнения'), { required: true, error: e.deadline, forId: 'f_deadline', name: 'СрокВыполнения' }) +
        '</div>' +
        '<div class="tf-row tf-row-bottom"' + a1c('ГруппаГоризонтальная', 'ГруппаЗадачаБлокСтатус') + '>' +
          tfField('Блок', selectOptions('block', 'ПолеБлок', blockOptions, blockOptions.length === 1 && !dlgRO() ? ' title="Задачи в корпоративный блок добавляются только из шаблона"' : ''), { forId: 'f_block', cls: 'tf-half' }) +
          (fromTemplate ? '<div class="tf-field tf-half"></div>' :
            tfField('Статус', selectOptions('status', 'ПолеСтатус', [
              { value: 'not_started', text: 'Не начата' }, { value: 'in_progress', text: 'В работе' }, { value: 'review', text: 'На проверке' }, { value: 'done', text: 'Выполнена' }]), { forId: 'f_status', cls: 'tf-half' })) +
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
      if (v.links.some(function (l) { return !required(l.url) && required(l.comment); })) e.links = 'Укажите адрес ссылки или удалите строку';
      return e;
    },
    apply: function (t, v) {
      var program = programOf(t);
      var spec = {
        name: v.name.trim(), block: v.block, description: (v.description || '').trim(), deadline: v.deadline, status: v.status,
        reviewerId: v.reviewerId || null, observerIds: v.observers.slice(), result: required(v.result) ? v.result.trim() : null,
        type: v.type, required: !!v.required,
        links: v.links.filter(function (l) { return required(l.url); }).map(function (l) { return { url: l.url.trim(), comment: (l.comment || '').trim() }; })
      };
      var x = dlgCtx().taskId ? taskById(dlgCtx().taskId) : null;
      if (corpLocked(x)) {   // FT_8: у задачи корп. блока руководитель меняет только наблюдателей
        if (!sameList(x.observerIds, spec.observerIds)) { x.observerIds = spec.observerIds; programChanged(t, 'Изменена задача «' + x.name + '»: наблюдатели'); }
        toast('Задача сохранена');
        return;
      }
      if (!x) {
        D.tasks.push(newTask(program, spec));
        delete state.collapsedBlocks[spec.block];   // новая задача видна: её группа раскрывается
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

  /* ---------- Лист согласования АП (FT_8, п. 5) ----------
   * Маршрут: руководитель стажировки → руководитель подразделения (отдела) → руководитель ЦАС → HR-менеджер (+ добавленные).
   * Одна форма для отправки (маршрут ещё не стартован) и для просмотра на этапе «Согласование».
   * Добавлять согласующих можно (в конец маршрута, стрелками — выше/ниже, но не выше текущего шага); удалять нельзя.
   */
  var ROUTE_TITLES = { head: 'Согласование руководителем стажировки', dept: 'Согласование руководителем подразделения',
    cas: 'Утверждение заместителем руководителя ЦАС', hr: 'Согласование HR-менеджером', extra: 'Дополнительное согласование' };
  var ROUTE_ICONS = {
    approved: { icon: 'check', cls: 'c-success', title: 'Выполнено: согласовано' },
    rejected: { icon: 'check', cls: 'c-danger', title: 'Выполнено: не согласовано' },
    skipped:  { icon: 'circleX', cls: 'muted', title: 'Шаг пропущен' },
    current:  { icon: 'arrowFill', cls: 'c-info', title: 'Задача сейчас у согласующего' }
  };
  var ROUTE_STEP_DAYS = 2;   // срок на один шаг согласования, дней
  function cloneSteps(steps) { return steps.map(function (x) { var y = {}; for (var k in x) y[k] = x[k]; return y; }); }
  // Подразделение сотрудника для колонки «Сотрудники»: где он ответственный; иначе — роль
  function userPlace(id) {
    var d = D.departments.filter(function (x) { return x.responsibleId === id; })[0];
    return d ? d.name : (user(id) || {}).role || '';
  }
  // Первый шаг, который ещё можно двигать: после текущего и выполненных
  function firstMovable(steps) {
    var i = steps.length;
    while (i > 0 && steps[i - 1].status === 'pending') i--;
    return i;
  }
  // Плановые сроки шагов: от начала обработки (или сегодня) по ROUTE_STEP_DAYS на шаг, выполненные — от даты выполнения
  function routeDeadlines(startedAt, steps) {
    var cursor = (startedAt || D.TODAY).slice(0, 10);
    return steps.map(function (x) {
      var due = addDays(cursor, ROUTE_STEP_DAYS);
      cursor = x.doneAt && x.status !== 'pending' && x.status !== 'current' ? x.doneAt : due;
      return due;
    });
  }
  function fmtStamp(iso) { return fmtDate(iso.slice(0, 10)) + (iso.length > 10 ? ' ' + iso.slice(11, 16) : ''); }
  function approvalBody(t) {
    var v = state.dialog.values;
    var ro_ = dlgRO();
    var dues = routeDeadlines(v.startedAt, v.steps);
    var from = firstMovable(v.steps);
    var sel = v.sel;
    var canMove = sel != null && v.steps[sel] && v.steps[sel].added && !ro_;
    var rows = v.steps.map(function (x, i) {
      var st = ROUTE_ICONS[x.status];
      var name = userName(x.userId) + ' (' + userPlace(x.userId) + ')';
      var late = x.status === 'current' && dues[i] < D.TODAY;
      return '<tr class="route-row' + (sel === i ? ' selected' : '') + '" data-action="routeSelect" data-index="' + i + '"' + a1c('ТаблицаФормы', 'ТаблицаМаршрутСтрока') + '>' +
        '<td><input type="checkbox" data-action="routeSelect" data-index="' + i + '"' + (sel === i ? ' checked' : '') + ' aria-label="Выбрать шаг ' + (i + 1) + '"' + a1c('Флажок', 'ТаблицаМаршрутВыбран') + '></td>' +
        '<td class="route-status">' + (st ? '<span class="route-ico ' + st.cls + '" title="' + esc(st.title + (x.doneAt ? ' ' + fmtDate(x.doneAt) : '')) + '"' + a1c('Картинка', 'ТаблицаМаршрутСостояние', 'check') + '>' + icon(st.icon) + '</span>' : '') + '</td>' +
        '<td class="route-action"' + a1c('Надпись', 'ТаблицаМаршрутДействие') + '>' + (i + 1) + '. ' + esc(ROUTE_TITLES[x.role]) + '</td>' +
        '<td><div class="ellipsis" title="' + esc(name) + '"' + a1c('Надпись', 'ТаблицаМаршрутСотрудник') + '>' + esc(name) + '</div></td>' +
        '<td class="nowrap' + (late ? ' danger-text' : '') + '"' + a1c('Надпись', 'ТаблицаМаршрутСрок') + '>' + (x.status === 'skipped' ? '' : fmtDate(dues[i])) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="row route-state"' + a1c('ГруппаГоризонтальная', 'ГруппаСостояниеОбработки') + '>' +
        '<span class="route-play' + (v.startedAt ? ' c-info' : ' muted') + '"' + a1c('Картинка', 'КартинкаСостояниеОбработки') + '>' + icon('chevronRight') + '</span>' +
        '<span' + a1c('Надпись', 'ДекорацияСостояниеОбработки') + '>' + (v.finishedAt ? 'Обработка завершена ' + fmtStamp(v.finishedAt) : v.startedAt ? 'Обработка начата ' + fmtStamp(v.startedAt) : 'Обработка не начата') + '</span>' +
      '</div>' +
      (ro_ ? '' : '<div class="row command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельМаршрут') + '>' +
        button('Добавить согласующего', { icon: 'plus', action: 'openApproverPicker', name: 'КнопкаДобавитьСогласующего' }) +
        button('', { cls: 'btn-icon', icon: 'arrowUp', action: 'routeMove', data: { dir: -1 }, disabled: !canMove || sel <= from,
          title: canMove ? (sel <= from ? (v.startedAt ? 'Выше текущего согласующего перенести нельзя' : 'Шаг уже первый') : 'Переместить выше') : 'Выберите добавленного согласующего', name: 'КнопкаМаршрутВыше' }) +
        button('', { cls: 'btn-icon', icon: 'arrowDown', action: 'routeMove', data: { dir: 1 }, disabled: !canMove || sel >= v.steps.length - 1,
          title: canMove ? (sel >= v.steps.length - 1 ? 'Шаг уже последний' : 'Переместить ниже') : 'Выберите добавленного согласующего', name: 'КнопкаМаршрутНиже' }) +
        '<span class="muted text-s"' + a1c('Надпись', 'ДекорацияМаршрутПодсказка') + '>Удалять согласующих нельзя; двигать можно только добавленных</span>' +
      '</div>') +
      '<div class="table-box"><table class="grid route-table"' + a1c('ТаблицаФормы', 'ТаблицаМаршрут') + '>' +
        '<colgroup><col class="w-check"><col class="w-status"><col><col class="w-emp"><col class="w-due"></colgroup>' +
        '<thead><tr><th><input type="checkbox" disabled aria-label="Выбор шагов"' + a1c('Флажок', 'ТаблицаМаршрутВыбратьВсе') + '></th>' +
        '<th class="route-status" title="Результат"><span class="route-ico c-success">' + icon('check') + '</span></th>' +
        '<th>Действия</th><th>Сотрудники</th><th>Срок</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      (v.startedAt || ro_ ? '' : field('Комментарий', textarea('comment', 'ПолеКомментарий'), { forId: 'f_comment' }));
  }
  function routeNames(steps) { return steps.map(function (x) { return userName(x.userId); }).join(', '); }
  function currentStepIndex(program) {
    return program && program.approval ? program.approval.steps.map(function (x) { return x.status; }).indexOf('current') : -1;
  }
  // Результат текущего шага согласования (FT_10: общий для демо-кнопок листа и задачи «Согласовать»).
  // result: 'approved' | 'rejected' | 'skipped'. Возвращает 'rejected' (АП на доработке), 'finished' (АП согласована) или 'next'
  function routeResult(t, result, comment) {
    var program = programOf(t);
    var steps = program.approval.steps;
    var i = currentStepIndex(program);
    var who = userName(steps[i].userId);
    steps[i].status = result; steps[i].doneAt = D.TODAY;
    steps[i].doneTime = nowStamp();                                          // FT_11: когда выполнена задача согласования
    steps[i].comment = required(comment) ? comment.trim() : null;
    var note = required(comment) ? '. Комментарий: «' + comment.trim() + '»' : '';
    if (result === 'rejected') {
      t.rejectionComment = required(comment) ? comment.trim() : 'Доработайте состав задач';
      program.approval.finishedAt = nowStamp();
      setStage(t, 'draft');
      addHistory(program, 'АП возвращена на доработку: ' + who + note);
      toast('АП возвращена на доработку');
      return 'rejected';
    }
    addHistory(program, (result === 'approved' ? 'Шаг согласован: ' : 'Шаг пропущен: ') + who + note);
    if (i + 1 < steps.length) { steps[i + 1].status = 'current'; return 'next'; }
    program.approval.finishedAt = nowStamp();
    setStage(t, 'active');
    addHistory(program, 'АП согласована');
    toast('АП согласована');
    return 'finished';
  }

  // Отправка на согласование: маршрут по умолчанию, обработка не начата
  DIALOGS.sendToApproval = {
    title: 'Отправить на согласование', form: 'ФормаЛистСогласования', submit: 'Отправить на согласование', xl: true,
    init: function (t) { return { steps: D.defaultRoute(t), startedAt: null, sel: null, comment: '' }; },
    body: approvalBody,
    apply: function (t, v) {
      var program = programOf(t);
      var steps = cloneSteps(v.steps).map(function (x, i) { x.status = i ? 'pending' : 'current'; x.doneAt = null; delete x.added; return x; });
      // FT_11: прежняя обработка (после возврата на доработку) сохраняется — по ней видны выполненные задачи согласования
      if (program.approval) (program.approvalArchive = program.approvalArchive || []).push(program.approval);
      program.approval = { startedAt: nowStamp(), steps: steps };
      setStage(t, 'approval');
      t.rejectionComment = null;
      addHistory(program, 'АП отправлена на согласование. Маршрут: ' + routeNames(steps) + (required(v.comment) ? '. Комментарий: «' + v.comment.trim() + '»' : ''));
      toast('АП отправлена на согласование');
    }
  };
  // Лист согласования на этапе «Согласование»: состояние шагов, можно добавить согласующего
  DIALOGS.approvalSheet = {
    title: 'Лист согласования', form: 'ФормаЛистСогласования', submit: 'Сохранить', xl: true,
    init: function (t) {
      var a = programOf(t).approval;
      state.dialog.readOnly = t.stage !== 'approval';   // после возврата на доработку — только просмотр завершённой обработки
      return { steps: cloneSteps(a.steps), startedAt: a.startedAt, finishedAt: a.finishedAt || null, sel: null };
    },
    body: approvalBody,
    // НЕ_ПЕРЕНОСИТЬ: демо — результат текущего шага (согласовано / не согласовано / пропущен)
    extraFoot: function (t) {
      if (t.stage !== 'approval') return '';
      return '<span class="row gap-2"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоРезультатШага') + '>' +
        ['approved', 'rejected', 'skipped'].map(function (r) {
          return '<button type="button" class="btn demo-btn" data-action="routeDemo" data-result="' + r + '"' + a1c('НЕ_ПЕРЕНОСИТЬ', 'ДемоШаг' + n1c(r)) + '><span>Демо: ' +
            { approved: 'согласовать', rejected: 'отклонить', skipped: 'пропустить' }[r] + ' шаг</span></button>';
        }).join('') + '</span>';
    },
    apply: function (t, v) {
      var program = programOf(t);
      var added = v.steps.filter(function (x) { return x.added; });
      program.approval.steps = cloneSteps(v.steps).map(function (x) { delete x.added; return x; });
      if (added.length) {
        addHistory(program, 'В маршрут согласования ' + (added.length === 1 ? 'добавлен согласующий ' : 'добавлены согласующие ') + routeNames(added));
        toast(added.length === 1 ? 'Согласующий добавлен' : 'Согласующие добавлены');
      }
    }
  };
  // Выбор согласующего: добавляется в конец маршрута формы-владельца
  DIALOGS.approverPicker = {
    title: 'Добавить согласующего', form: 'ФормаВыборСогласующего', submit: 'Добавить',
    init: function () { return { userId: '' }; },
    body: function () {
      return field('Согласующий', selectOptions('userId', 'ПолеСогласующий', userOptions('Выберите сотрудника')),
        { required: true, error: state.dialog.errors.userId, forId: 'f_userId', name: 'Согласующий' });
    },
    validate: function (t, v) { return required(v.userId) ? {} : { userId: 'Выберите согласующего' }; },
    apply: function (t, v) {
      var owner = state.dialogStack[state.dialogStack.length - 1];
      owner.values.steps.push({ role: 'extra', userId: v.userId, status: 'pending', doneAt: null, added: true });
      owner.values.sel = owner.values.steps.length - 1;
    }
  };

  // Выбор наблюдателей задачи: список сотрудников с флажками и поиском (FT_6: без «Как в АП» — умолчаний нет)
  DIALOGS.observersPicker = {
    title: 'Выбор наблюдателей', form: 'ФормаВыборНаблюдателей', submit: 'Выбрать',
    init: function (t, ctx) {
      var owner = state.dialogStack[state.dialogStack.length - 1]; // карточка задачи — форма-владелец
      return { picked: owner.values.observers.slice(), q: '' };
    },
    body: function (t) {
      var v = state.dialog.values;
      var q = v.q.trim().toLowerCase();
      var list = D.users.filter(function (u) { return !q || u.fullName.toLowerCase().indexOf(q) >= 0; });
      return '<input type="text" class="input" data-field="q" placeholder="Поиск по ФИО" value="' + esc(v.q) + '"' +
          ' title="Поиск по ФИО"' + a1c('ПолеВвода', 'ПолеПоискНаблюдателя') + '>' +
        '<div class="check-list picker-list"' + a1c('ТаблицаФормы', 'ТаблицаВыборНаблюдателей') + '>' +
          (list.length ? list.map(function (u) {
            return '<label class="check"><input type="checkbox" data-field-list="picked" value="' + u.id + '"' +
              (v.picked.indexOf(u.id) >= 0 ? ' checked' : '') + a1c('Флажок', 'ТаблицаВыборНаблюдателейПометка') + '> ' +
              esc(u.fullName) + ' <span class="muted text-s">' + esc(u.role) + '</span></label>';
          }).join('') : '<span class="muted"' + a1c('Надпись', 'ДекорацияНикогоНеНашли') + '>Никого не нашли</span>') +
        '</div>' +
        '<div class="muted text-s"' + a1c('Надпись', 'ДекорацияВыбраноНаблюдателей') + '>' + (v.picked.length ? 'Выбрано: ' + v.picked.length : 'Никто не выбран') + '</div>';
    },
    // Результат выбора возвращается в карточку задачи (форму-владельца), изменение АП — при её сохранении
    apply: function (t, v) {
      var owner = state.dialogStack[state.dialogStack.length - 1];
      owner.values.observers = v.picked.slice();
    }
  };

  DIALOGS.massReviewer = {
    title: 'Назначить проверяющего', form: 'ФормаНазначитьПроверяющего', submit: 'Назначить',
    init: function (t) { return { userId: '' }; },
    body: function (t) {
      return '<p class="dlg-text">Задач: ' + editableTargets(t).length + '</p>' + corpSkipNote(t) +
        field('Проверяющий', selectOptions('userId', 'ПолеПроверяющий', userOptions('Выберите сотрудника')),
          { required: true, error: state.dialog.errors.userId, forId: 'f_userId', name: 'Проверяющий' });
    },
    validate: function (t, v) { return required(v.userId) ? {} : { userId: 'Выберите проверяющего' }; },
    apply: function (t, v) {
      var list = editableTargets(t);
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
          var cur = x.observerIds.slice();
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
      return '<p class="dlg-text">Задач: ' + editableTargets(t).length + '</p>' + corpSkipNote(t) +
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
      var list = editableTargets(t);
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
        type: x.type, required: x.required, links: x.links, reviewerId: x.reviewerId || null };  // проверяющий — из шаблона, если есть
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
        return { block: x.block, name: x.name, description: x.description, reviewerId: x.reviewerId || null,
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
      specs.forEach(function (s) { D.tasks.push(newTask(program, withObservers(t, s))); delete state.collapsedBlocks[s.block]; });
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
    c.doneTime = done ? nowStamp() : null;   // FT_11: время выполнения для карточки задачи
  }
  function roleDefaultUser(t, role) { return role === 'head' ? t.headId : role === 'hr' ? t.hrId : t.mentorId; }

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

  // Пункт чек-листа закрытия: наименование, ответственный (роль), срок от даты окончания, обязательность
  DIALOGS.closureItem = {
    title: 'Добавить пункт закрытия', form: 'ФормаПунктЧекЛистаЗакрытия', submit: 'Добавить пункт',
    init: function (t) { return { name: '', role: 'head', date: t.endDate, optional: false }; },
    body: function (t) {
      var e = state.dialog.errors;
      var v = state.dialog.values;
      var hint = v.date ? '<div class="muted text-s">' + closureOffsetText(diffDays(t.endDate, v.date)) + ' (окончание ' + fmtDate(t.endDate) + ')</div>' : '';
      return field('Пункт', inputText('name', 'ПолеНаименованиеПунктаЗакрытия'), { required: true, error: e.name, forId: 'f_name', name: 'НаименованиеПунктаЗакрытия' }) +
        field('Ответственный', selectOptions('role', 'ПолеРольОтветственногоЗакрытия', ['head', 'hr', 'mentor', 'trainee', 'ksh'].map(function (r) {
          return { value: r, text: D.ROLE_TITLES[r] }; })), { forId: 'f_role' }) +
        field('Срок', inputDate('date', 'ПолеСрокПунктаЗакрытия') + hint, { required: true, error: e.date, forId: 'f_date', name: 'СрокПунктаЗакрытия' }) +
        '<label class="check"><input type="checkbox" data-field="optional"' + (v.optional ? ' checked' : '') + a1c('Флажок', 'ПолеНеобязательный') + '> Необязательный пункт</label>';
    },
    validate: function (t, v) {
      var e = {};
      if (!required(v.name)) e.name = 'Укажите пункт';
      if (!required(v.date)) e.date = 'Укажите срок';
      return e;
    },
    apply: function (t, v) {
      var who = v.role === 'head' ? t.headId : v.role === 'hr' ? t.hrId : v.role === 'ksh' ? D.KSH_ID : v.role === 'trainee' ? t.id : t.mentorId;
      D.closureChecklist.push({
        id: 'cc-new-' + Date.now(), traineeId: t.id, name: v.name.trim(), responsibleRole: v.role, responsibleId: who,
        offsetDays: diffDays(t.endDate, v.date), optional: !!v.optional, done: false, doneBy: null, doneAt: null, linkedDocType: null
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
      toast('Чек-лист заполнен по шаблону');
    }
  };

  /* ---------- FT_10: формы вкладки «Задачи и уведомления» ---------- */

  // FT_11: карточка задачи пользователя — двойной клик по строке списка «Задачи». Только просмотр реквизитов;
  // в подвале — важность, «Перенаправить» и команды типа задачи (основная — кнопка по умолчанию). У выполненной — результат, кто и когда
  function tvCardValue(html, name, cls) { return '<div class="tv-card-value' + (cls ? ' ' + cls : '') + '"' + a1c('Надпись', name) + '>' + html + '</div>'; }
  function tvCardCommands(x) {
    var cmd = TV_COMMANDS[x.type];
    return cmd.items.length ? cmd.items : [[cmd.main, byId(TV_TYPES, x.type).text, byId(TV_TYPES, x.type).name]];
  }
  DIALOGS.tvTask = {
    form: 'ФормаЗадачаПользователя', wide: true, readOnly: true, plainClose: true,
    titleFn: function () { var x = tvTaskByKey(dlgCtx().key); return x ? byId(TV_TYPES, x.type).text + ': ' + x.subject : 'Задача'; },
    body: function () {
      var x = tvTaskByKey(dlgCtx().key);
      if (!x) return '<p class="dlg-text"' + a1c('Надпись', 'ДекорацияЗадачаНеНайдена') + '>Задача уже выполнена или передана другому исполнителю</p>';
      var tm = byId(TV_TYPES, x.type);
      var imp = importanceOf();
      var li = levelIndex(imp.marks[x.markKey || x.key]);
      var dept_ = authorDept(x.authorId);
      var hint = x.done ? null : tvDueHint(x);
      var d = x.done;
      var r = d ? DONE_RESULT[d.result] || DONE_RESULT.done : null;
      return '<div class="row wrap gap-2"' + a1c('ГруппаГоризонтальная', 'ГруппаПризнакиЗадачи') + '>' +
          sourceBadge(x.source, 'ДекорацияИсточникЗадачи') + badge(tm.tone, tm.text, 'ДекорацияТипЗадачи') +
          (x.inWork ? badge('info', 'В работе', 'ДекорацияЗадачаВРаботе') : '') +
          (d ? badge(r[0], r[1], 'ДекорацияРезультатЗадачи') : '') +
          (li >= 0 ? '<span class="row gap-1"' + a1c('ГруппаГоризонтальная', 'ГруппаВажностьЗадачи') + '>' + impFlag(li, '', 'КартинкаВажностьЗадачи') +
            '<span' + a1c('Надпись', 'ДекорацияВажностьЗадачи') + '>' + esc(imp.levels[li].name) + '</span></span>' : '') +
        '</div>' +
        field('Наименование', tvCardValue('<b>' + esc(tm.text) + ':</b> ' + esc(x.subject), 'ДекорацияНаименованиеЗадачи')) +
        field('Описание', tvCardValue(esc(x.description || '—'), 'ДекорацияОписаниеЗадачи', 'tv-card-text')) +
        field('Автор', tvCardValue(esc(personById(x.authorId)), 'ДекорацияАвторЗадачи')) +
        field('Подразделение автора', tvCardValue(esc(dept_ || '—'), 'ДекорацияПодразделениеАвтораЗадачи', dept_ ? '' : 'muted')) +
        field('Дата создания', tvCardValue(x.createdAt ? fmtStamp(x.createdAt) : '—', 'ДекорацияДатаСозданияЗадачи')) +
        field('Срок выполнения', tvCardValue(fmtDate(x.deadline) + (hint ? ' <span class="text-s ' + hint.cls + '">' + esc(hint.text) + '</span>' : ''), 'ДекорацияСрокЗадачи')) +
        field('Предмет', '<div class="tv-card-value">' + link(x.subjectText, { action: 'tvOpenSubject', data: { key: x.key }, name: 'ГиперссылкаПредметЗадачи',
          title: x.source === 'recruit' ? 'Открыть документ подбора персонала' : 'Открыть карточку стажёра в новой вкладке' }) + '</div>') +
        (d ? '<div class="col gap-3 tv-card-done"' + a1c('ГруппаВертикальная', 'ГруппаВыполнениеЗадачи') + '>' +
          field('Результат', tvCardValue(esc(r[1]), 'ДекорацияРезультатВыполнения')) +
          field('Выполнил', tvCardValue(esc(d.by ? personById(d.by) : '—'), 'ДекорацияВыполнилЗадачу')) +
          field('Дата выполнения', tvCardValue(d.at ? fmtStamp(d.at) : '—', 'ДекорацияДатаВыполненияЗадачи')) +
          (d.comment ? field('Комментарий', tvCardValue(esc(d.comment), 'ДекорацияКомментарийВыполнения', 'tv-card-text')) : '') +
          '</div>' : '');
    },
    extraFoot: function () {
      var x = tvTaskByKey(dlgCtx().key);
      if (!x || x.done) return '';
      var imp = importanceOf();
      var cmd = TV_COMMANDS[x.type];
      return '<span class="row gap-2"' + a1c('ГруппаГоризонтальная', 'ГруппаКомандыЗадачи') + '>' +
        submenu('tvCardImportance', 'ПодменюВажностьЗадачи', imp.levels.map(function (l, i) {
          return '<button type="button" data-action="tvSetLevel" data-id="' + l.id + '" data-key="' + esc(x.key) + '"' + a1c('Кнопка', 'КомандаВажностьЗадачи' + (i + 1), 'check') + '>' +
            '<span class="row gap-2">' + impFlag(i, '', 'КомандаВажностьЗадачи' + (i + 1) + 'Флажок') + esc(l.name) + '</span></button>';
        }).concat(['<div class="menu-sep"></div>', menuItem('Снять важность', 'tvSetLevel', { id: '', key: x.key }, 'КомандаСнятьВажностьЗадачи')]),
          { text: 'Установить важность ▾', icon: 'flag' }) +
        button('Перенаправить', { action: 'tvCardRedirect', data: { key: x.key }, disabled: !tvCanRedirect(x), name: 'ФормаЗадачаПользователяКнопкаПеренаправить',
          title: tvCanRedirect(x) ? 'Передать задачу другому сотруднику' : 'Задачи своей адаптационной программы стажёр выполняет сам' }) +
        tvCardCommands(x).map(function (it) {
          var busy = it[0] === 'work' && x.inWork;
          return button(it[1], { cls: it[0] === cmd.main ? 'btn-primary' : '', action: 'tvAct', data: { key: x.key, act: it[0] }, disabled: busy,
            title: busy ? 'Задача уже в работе' : '', name: 'ФормаЗадачаПользователяКнопка' + it[2] });
        }).join('') + '</span>';
    }
  };

  // Комментарий к отрицательному решению: «Не согласовано», «Вернуть на доработку»
  DIALOGS.tvComment = {
    form: 'ФормаКомментарийРешения', danger: true,
    titleFn: function () { return dlgCtx().act === 'reject' ? 'Не согласовано' : 'Вернуть на доработку'; },
    submitFn: function () { return dlgCtx().act === 'reject' ? 'Не согласовать' : 'Вернуть на доработку'; },
    init: function () { return { comment: '' }; },
    body: function () {
      var x = tvTaskByKey(dlgCtx().key);
      return '<p class="dlg-text"' + a1c('Надпись', 'ДекорацияЗадачаРешения') + '>' + esc(x ? byId(TV_TYPES, x.type).text + ': ' + x.subject : '') + '</p>' +
        field('Комментарий', textarea('comment', 'ПолеКомментарийРешения'), { required: true, error: state.dialog.errors.comment, forId: 'f_comment', name: 'КомментарийРешения' });
    },
    validate: function (t, v) { return required(v.comment) ? {} : { comment: 'Укажите комментарий' }; },
    apply: function (t, v) {
      var x = tvTaskByKey(dlgCtx().key);
      state.dialogStack = [];   // FT_11: карточка задачи под формой закрывается вместе с ней
      if (x) tvPerform(x, dlgCtx().act, v.comment);
    }
  };

  // Перенаправление выбранных задач другому сотруднику
  DIALOGS.tvRedirect = {
    title: 'Перенаправить задачу', form: 'ФормаПеренаправитьЗадачу', submit: 'Перенаправить',
    init: function () { return { userId: '', comment: '' }; },
    body: function () {
      var list = dlgCtx().keys.map(tvTaskByKey).filter(Boolean);
      var skip = list.length - list.filter(tvCanRedirect).length;
      var me = D.CURRENT_USER_ID;
      return '<p class="dlg-text"' + a1c('Надпись', 'ДекорацияПеренаправляемыеЗадачи') + '>' +
          esc(list.length === 1 ? byId(TV_TYPES, list[0].type).text + ': ' + list[0].subject : 'Выбрано задач: ' + list.length) + '</p>' +
        (skip ? '<div class="note note-info"' + a1c('ГруппаГоризонтальная', 'ГруппаПропускЗадачСтажера') + '><span class="tone-info">' + icon('info') + '</span>' +
          '<span' + a1c('Надпись', 'ДекорацияПропускЗадачСтажера') + '>' + esc('Задачи своей адаптационной программы (' + skip + ') не перенаправляются — их стажёр выполняет сам.') + '</span></div>' : '') +
        field('Новый исполнитель', selectOptions('userId', 'ПолеНовыйИсполнитель', userOptions('Выберите сотрудника').filter(function (o) { return o.value !== me; })),
          { required: true, error: state.dialog.errors.userId, forId: 'f_userId', name: 'НовыйИсполнитель' }) +
        field('Комментарий', textarea('comment', 'ПолеКомментарийПеренаправления'), { forId: 'f_comment' });
    },
    validate: function (t, v) { return required(v.userId) ? {} : { userId: 'Выберите сотрудника' }; },
    apply: function (t, v) {
      var list = dlgCtx().keys.map(tvTaskByKey).filter(Boolean).filter(tvCanRedirect);
      state.dialogStack = [];   // FT_11: карточка задачи под формой закрывается вместе с ней
      list.forEach(function (x) { tvRedirectTask(x, v.userId, v.comment); });
      toast((list.length === 1 ? 'Задача перенаправлена: ' : 'Перенаправлено задач: ' + list.length + ' — ') + userName(v.userId));
    }
  };

  // Настройка важности: переименовать, добавить (до 6), удалить уровень. Цвет флажка — по месту в списке
  DIALOGS.importanceSettings = {
    title: 'Настройка важности', form: 'ФормаНастройкаВажности', submit: 'Сохранить', wide: true,
    init: function () { return { levels: importanceOf().levels.map(function (l) { return { id: l.id, name: l.name }; }) }; },
    body: function () {
      var lv = state.dialog.values.levels;
      var errs = state.dialog.errors.levels || {};
      var full = lv.length >= IMPORTANCE_MAX;
      return '<p class="dlg-text muted"' + a1c('Надпись', 'ДекорацияПояснениеВажности') + '>Уровни важности — ваши личные настройки. Цвет флажка зависит от места уровня в списке. ' +
          'При удалении уровня отметки этой важности у задач снимаются.</p>' +
        '<div class="row command-bar command-bar-flat"' + a1c('КоманднаяПанель', 'КоманднаяПанельУровниВажности') + '>' +
          button('Добавить уровень', { icon: 'plus', action: 'impAdd', disabled: full, title: full ? 'Не больше ' + IMPORTANCE_MAX + ' уровней важности' : 'Добавить уровень важности', name: 'КнопкаДобавитьУровеньВажности' }) +
        '</div>' +
        '<div class="table-box"><table class="grid imp-table"' + a1c('ТаблицаФормы', 'ТаблицаУровниВажности') + '>' +
          '<colgroup><col class="w-flag"><col><col class="w-del"></colgroup>' +
          '<thead><tr><th>Флажок</th><th>Название</th><th></th></tr></thead><tbody>' +
          lv.map(function (l, i) {
            return '<tr><td>' + impFlag(i, '', 'ТаблицаУровниВажностиФлажок') + '</td>' +
              '<td><input type="text" class="input imp-name" data-imp-idx="' + i + '" value="' + esc(l.name) + '" placeholder="Название важности" aria-label="Название важности"' +
                (errs[i] ? ' aria-invalid="true"' : '') + a1c('ПолеВвода', 'ТаблицаУровниВажностиНазвание') + '>' +
                (errs[i] ? '<div class="field-error"' + a1c('Надпись', 'ДекорацияОшибкаНазваниеВажности') + '>Укажите название</div>' : '') + '</td>' +
              '<td>' + button('', { cls: 'btn-icon btn-flat', icon: 'trash', action: 'impDelete', data: { idx: i }, disabled: lv.length <= 1,
                title: lv.length <= 1 ? 'Должен остаться хотя бы один уровень' : 'Удалить уровень', name: 'ТаблицаУровниВажностиУдалить' }) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
    },
    validate: function (t, v) {
      var bad = {};
      v.levels.forEach(function (l, i) { if (!required(l.name)) bad[i] = true; });
      return Object.keys(bad).length ? { levels: bad } : {};
    },
    apply: function (t, v) {
      var imp = importanceOf();
      var ids = v.levels.map(function (l) { return l.id; });
      imp.levels = v.levels.map(function (l) { return { id: l.id, name: l.name.trim() }; });
      Object.keys(imp.marks).forEach(function (k) { if (ids.indexOf(imp.marks[k]) < 0) delete imp.marks[k]; });
      if (state.tv.level && ids.indexOf(state.tv.level) < 0) state.tv.level = null;
      toast('Настройки важности сохранены');
    }
  };

  // FT_12: «Изменить форму» — видимость и заголовки колонок открытой таблицы. Наименование и действие убрать нельзя.
  // Пустой заголовок — стандартный. «Стандартные настройки» — все колонки, стандартные заголовки и порядок строк без сортировки
  DIALOGS.formSettings = {
    form: 'ФормаНастройкаКолонок', submit: 'ОК', wide: true,
    titleFn: function () { return 'Изменить форму: таблица «' + (dlgCtx().table === 'notes' ? 'Уведомления' : 'Задачи') + '»'; },
    init: function (t, ctx) {
      var cfg = formSettings(ctx.table).cols;
      var v = { cols: {}, resetSort: false };
      colsOf(ctx.table).forEach(function (c) { v.cols[c.id] = { show: !(cfg[c.id] && cfg[c.id].hidden), title: (cfg[c.id] && cfg[c.id].title) || '' }; });
      return v;
    },
    body: function () {
      var table = dlgCtx().table;
      var v = state.dialog.values;
      return '<p class="dlg-text muted"' + a1c('Надпись', 'ДекорацияПояснениеНастройкиКолонок') + '>Снимите флажок, чтобы скрыть колонку; введите заголовок, чтобы переименовать. ' +
          'Колонки «' + colsOf(table).filter(function (c) { return c.locked; }).map(function (c) { return c.title; }).join('» и «') + '» скрыть нельзя. Настройки — ваши личные.</p>' +
        '<div class="table-box"><table class="grid cols-table"' + a1c('ТаблицаФормы', 'ТаблицаКолонки') + '>' +
        '<colgroup><col class="w-show"><col class="w-colname"><col></colgroup>' +
        '<thead><tr><th>Показывать</th><th>Колонка</th><th>Заголовок</th></tr></thead><tbody>' +
        colsOf(table).map(function (c) {
          var x = v.cols[c.id];
          var std = c.title + (c.doneTitle ? ' / ' + c.doneTitle : '');
          return '<tr><td><input type="checkbox" data-col-show="' + c.id + '"' + (x.show ? ' checked' : '') + (c.locked ? ' disabled title="Эту колонку убрать нельзя"' : ' title="Показывать колонку"') +
              ' aria-label="' + esc('Показывать колонку «' + c.title + '»') + '"' + a1c('Флажок', 'ТаблицаКолонкиПоказывать') + '></td>' +
            '<td' + a1c('Надпись', 'ТаблицаКолонкиКолонка') + '>' + esc(std) + (c.locked ? ' <span class="muted text-s">обязательная</span>' : '') + '</td>' +
            '<td><input type="text" class="input col-title" data-col-title="' + c.id + '" maxlength="40" value="' + esc(x.title) + '" placeholder="' + esc(std) + '"' +
              ' aria-label="' + esc('Заголовок колонки «' + c.title + '»') + '"' + a1c('ПолеВвода', 'ТаблицаКолонкиЗаголовок') + '></td></tr>';
        }).join('') + '</tbody></table></div>';
    },
    extraFoot: function () {
      return button('Стандартные настройки', { action: 'formSettingsReset', title: 'Показать все колонки со стандартными заголовками, снять сортировку', name: 'ФормаНастройкаКолонокКнопкаСтандартные' });
    },
    apply: function (t, v) {
      var st = formSettings(dlgCtx().table);
      st.cols = {};
      colsOf(dlgCtx().table).forEach(function (c) {
        var x = v.cols[c.id];
        var o = {};
        if (!x.show && !c.locked) o.hidden = true;
        if (required(x.title)) o.title = x.title.trim();
        if (o.hidden || o.title) st.cols[c.id] = o;
      });
      if (v.resetSort) st.sort = { key: null, dir: 1 };
      toast('Настройки формы сохранены');
    }
  };

  // Диалоги, которые меняют задачи АП и недоступны при запрете редактирования
  var EDIT_DIALOGS = ['massReviewer', 'massObservers', 'massDeadline', 'deleteTasks', 'addFromTemplate'];

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
    var lock = t ? editLock(t) : null;   // FT_10: формы вкладки «Задачи и уведомления» открываются без стажёра
    if (lock && EDIT_DIALOGS.indexOf(type) >= 0) { toast(lock); return; }
    if (t && checklistLock(t) && ['checklistItem', 'checklistFill', 'request0911'].indexOf(type) >= 0) { toast(checklistLock(t)); return; }
    if (t && closureLock(t) && ['closureItem', 'close'].indexOf(type) >= 0) { toast(closureLock(t)); return; }
    if (type === 'task' && lock && !ctx.taskId && !ctx.templateId) { toast(lock); return; }
    state.openMenu = null;
    if (opts && opts.stack && state.dialog) state.dialogStack.push(state.dialog);
    else state.dialogStack = [];
    state.dialog = { type: type, traineeId: traineeId, ctx: ctx, values: {}, errors: {},
      readOnly: type === 'task' && (!!ctx.templateId || (!!lock && !!ctx.taskId)) };
    // FT_9: стажёр открывает свои задачи только для просмотра; менять может лишь статус кнопками «Взять в работу» / «Выполнено»
    if (type === 'task' && isTraineeUser()) { state.dialog.readOnly = true; state.dialog.traineeMode = true; }
    state.dialog.corpLock = type === 'task' && !state.dialog.readOnly && !!ctx.taskId && corpLocked(taskById(ctx.taskId));   // FT_8, п. 4
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

  // FT_10: «Выполнено» стажёра у задачи с проверяющим — «На проверке» (у проверяющего появляется задача «Проверить»), без проверяющего — «Выполнена»
  function setTaskStatusByTrainee(x, status) {
    x.status = status === 'done' && x.reviewerId ? 'review' : status;
    if (status === 'done') {   // FT_11: кто и когда выполнил; запрос проверки — дата создания задачи «Проверить»
      x.doneBy = D.CURRENT_USER_ID; x.doneAt = nowStamp();
      if (x.status === 'review') x.reviewRequestedAt = x.doneAt;
    }
  }
  // FT_9: кнопки стажёра в карточке своей задачи — меняют статус задачи
  function traineeTaskButtons(d) {
    var x = taskById(d.ctx.taskId);
    if (!x || x.status === 'done' || x.status === 'review') return '';   // FT_10: на проверке — ждёт проверяющего
    return (x.status === 'not_started' ? button('Взять в работу', { action: 'taskSetStatus', data: { status: 'in_progress' }, name: 'ФормаЗадачаАПКнопкаВзятьВРаботу' }) : '') +
      button('Выполнено', { cls: 'btn-primary', action: 'taskSetStatus', data: { status: 'done' }, name: 'ФормаЗадачаАПКнопкаВыполнено' });
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
          (d.traineeMode ? traineeTaskButtons(d) : (def.extraFoot ? def.extraFoot(t) : '') +
          button(readOnly ? 'Закрыть' : def.submitFn ? def.submitFn() : def.submit, { cls: def.danger && !readOnly ? 'btn-danger' : readOnly && def.plainClose ? '' : 'btn-primary', action: 'dialogSubmit', name: def.form + 'Кнопка' + (readOnly ? 'Закрыть' : 'Выполнить') }) +
          (readOnly ? '' : button('Отмена', { action: 'dialogCancel', name: def.form + 'КнопкаОтмена' }))) +
        '</div></div></div>';
    }).join('');
    state.dialog = top;
  }


  // Выбор стажёра из любого места: дерево раскрывается до него, вкладка — по этапу (раздел 5.4)
  function selectTrainee(id) {
    var t = trainee(id);
    state.selectedTraineeId = id;
    state.traineeTab = t.stage === 'found' ? 'prepare' : hasClosureTab(t) ? 'closure' : 'program';  // фаза 10, 5.1
    state.taskFilter = null;
    state.openMenu = null;
    state.taskSort = { key: null, dir: 1 };
    state.selectedTasks = {};
    state.collapsedBlocks = {};
    state.checklistMode = 'all';
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
      renderMain();
    },
    toggleHelp: function () { state.helpOpen = !state.helpOpen; render(); },
    openHelp: function () { toast('Инструкция откроется в базе знаний'); },
    toggleAnalytics: function () { state.analyticsOpen = !state.analyticsOpen; renderCenter(); },
    // FT_9: стажёр меняет статус своей задачи
    taskSetStatus: function (btn) {
      var x = taskById(state.dialog.ctx.taskId);
      setTaskStatusByTrainee(x, btn.getAttribute('data-status'));
      state.dialog = null; state.dialogStack = [];
      render();
      toast('Статус задачи «' + x.name + '»: ' + STATUS_META[x.status].text.toLowerCase());
    },
    openApprovalSheet: function () { openDialog('approvalSheet', state.selectedTraineeId); },
    openApproverPicker: function () { openDialog('approverPicker', state.dialog.traineeId, {}, { stack: true }); },
    // Лист согласования: выбор строки маршрута и перемещение добавленного согласующего
    routeSelect: function (el, e) {
      var v = state.dialog.values; var i = Number(el.getAttribute('data-index'));
      v.sel = v.sel === i && el.type === 'checkbox' ? null : i;
      renderDialog();
    },
    routeMove: function (btn) {
      var v = state.dialog.values; var i = v.sel; var j = i + Number(btn.getAttribute('data-dir'));
      if (i == null || j < firstMovable(v.steps) || j >= v.steps.length || !v.steps[i].added) return;
      var x = v.steps[i]; v.steps[i] = v.steps[j]; v.steps[j] = x; v.sel = j;
      renderDialog();
    },
    // НЕ_ПЕРЕНОСИТЬ: демо-результат текущего шага согласования
    routeDemo: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var program = programOf(t);
      var v = state.dialog.values;
      if (v.steps.map(function (x) { return x.status; }).indexOf('current') < 0) return;
      // Маршрут формы (с добавленными согласующими) записывается в АП, затем — результат текущего шага
      program.approval.steps = cloneSteps(v.steps).map(function (x) { delete x.added; return x; });
      var res = routeResult(t, btn.getAttribute('data-result'));
      if (res !== 'next') { state.dialog = null; state.dialogStack = []; render(); return; }
      v.steps.forEach(function (x, i) { x.status = program.approval.steps[i].status; x.doneAt = program.approval.steps[i].doneAt; });
      render();
    },
    createProgram: function () {
      state.traineeTab = 'program';
      renderCenter();
    },
    openDeptCard: function () {
      var d = dept(trainee(state.selectedTraineeId).departmentId);
      toast('Откроется карточка подразделения «' + d.name + '»');
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
      // Фаза 11, 6.2: фильтр, отличный от «Все», раскрывает группы с подходящими задачами; возврат на «Все» ничего не сворачивает
      if (state.taskFilter) {
        var t = trainee(state.selectedTraineeId);
        tasksOf(programOf(t)).forEach(function (x) { if (taskMatchesFilter(x, state.taskFilter)) delete state.collapsedBlocks[x.block]; });
      }
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
    clMode: function (btn) { state.checklistMode = btn.getAttribute('data-value'); renderCenter(); },
    ccMode: function (btn) { state.closureMode = btn.getAttribute('data-value'); renderCenter(); },
    ccOpenForus: function () { toast('Переход в Forus Team в прототипе не реализован'); },
    ccOpenSit: function () { toast('Переход в СИТ в прототипе не реализован'); },
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
      state.dialog.values.observers = [];
      renderDialog();
    },
    openLinkUrl: function (btn) { toast('Ссылка откроется в браузере: ' + btn.getAttribute('data-url')); },
    openReviewerCard: function () {
      if (state.dialog.values.reviewerId) toast('Откроется карточка сотрудника: ' + userName(state.dialog.values.reviewerId));
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
    demoToggle: function () { state.demoMenuOpen = !state.demoMenuOpen; state.demoUserMenuOpen = false; renderDemo(); },
    demoUserToggle: function () { state.demoUserMenuOpen = !state.demoUserMenuOpen; state.demoMenuOpen = false; renderDemo(); },
    // FT_8, п. 4: смена текущего пользователя — руководитель ЦАС или HR-менеджер (права на задачи корпоративного блока, «Мои»)
    demoSetUser: function (btn) {
      if (state.shell.active) switchShell(null);   // FT_11: окна другого пользователя закрываются
      state.shell.tabs = [];
      D.CURRENT_USER_ID = btn.getAttribute('data-user');
      state.demoUserMenuOpen = false;
      // FT_9: видимость по пользователю — сбросить фильтр, поиск и выбор стажёра, которого новый пользователь не видит
      state.counterFilter = null; state.search = ''; state.openMenu = null; state.selectedTasks = {};
      state.tv.selected = {}; state.tv.level = null; state.tv.filter = 'all';   // FT_10: важность и выбор — свои у каждого пользователя; FT_11: и выполненные
      if (state.selectedTraineeId && myTrainees().map(function (t) { return t.id; }).indexOf(state.selectedTraineeId) < 0) state.selectedTraineeId = null;
      if (isTraineeUser()) { state.selectedTraineeId = D.CURRENT_USER_ID; state.traineeTab = 'program'; }
      render();
      toast('Текущий пользователь: ' + personById(D.CURRENT_USER_ID));
    },
    demoSetStage: function (btn) {
      var t = trainee(state.selectedTraineeId);
      var code = btn.getAttribute('data-stage');
      // Фаза 9, 8.2: дальше «Подготовки к выходу» без АП — создать её по шаблону должности (иначе «Базовый»),
      // со сроками от даты выхода; пункт «Создать АП» отмечается, в истории — запись. При возврате на found АП не удаляется.
      if (code !== 'found' && !programOf(t)) {
        var tp = recommendedTemplate(t) || byId(D.templates, 'tpl-base');
        createProgram(t, tp.id, 'Создана при смене этапа (демо)', templateTasksFor(t, tp));
      }
      var hadClosure = hasClosureTab(t);
      // Фаза 11, 5.4: перевод в «Закрытие» делает то же, что кнопка «Начать закрытие стажировки»; автоперехода из «Стажировки» нет
      if (code === 'closing' && t.stage !== 'closing') startClosing(t);
      else setStage(t, code);
      // Появившаяся вкладка «Закрытие стажировки» открывается по умолчанию; скрытая — возвращает к АП
      if (hasClosureTab(t) && !hadClosure) state.traineeTab = 'closure';
      if (!hasClosureTab(t) && state.traineeTab === 'closure') state.traineeTab = 'program';
      state.demoMenuOpen = false;
      render();
    }
  };

  // FT_10: действия вкладки «Задачи и уведомления»
  var tvActions = {
    tvSub: function (btn) { state.tv.sub = btn.getAttribute('data-tab'); state.openMenu = null; renderTasksPage(); },
    tvFilter: function (row) { state.tv.filter = row.getAttribute('data-id'); renderTasksPage(); },
    noteFilter: function (row) { state.tv.noteFilter = row.getAttribute('data-id'); renderTasksPage(); },
    tvLevel: function (row) {
      var id = row.getAttribute('data-id');
      state.tv.level = state.tv.level === id ? null : id;
      renderTasksPage();
    },
    tvToggleGroup: function (row) {
      var g = row.getAttribute('data-group');
      state.tv.collapsed[g] = !state.tv.collapsed[g];
      renderTasksPage();
    },
    tvAct: function (btn) {
      var x = tvTaskByKey(btn.getAttribute('data-key'));
      var act = btn.getAttribute('data-act');
      if (!x) return;
      state.openMenu = null;
      var inCard = !!state.dialog && state.dialog.type === 'tvTask';   // FT_11: команда из карточки задачи
      if (act === 'reject' || act === 'return') { openDialog('tvComment', null, { key: x.key, act: act }, { stack: inCard }); return; }
      if (inCard && act !== 'work') { state.dialog = null; state.dialogStack = []; }   // «Взять в работу» — карточка остаётся открытой
      tvPerform(x, act);
    },
    tvRedirect: function () {
      openDialog('tvRedirect', null, { keys: tvSelected(myTasks()).map(function (x) { return x.key; }) });
    },
    tvSetLevel: function (btn) {
      var id = btn.getAttribute('data-id');
      var imp = importanceOf();
      var key = btn.getAttribute('data-key');   // FT_11: из карточки задачи — одна задача
      var sel = key ? [tvTaskByKey(key)].filter(Boolean) : tvSelected(myTasks());
      sel.forEach(function (x) { if (id) imp.marks[x.key] = id; else delete imp.marks[x.key]; });
      state.openMenu = null;
      renderTasksPage();
      if (state.dialog) renderDialog();
      toast(id ? 'Важность «' + imp.levels[levelIndex(id)].name + '» установлена: ' + pluralN(sel.length, ['задача', 'задачи', 'задач'])
        : 'Важность снята: ' + pluralN(sel.length, ['задача', 'задачи', 'задач']));
    },
    tvRefresh: function () { render(); toast('Список обновлён'); },
    tvClearSelection: function () { state.tv.selected = {}; renderTasksPage(); },
    tvResetFilters: function () {
      state.tv.filter = 'all'; state.tv.level = null; state.tv.search = ''; state.tv.sourcesOff = {}; state.tv.typesOff = {};
      renderTasksPage();
    },
    noteResetFilters: function () { state.tv.noteFilter = 'all'; state.tv.noteSearch = ''; state.tv.noteSourcesOff = {}; renderTasksPage(); },
    noteGo: function (btn) { var n = noteByKey(btn.getAttribute('data-key')); if (n) openNoteSource(n); },
    noteRead: function (btn) {
      var me = D.CURRENT_USER_ID;
      notesRead[me] = notesRead[me] || {};
      notesRead[me][btn.getAttribute('data-key')] = true;
      renderTasksPage();
    },
    openImportanceSettings: function () { openDialog('importanceSettings', null); },
    // FT_12, НЕ_ПЕРЕНОСИТЬ: меню «Ещё» окна и «Изменить форму»
    formMenuToggle: function () { state.formMenuOpen = !state.formMenuOpen; renderFormMenu(); },
    openFormSettings: function () {
      var table = formSettingsTable();
      state.formMenuOpen = false;
      renderFormMenu();
      if (table) openDialog('formSettings', null, { table: table });
    },
    formSettingsReset: function () {
      var v = state.dialog.values;
      Object.keys(v.cols).forEach(function (id) { v.cols[id] = { show: true, title: '' }; });
      v.resetSort = true;
      renderDialog();
    },
    // FT_12: сортировка по заголовку колонки — одна на таблицу; повторный щелчок меняет направление
    tvSort: function (btn) {
      var s = formSettings(btn.getAttribute('data-table')).sort;
      var key = btn.getAttribute('data-key');
      if (s.key === key) s.dir = -s.dir; else { s.key = key; s.dir = 1; }
      renderTasksPage();
    },
    // FT_11: карточка задачи — перенаправление, ссылка «Предмет»; вкладки окон клиента
    tvCardRedirect: function (btn) { state.openMenu = null; openDialog('tvRedirect', null, { keys: [btn.getAttribute('data-key')] }, { stack: true }); },
    tvOpenSubject: function (btn) { var x = tvTaskByKey(btn.getAttribute('data-key')); if (x) openTaskSubject(x); },
    shellTab: function (btn) { switchShell(btn.getAttribute('data-id') || null); render(); },
    shellClose: function (btn) { closeDocTab(btn.getAttribute('data-id')); },
    shellCloseActive: function () { if (state.shell.active) closeDocTab(state.shell.active); },
    impAdd: function () {
      var lv = state.dialog.values.levels;
      if (lv.length >= IMPORTANCE_MAX) return;
      lv.push({ id: 'lv-' + (++impSeq), name: '' });
      renderDialog();
      var inputs = topModal().querySelectorAll('[data-imp-idx]');
      inputs[inputs.length - 1].focus();
    },
    impDelete: function (btn) {
      var lv = state.dialog.values.levels;
      if (lv.length <= 1) return;
      lv.splice(Number(btn.getAttribute('data-idx')), 1);
      delete state.dialog.errors.levels;
      renderDialog();
    }
  };
  for (var tvKey in tvActions) actions[tvKey] = tvActions[tvKey];

  document.addEventListener('click', function (e) {
    if (state.formMenuOpen && !e.target.closest('#formMenuHost')) { state.formMenuOpen = false; renderFormMenu(); }   // FT_12
    if (state.openMenu && !e.target.closest('.menu-host')) {
      state.openMenu = null;
      renderMain();
    }
    var target = e.target.closest('[data-action]');
    if (!target || target.disabled) {
      if ((state.demoMenuOpen || state.demoUserMenuOpen) && !e.target.closest('#demoDock')) { state.demoMenuOpen = false; state.demoUserMenuOpen = false; renderDemo(); }
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
    // FT_12: заголовок колонки в «Изменить форму»
    var colT = e.target.getAttribute('data-col-title');
    if (colT && state.dialog) { state.dialog.values.cols[colT].title = e.target.value; return; }
    // FT_10: название уровня важности, поиск по задачам и уведомлениям
    var impIdx = e.target.getAttribute('data-imp-idx');
    if (impIdx != null && state.dialog) {
      state.dialog.values.levels[Number(impIdx)].name = e.target.value;
      return;
    }
    if (e.target.getAttribute('data-input') === 'tvSearch') { state.tv.search = e.target.value; renderTasksPage(); return; }
    if (e.target.getAttribute('data-input') === 'noteSearch') { state.tv.noteSearch = e.target.value; renderTasksPage(); return; }
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
    // FT_12: видимость колонки в «Изменить форму»
    if (tgt.hasAttribute('data-col-show') && state.dialog) { state.dialog.values.cols[tgt.getAttribute('data-col-show')].show = tgt.checked; return; }
    // FT_10: отборы и выбор задач на вкладке «Задачи и уведомления»
    var tvAttr = ['data-tv-source', 'data-tv-type', 'data-note-source'].filter(function (a) { return tgt.hasAttribute(a); })[0];
    if (tvAttr) {
      var off = tvAttr === 'data-tv-source' ? state.tv.sourcesOff : tvAttr === 'data-tv-type' ? state.tv.typesOff : state.tv.noteSourcesOff;
      if (tgt.checked) delete off[tgt.getAttribute(tvAttr)]; else off[tgt.getAttribute(tvAttr)] = true;
      renderTasksPage();
      return;
    }
    if (tgt.hasAttribute('data-tv-select')) {
      if (tgt.checked) state.tv.selected[tgt.getAttribute('data-tv-select')] = true; else delete state.tv.selected[tgt.getAttribute('data-tv-select')];
      renderTasksPage();
      return;
    }
    if (tgt.hasAttribute('data-tv-select-all')) {
      tvVisibleTasks(myTasks()).forEach(function (x) { if (tgt.checked) state.tv.selected[x.key] = true; else delete state.tv.selected[x.key]; });
      renderTasksPage();
      return;
    }
    // Флажок «выполнено» в чек-листе закрытия — ставится вручную (фаза 10, 5.3)
    if (tgt.hasAttribute('data-cc-done')) {
      var cc = byId(D.closureChecklist, tgt.getAttribute('data-cc-done'));
      cc.done = tgt.checked; cc.doneBy = tgt.checked ? D.CURRENT_USER_ID : null; cc.doneAt = tgt.checked ? D.TODAY : null;
      cc.doneTime = tgt.checked ? nowStamp() : null;
      render();
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
    // FT_10: строка задачи или уведомления — открыть объект-источник
    var tvrow = e.target.closest('tr[data-tv-key]');
    if (tvrow && !e.target.closest('input, button')) { openDialog('tvTask', null, { key: tvrow.getAttribute('data-tv-key') }); return; }   // FT_11: карточка задачи
    var nrow = e.target.closest('tr[data-note-key]');
    if (nrow && !e.target.closest('input, button')) { var nx = noteByKey(nrow.getAttribute('data-note-key')); if (nx) openNoteSource(nx); return; }
    var srow = e.target.closest('tr.summary-row');
    if (srow && !e.target.closest('button')) { selectTrainee(srow.getAttribute('data-id')); return; }
    var row = e.target.closest('tr[data-task-id]');
    if (!row || e.target.closest('input, button')) return;
    openDialog('task', state.selectedTraineeId, { taskId: row.getAttribute('data-task-id') });
  });
  // Контекстное меню строки закрывается при прокрутке
  var menuOpenedAt = 0;
  document.addEventListener('scroll', function () {
    if (state.openMenu && state.openMenu.indexOf('row:') === 0 && Date.now() - menuOpenedAt > 300) { state.openMenu = null; renderMain(); }
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
      if (state.formMenuOpen) { state.formMenuOpen = false; renderFormMenu(); }   // FT_12: меню «Ещё» окна
      else if (state.openMenu) { state.openMenu = null; renderMain(); }   // FT_11: сначала — подменю (в т. ч. в подвале карточки задачи)
      else if (state.dialog) closeDialog();
      else if (state.demoMenuOpen || state.demoUserMenuOpen) { state.demoMenuOpen = false; state.demoUserMenuOpen = false; renderDemo(); }
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
