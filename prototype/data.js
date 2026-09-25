/* Тестовые данные прототипа «Адаптация персонала».
 * Имена ключей — английские, в комментариях — предполагаемый объект 1С.
 * Все даты — строки 'ГГГГ-ММ-ДД', дата и время — 'ГГГГ-ММ-ДДTЧЧ:ММ'.
 */
(function () {
  'use strict';

  // Локальный помощник: дата + N дней (только для построения тестовых данных)
  function addDays(iso, n) {
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }

  /* ---------- Константы ---------- */
  var TODAY = '2026-07-25';           // «сегодня» для всех расчётов
  var CURRENT_USER_ID = 'u-petrova';  // текущий пользователь — руководитель
  var REAPPROVAL_ON_CHANGE = true;    // изменение согласованной АП требует повторного согласования
  var LAG_THRESHOLD = 10;             // отставание задач от времени, п.п.
  var CLOSE_AVAILABLE_DAYS = 14;      // за сколько дней до окончания доступно «Начать закрытие»

  /* ---------- Справочник.Подразделения ---------- */
  var departments = [
    { id: 'd-cas',    name: 'ЦАС',                                    parentId: null },
    { id: 'd-corp',   name: 'Отдел корпоративного сопровождения',     parentId: 'd-cas' },
    { id: 'd-auto',   name: 'Направление по автоматизации',           parentId: 'd-corp' },
    { id: 'd-impl',   name: 'Группа внедрений',                       parentId: 'd-corp' },
    { id: 'd-report', name: 'Отдел отчетности и процессов',           parentId: 'd-cas' },
    { id: 'd-gov',    name: 'Отдел с государственным сектором',       parentId: 'd-cas' },
    { id: 'd-sub',    name: 'Отдел с субподрядчиками',                parentId: 'd-cas' },
    { id: 'd-fed',    name: 'Отдел с федеральными проектами',         parentId: 'd-cas' },
    { id: 'd-expert', name: 'Отдел экспертизы и внутренних проектов', parentId: 'd-cas' },
    { id: 'd-pmo',    name: 'Проектный офис',                         parentId: 'd-cas' },
    { id: 'd-admin',  name: 'ЦАС. Администрация',                     parentId: 'd-cas' }
  ];

  /* ---------- Справочник.Пользователи / ФизическиеЛица ---------- */
  var users = [
    { id: 'u-petrova',   fullName: 'Петрова Анна Евгеньевна',        shortName: 'Петрова А. Е.',   role: 'Руководитель стажировки' },
    { id: 'u-ivanov-ii', fullName: 'Иванов Иван Иванович',           shortName: 'Иванов И. И.',    role: 'Наставник' },
    { id: 'u-kozlov',    fullName: 'Козлов Дмитрий Андреевич',       shortName: 'Козлов Д. А.',    role: 'Наставник' },
    { id: 'u-morozova',  fullName: 'Морозова Ольга Викторовна',      shortName: 'Морозова О. В.',  role: 'Наставник' },
    { id: 'u-vasiliev',  fullName: 'Васильев Андрей Петрович',       shortName: 'Васильев А. П.',  role: 'Наставник' },
    { id: 'u-novikov',   fullName: 'Новиков Павел Сергеевич',        shortName: 'Новиков П. С.',   role: 'Руководитель проектного офиса' },
    { id: 'u-fedorova',  fullName: 'Федорова Наталья Александровна', shortName: 'Федорова Н. А.',  role: 'Эксперт по методологии' },
    { id: 'u-sokolova',  fullName: 'Соколова Екатерина Игоревна',    shortName: 'Соколова Е. И.',  role: 'HR-менеджер' }
  ];
  var HR_ID = 'u-sokolova';

  /* ---------- Стажёры (Справочник.Сотрудники + РегистрСведений.СтатусыСтажеров) ----------
   * stageDates — даты начала этапов (для степпера), closedAt / closeKind ('passed'|'failed'|'cancelled') — для этапа closed.
   */
  var trainees = [
    {
      id: 't-ivanov', fullName: 'Иванов Петр Сергеевич', position: 'Аналитик', departmentId: 'd-auto',
      mentorId: 'u-kozlov', headId: 'u-petrova', startDate: '2026-07-29', endDate: '2026-10-28',
      stage: 'found', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-10' }, closedAt: null, closeKind: null
    },
    {
      id: 't-belova', fullName: 'Белова Анна Дмитриевна', position: 'Специалист по автоматизации', departmentId: 'd-auto',
      mentorId: 'u-kozlov', headId: 'u-petrova', startDate: '2026-08-03', endDate: '2026-11-02',
      stage: 'found', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-17' }, closedAt: null, closeKind: null
    },
    {
      id: 't-sidorov', fullName: 'Сидоров Алексей Игоревич', position: 'Инженер по внедрению', departmentId: 'd-impl',
      mentorId: 'u-vasiliev', headId: 'u-petrova', startDate: '2026-08-05', endDate: '2026-11-04',
      stage: 'draft', changedAfterApproval: false, rejectionComment: null, draftSince: '2026-07-23',
      stageDates: { found: '2026-07-08', draft: '2026-07-23' }, closedAt: null, closeKind: null
    },
    {
      id: 't-kuznetsova', fullName: 'Кузнецова Мария Олеговна', position: 'Аналитик', departmentId: 'd-impl',
      mentorId: 'u-morozova', headId: 'u-petrova', startDate: '2026-08-01', endDate: '2026-10-31',
      stage: 'approval', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-01', draft: '2026-07-15', approval: '2026-07-22' }, closedAt: null, closeKind: null
    },
    {
      id: 't-smirnov', fullName: 'Смирнов Кирилл Викторович', position: 'Специалист по отчетности', departmentId: 'd-report',
      mentorId: 'u-morozova', headId: 'u-petrova', startDate: '2026-07-01', endDate: '2026-09-30',
      stage: 'active', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-06-10', draft: '2026-06-15', approval: '2026-06-18', active: '2026-07-01' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-popova', fullName: 'Попова Елизавета Андреевна', position: 'Аналитик', departmentId: 'd-gov',
      mentorId: 'u-vasiliev', headId: 'u-petrova', startDate: '2026-04-30', endDate: '2026-07-30',
      stage: 'closing', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-04-10', draft: '2026-04-15', approval: '2026-04-20', active: '2026-04-30', closing: '2026-07-16' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-orlova', fullName: 'Орлова Дарья Павловна', position: 'Руководитель проектов', departmentId: 'd-sub',
      mentorId: 'u-novikov', headId: 'u-petrova', startDate: '2026-06-15', endDate: '2026-09-15',
      stage: 'active', changedAfterApproval: true, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-05-25', draft: '2026-06-01', approval: '2026-06-05', active: '2026-06-15' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-lebedev', fullName: 'Лебедев Сергей Николаевич', position: 'Руководитель проектов', departmentId: 'd-fed',
      mentorId: 'u-ivanov-ii', headId: 'u-petrova', startDate: '2026-05-20', endDate: '2026-08-20',
      stage: 'active', changedAfterApproval: false, rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-05-04', draft: '2026-05-12', approval: '2026-05-14', active: '2026-05-20' },
      closedAt: null, closeKind: null
    }
  ];

  /* ---------- Справочник.ШаблоныАП ----------
   * У задач шаблона хранится смещение offsetDays от даты выхода стажёра.
   */
  var CORP = [
    { name: 'Ознакомиться с регламентами отдела', offsetDays: 2,
      description: 'Изучить положение об отделе, регламенты взаимодействия и порядок постановки задач' },
    { name: 'Пройти вводный курс по продукту', offsetDays: 5,
      description: 'Курс в системе дистанционного обучения: архитектура продукта, ключевые сценарии, итоговый тест' },
    { name: 'Настроить рабочее место и доступы', offsetDays: 1,
      description: 'Проверить доступ к почте, порталу, 1С:Документооборот и сетевым папкам отдела' },
    { name: 'Изучить корпоративный кодекс и правила внутреннего распорядка', offsetDays: 3,
      description: 'Ознакомиться с кодексом этики, режимом работы и правилами пропускного режима' },
    { name: 'Пройти инструктаж по охране труда и пожарной безопасности', offsetDays: 1,
      description: 'Вводный инструктаж проводит HR-менеджер, результат фиксируется в журнале инструктажей' },
    { name: 'Пройти курс по информационной безопасности', offsetDays: 7,
      description: 'Обязательный курс: работа с конфиденциальной информацией, фишинг, парольная политика' },
    { name: 'Познакомиться с командой отдела', offsetDays: 3,
      description: 'Встреча с коллегами, знакомство с ролями и текущими задачами команды' },
    { name: 'Встреча с руководителем стажировки: цели на испытательный срок', offsetDays: 5,
      description: 'Согласовать ожидания, критерии успешного прохождения стажировки и формат обратной связи' },
    { name: 'Изучить оргструктуру ЦАС и зоны ответственности подразделений', offsetDays: 10,
      description: 'Понять, к кому обращаться по типовым вопросам: закупки, ИТ-поддержка, юридический отдел, бухгалтерия' },
    { name: 'Пройти обучение по работе в 1С:Документооборот', offsetDays: 14,
      description: 'Создание и согласование документов, работа с задачами и уведомлениями' },
    { name: 'Составить отчёт по результатам недели', offsetDays: 30,
      description: 'Краткий отчёт наставнику: что сделано, что мешает, какие вопросы остались' },
    { name: 'Пройти промежуточную аттестацию по корпоративным стандартам', offsetDays: 45,
      description: 'Тестирование по регламентам, корпоративному кодексу и информационной безопасности' }
  ];
  function corp(indexes) {
    return indexes.map(function (i) {
      var t = CORP[i];
      return { block: 'corp', name: t.name, description: t.description, offsetDays: t.offsetDays };
    });
  }
  function spec(list) {
    return list.map(function (t) {
      return { block: 'spec', name: t[0], offsetDays: t[1], description: t[2] };
    });
  }

  var templates = [
    {
      id: 'tpl-pm', name: 'Руководитель проектов', position: 'Руководитель проектов',
      tasks: corp([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).concat(spec([
        ['Изучить методологию управления проектами компании', 14, 'Стандарт управления проектами ЦАС: жизненный цикл, роли, контрольные точки, отчётность'],
        ['Изучить портфель текущих проектов отдела', 21, 'Статусы, сроки, риски и ключевые заказчики по активным проектам'],
        ['Пройти курс по работе в системе управления проектами', 30, 'Планирование, ведение задач, трудозатраты и отчёты в корпоративной системе'],
        ['Подготовить анализ конкурентов', 40, 'Сравнить 3–5 компаний по предложениям для федеральных заказчиков, выводы для пилотного проекта'],
        ['Разработать устав пилотного проекта', 50, 'Цели, границы, участники, бюджет и критерии успеха пилотного проекта'],
        ['Составить план-график пилотного проекта', 60, 'Декомпозиция работ, ресурсы, контрольные точки, согласование с наставником'],
        ['Подготовить реестр рисков проекта', 70, 'Выявить риски, оценить вероятность и влияние, предложить меры реагирования'],
        ['Подготовить итоговую презентацию по результатам стажировки', 85, 'Результаты, выводы и план развития на следующий период']
      ]))
    },
    {
      id: 'tpl-analyst', name: 'Аналитик', position: 'Аналитик',
      tasks: corp([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).concat(spec([
        ['Изучить методологию бизнес-анализа, принятую в ЦАС', 10, 'Шаблоны требований, порядок их согласования, хранение артефактов анализа'],
        ['Изучить нотации BPMN и шаблоны описания процессов', 14, 'Нотация BPMN 2.0, корпоративные шаблоны схем и соглашения по оформлению'],
        ['Описать текущий процесс подразделения (AS-IS)', 30, 'Выбрать процесс вместе с наставником, описать его и согласовать с владельцем'],
        ['Подготовить требования к доработке учётной системы', 45, 'Функциональные требования к доработке по результатам описания процесса'],
        ['Провести интервью с ключевыми пользователями', 55, 'Подготовить вопросы, провести 3–5 интервью, оформить протоколы'],
        ['Подготовить итоговую презентацию по результатам стажировки', 85, 'Результаты, выводы и план развития на следующий период']
      ]))
    },
    {
      id: 'tpl-base', name: 'Базовый — для всех должностей', position: null,
      tasks: corp([0, 1, 2, 3, 4, 5, 6, 7, 8]).concat(spec([
        ['Изучить должностную инструкцию', 3, 'Обязанности, права и ответственность по должности, зоны взаимодействия'],
        ['Выполнить первое рабочее задание под руководством наставника', 30, 'Задание формулирует наставник, результат обсуждается на встрече'],
        ['Подготовить итоговый отчёт о стажировке', 80, 'Что освоено, какие задачи выполнены, что требует доработки']
      ]))
    }
  ];

  /* ---------- Документ.АдаптационнаяПрограмма и ТЧ Задачи ---------- */
  var programs = [];
  var tasks = [];
  var taskSeq = 1000;

  function tplById(id) {
    for (var i = 0; i < templates.length; i++) if (templates[i].id === id) return templates[i];
    return null;
  }

  // Задачи программы из шаблона. statuses — статус для каждой задачи шаблона по порядку,
  // extra — дополнительные задачи, overrides — {индекс: {поле: значение}}.
  function buildFromTemplate(programId, templateId, startDate, statuses, extra, overrides) {
    var list = tplById(templateId).tasks.concat(extra || []);
    list.forEach(function (t, i) {
      var task = {
        id: 'task-' + (taskSeq++), programId: programId, block: t.block, name: t.name,
        description: t.description, status: statuses[i] || 'not_started',
        deadline: addDays(startDate, t.offsetDays),
        reviewerId: null, observerIds: [], result: null,
        externalUrl: 'forus-team:task/' + taskSeq
      };
      var o = overrides && overrides[i];
      if (o) for (var k in o) task[k] = o[k];
      tasks.push(task);
    });
  }
  function repeat(status, n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(status);
    return a;
  }

  // --- Лебедев С. Н. — основной пример: 24 задачи, 14 выполнено / 7 в работе / 3 просрочено
  programs.push({
    id: 'pr-lebedev', traineeId: 't-lebedev', templateId: 'tpl-pm',
    defaultReviewerId: 'u-ivanov-ii', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-05-12T10:05', userId: 'u-ivanov-ii', action: 'АП создана по шаблону «Руководитель проектов»' },
      { at: '2026-05-13T16:40', userId: 'u-ivanov-ii', action: 'Добавлена задача «Принять участие в планёрках проектной команды»' },
      { at: '2026-05-14T09:30', userId: 'u-petrova',   action: 'АП отправлена на согласование' },
      { at: '2026-05-15T11:12', userId: 'u-novikov',   action: 'АП согласована' }
    ]
  });
  [
    // [блок, наименование, статус, срок, проверяющий, наблюдатели, результат, описание]
    ['corp', 'Ознакомиться с регламентами отдела', 'done', '2026-05-22', null, [], 'Регламенты изучены, вопросы разобраны с наставником', CORP[0].description],
    ['corp', 'Пройти вводный курс по продукту', 'done', '2026-05-27', null, [], 'Курс пройден, итоговый тест — 92%', CORP[1].description],
    ['corp', 'Настроить рабочее место и доступы', 'in_progress', '2026-07-31', null, [], null, 'Получить доступ к тестовому контуру заказчика и репозиторию проектной документации'],
    ['corp', 'Изучить корпоративный кодекс и правила внутреннего распорядка', 'done', '2026-05-23', null, [], null, CORP[3].description],
    ['corp', 'Пройти инструктаж по охране труда и пожарной безопасности', 'done', '2026-05-21', 'u-sokolova', ['u-sokolova'], 'Инструктаж пройден, запись в журнале № 214', CORP[4].description],
    ['corp', 'Пройти курс по информационной безопасности', 'done', '2026-05-29', 'u-sokolova', [], 'Сертификат о прохождении курса загружен', CORP[5].description],
    ['corp', 'Познакомиться с командой отдела', 'done', '2026-05-25', null, [], null, CORP[6].description],
    ['corp', 'Встреча с руководителем стажировки: цели на испытательный срок', 'done', '2026-05-26', 'u-petrova', [], 'Цели согласованы, протокол встречи в карточке задачи', CORP[7].description],
    ['corp', 'Изучить оргструктуру ЦАС и зоны ответственности подразделений', 'done', '2026-06-03', null, [], null, CORP[8].description],
    ['corp', 'Пройти обучение по работе в 1С:Документооборот', 'done', '2026-06-10', null, [], 'Обучение пройдено', CORP[9].description],
    ['corp', 'Изучить регламент согласования документов', 'done', '2026-06-17', null, [], null, 'Маршруты согласования договоров, служебных записок и приказов, сроки и ответственные'],
    ['corp', 'Составить отчёт по результатам недели', 'in_progress', '2026-07-31', null, [], null, CORP[10].description],
    ['corp', 'Пройти курс «Деловая переписка»', 'in_progress', '2026-08-07', null, [], null, 'Правила деловой переписки с заказчиками и подрядчиками, шаблоны писем'],
    ['corp', 'Пройти промежуточную аттестацию по корпоративным стандартам', 'in_progress', '2026-07-20', null, [], null, CORP[11].description],
    ['spec', 'Изучить методологию управления проектами компании', 'done', '2026-06-05', null, [], 'Методология изучена, конспект у наставника', 'Стандарт управления проектами ЦАС: жизненный цикл, роли, контрольные точки, отчётность'],
    ['spec', 'Изучить портфель текущих проектов отдела', 'done', '2026-06-15', null, [], null, 'Статусы, сроки, риски и ключевые заказчики по активным проектам'],
    ['spec', 'Пройти курс по работе в системе управления проектами', 'done', '2026-06-24', null, [], 'Курс пройден', 'Планирование, ведение задач, трудозатраты и отчёты в корпоративной системе'],
    ['spec', 'Принять участие в планёрках проектной команды', 'done', '2026-07-10', null, [], 'Посетил 6 планёрок, вёл протокол на двух', 'Еженедельные планёрки по проектам отдела: слушать, вести протокол, задавать вопросы'],
    ['spec', 'Подготовить анализ конкурентов', 'in_progress', '2026-07-22', null, ['u-petrova', 'u-novikov', 'u-fedorova'], null, 'Сравнить 3–5 компаний по предложениям для федеральных заказчиков, выводы для пилотного проекта'],
    ['spec', 'Разработать устав пилотного проекта', 'not_started', '2026-07-17', 'u-novikov', [], null, 'Цели, границы, участники, бюджет и критерии успеха пилотного проекта'],
    ['spec', 'Составить план-график пилотного проекта', 'in_progress', '2026-08-05', null, [], null, 'Декомпозиция работ, ресурсы, контрольные точки, согласование с наставником'],
    ['spec', 'Подготовить реестр рисков проекта', 'in_progress', '2026-08-10', null, [], null, 'Выявить риски, оценить вероятность и влияние, предложить меры реагирования'],
    ['spec', 'Провести встречу с заказчиком по пилотному проекту', 'in_progress', '2026-08-12', null, ['u-novikov'], null, 'Подготовить повестку, провести встречу вместе с наставником, разослать протокол'],
    ['spec', 'Подготовить итоговую презентацию по результатам стажировки', 'in_progress', '2026-08-18', 'u-petrova', [], null, 'Результаты, выводы и план развития на следующий период']
  ].forEach(function (r) {
    tasks.push({
      id: 'task-' + (taskSeq++), programId: 'pr-lebedev', block: r[0], name: r[1], description: r[7],
      status: r[2], deadline: r[3], reviewerId: r[4], observerIds: r[5], result: r[6],
      externalUrl: 'forus-team:task/' + taskSeq
    });
  });

  // --- Орлова Д. П. — active, 1 просрочка, изменена после согласования
  programs.push({
    id: 'pr-orlova', traineeId: 't-orlova', templateId: 'tpl-pm',
    defaultReviewerId: 'u-novikov', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-06-01T12:00', userId: 'u-novikov',  action: 'АП создана по шаблону «Руководитель проектов»' },
      { at: '2026-06-05T10:20', userId: 'u-petrova',  action: 'АП отправлена на согласование' },
      { at: '2026-06-08T15:45', userId: 'u-fedorova', action: 'АП согласована' },
      { at: '2026-07-21T14:20', userId: 'u-petrova',  action: 'Изменён срок задачи «Подготовить анализ конкурентов»: 25.07.26 → 28.07.26' }
    ]
  });
  buildFromTemplate('pr-orlova', 'tpl-pm', '2026-06-15',
    repeat('done', 11).concat(['in_progress'])                                   // корп. блок: 11 выполнено, аттестация в работе
      .concat(['done', 'done', 'in_progress', 'in_progress']),                   // спец.: курс по системе УП просрочен (15.07)
    null,
    { 12: { result: 'Конспект методологии согласован с наставником' }, 15: { deadline: '2026-07-28' } });

  // --- Попова Е. А. — closing, 22 из 23 задач
  programs.push({
    id: 'pr-popova', traineeId: 't-popova', templateId: 'tpl-analyst',
    defaultReviewerId: 'u-vasiliev', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-04-15T11:00', userId: 'u-vasiliev', action: 'АП создана по шаблону «Аналитик»' },
      { at: '2026-04-16T09:10', userId: 'u-vasiliev', action: 'Добавлено задач: 7' },
      { at: '2026-04-20T10:00', userId: 'u-petrova',  action: 'АП отправлена на согласование' },
      { at: '2026-04-22T17:30', userId: 'u-fedorova', action: 'АП согласована' }
    ]
  });
  buildFromTemplate('pr-popova', 'tpl-analyst', '2026-04-30',
    repeat('done', 15).concat(['in_progress']).concat(repeat('done', 7)),
    spec([
      ['Изучить нормативную базу по госзакупкам (44-ФЗ, 223-ФЗ)', 20, 'Основные процедуры, сроки и документы, с которыми работает отдел'],
      ['Подготовить описание процесса согласования договоров', 50, 'Схема процесса, участники, сроки, узкие места'],
      ['Провести анализ отчётности по госконтрактам', 60, 'Сверить отчётность по трём контрактам, подготовить замечания'],
      ['Подготовить предложения по оптимизации процесса', 70, 'Не менее трёх предложений с оценкой эффекта'],
      ['Согласовать требования с заказчиком', 75, 'Встреча с владельцем процесса, протокол согласования'],
      ['Подготовить пользовательскую инструкцию', 80, 'Инструкция для сотрудников отдела по доработанному процессу'],
      ['Участвовать в приёмочном тестировании', 84, 'Проверить доработку по сценариям, оформить замечания']
    ]),
    { 15: { deadline: '2026-07-29' }, 12: { result: 'Процесс описан и согласован с владельцем' } });

  // --- Смирнов К. В. — active, идёт по графику
  programs.push({
    id: 'pr-smirnov', traineeId: 't-smirnov', templateId: 'tpl-base',
    defaultReviewerId: 'u-morozova', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-06-15T14:00', userId: 'u-morozova', action: 'АП создана по шаблону «Базовый — для всех должностей»' },
      { at: '2026-06-18T10:30', userId: 'u-petrova',  action: 'АП отправлена на согласование' },
      { at: '2026-06-19T12:05', userId: 'u-fedorova', action: 'АП согласована' }
    ]
  });
  buildFromTemplate('pr-smirnov', 'tpl-base', '2026-07-01',
    repeat('done', 10).concat(['in_progress', 'not_started']));

  // --- Кузнецова М. О. — approval
  programs.push({
    id: 'pr-kuznetsova', traineeId: 't-kuznetsova', templateId: 'tpl-analyst',
    defaultReviewerId: 'u-morozova', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-07-15T13:25', userId: 'u-morozova', action: 'АП создана по шаблону «Аналитик»' },
      { at: '2026-07-22T09:50', userId: 'u-petrova',  action: 'АП отправлена на согласование' }
    ]
  });
  buildFromTemplate('pr-kuznetsova', 'tpl-analyst', '2026-08-01', []);

  // --- Сидоров А. И. — draft с 23.07.26
  programs.push({
    id: 'pr-sidorov', traineeId: 't-sidorov', templateId: 'tpl-base',
    defaultReviewerId: 'u-vasiliev', defaultObserverIds: ['u-petrova'],
    history: [
      { at: '2026-07-23T11:40', userId: 'u-vasiliev', action: 'АП создана по шаблону «Базовый — для всех должностей»' }
    ]
  });
  buildFromTemplate('pr-sidorov', 'tpl-base', '2026-08-05', []);

  /* ---------- ТЧ ЧекЛистПодготовки ---------- */
  var checklistTemplate = [
    { name: 'Создать заявку на трудоустройство в Bitrix',       responsibleRole: 'head',   offsetDays: -7, linkedDocType: 'bitrix' },
    { name: 'Создать заявку на выпуск пропуска (0911)',         responsibleRole: 'hr',     offsetDays: -5, linkedDocType: 'request0911' },
    { name: 'Создать заявку на создание учётной записи (0911)', responsibleRole: 'hr',     offsetDays: -5, linkedDocType: 'request0911' },
    { name: 'Подготовить рабочее место',                        responsibleRole: 'head',   offsetDays: -3, linkedDocType: null },
    { name: 'Подготовить технику',                              responsibleRole: 'head',   offsetDays: -3, linkedDocType: null },
    { name: 'Создать АП',                                       responsibleRole: 'mentor', offsetDays: -3, linkedDocType: 'program' },
    { name: 'Подготовить ПО и доступ к ресурсам, порталам',     responsibleRole: 'head',   offsetDays: -1, linkedDocType: null }
  ];
  var ROLE_TITLES = { head: 'Руководитель стажировки', hr: 'HR-менеджер', mentor: 'Наставник стажировки' };

  // Выполненные пункты: индекс пункта → [кто, когда, номер документа]
  var checklistDone = {
    't-ivanov':     { 0: ['u-petrova', '2026-07-21'], 2: ['u-sokolova', '2026-07-23', '0911-00118'] },
    't-belova':     {},
    't-sidorov':    { 0: ['u-petrova', '2026-07-20'], 5: ['u-vasiliev', '2026-07-23'] },
    't-kuznetsova': { 0: ['u-petrova', '2026-07-14'], 1: ['u-sokolova', '2026-07-24', '0911-00121'],
                      2: ['u-sokolova', '2026-07-24', '0911-00122'], 5: ['u-morozova', '2026-07-15'] }
  };
  var checklistFull = ['t-smirnov', 't-popova', 't-orlova', 't-lebedev'];

  var checklist = [];
  var clSeq = 1;
  var docSeq = 90;
  trainees.forEach(function (tr) {
    checklistTemplate.forEach(function (c, i) {
      var responsibleId = c.responsibleRole === 'head' ? tr.headId : c.responsibleRole === 'hr' ? HR_ID : tr.mentorId;
      var item = {
        id: 'cl-' + (clSeq++), traineeId: tr.id, name: c.name, responsibleRole: c.responsibleRole,
        responsibleId: responsibleId, offsetDays: c.offsetDays, done: false, doneBy: null, doneAt: null,
        linkedDocType: c.linkedDocType, linkedDocNumber: null
      };
      var d = checklistDone[tr.id] && checklistDone[tr.id][i];
      if (d) {
        item.done = true; item.doneBy = d[0]; item.doneAt = d[1]; item.linkedDocNumber = d[2] || null;
      } else if (checklistFull.indexOf(tr.id) >= 0) {
        item.done = true; item.doneBy = responsibleId;
        item.doneAt = addDays(tr.startDate, c.offsetDays - 1);
        if (c.linkedDocType === 'request0911') item.linkedDocNumber = '0911-000' + (docSeq++);
      }
      checklist.push(item);
    });
  });

  window.DATA = {
    TODAY: TODAY,
    CURRENT_USER_ID: CURRENT_USER_ID,
    REAPPROVAL_ON_CHANGE: REAPPROVAL_ON_CHANGE,
    LAG_THRESHOLD: LAG_THRESHOLD,
    CLOSE_AVAILABLE_DAYS: CLOSE_AVAILABLE_DAYS,
    HR_ID: HR_ID,
    ROLE_TITLES: ROLE_TITLES,
    departments: departments,
    users: users,
    trainees: trainees,
    programs: programs,
    tasks: tasks,
    checklist: checklist,
    checklistTemplate: checklistTemplate,
    templates: templates
    // notifications не хранятся — вычисляются getNotifications(trainee) в app.js
  };
})();
