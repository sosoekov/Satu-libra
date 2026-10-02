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
  var CURRENT_USER_ID = 'u-strygin';  // текущий пользователь — руководитель ЦАС (FT_8); демо-переключатель меняет его на HR-менеджера
  var LAG_THRESHOLD = 10;             // отставание задач от времени, п.п.
  var CLOSE_AVAILABLE_DAYS = 14;      // за сколько дней до окончания доступно «Начать закрытие»

  /* ---------- Справочник.Подразделения ---------- */
  /* ---------- Справочник.Подразделения ----------
   * responsibleId — ответственный за подразделение (FT_6); если не задан, берётся у вышестоящего подразделения.
   */
  // FT_8: структура ЦАС и ответственные — по данным заказчика. FT_17: полная структура предприятия (группы — четвёртый уровень);
  // ответственные за «Отдел корпоративных проектов» и «Отдел отчетности, НСИ и бизнес-процессов» — по списку сотрудников заказчика
  var departments = [
    { id: 'd-cas',    name: 'ЦАС',                                               parentId: null,     responsibleId: 'u-strygin' },
    { id: 'd-admin',  name: 'Администрация',                                     parentId: 'd-cas' },
    { id: 'd-corp',   name: 'Отдел корпоративного сопровождения',                parentId: 'd-cas',  responsibleId: 'u-kladova' },
    { id: 'd-doc',    name: 'Направление по автоматизации Документооборота',     parentId: 'd-corp', responsibleId: 'u-podyniglazov' },
    { id: 'd-doc-big',  name: 'Группа крупных внедрений по цифровизации бизнес-процессов', parentId: 'd-doc' },
    { id: 'd-doc-arch', name: 'Группа развития направлений "Архив" и "НСИ"',     parentId: 'd-doc' },
    { id: 'd-doc-mid',  name: 'Группа средних внедрений 1СДО',                   parentId: 'd-doc' },
    { id: 'd-uss',    name: 'Направление по внедрению, сопровождению и развитию учетных систем управления', parentId: 'd-corp', responsibleId: 'u-sizova' },
    { id: 'd-uss-zup',  name: 'Проекты по ЗУП и транспорту',                     parentId: 'd-uss' },
    { id: 'd-uss-erp',  name: 'Проекты по сопровождению и развитию ERP систем',  parentId: 'd-uss' },
    { id: 'd-cproj',  name: 'Отдел корпоративных проектов',                      parentId: 'd-cas',  responsibleId: 'u-moskvicheva-na' },
    { id: 'd-oper',   name: 'Направление оперативного учета',                    parentId: 'd-cproj', responsibleId: 'u-maznichenko' },
    { id: 'd-prod',   name: 'Направление производственного учета, учета себестоимости и затрат', parentId: 'd-cproj', responsibleId: 'u-tsumankov' },
    { id: 'd-cdev',   name: 'Направление разработки в корп. секторе',            parentId: 'd-cproj' },
    { id: 'd-reg',    name: 'Направление регламентированного учета',             parentId: 'd-cproj' },
    { id: 'd-cmgmt',  name: 'Направление управления и администрирования',        parentId: 'd-cproj' },
    { id: 'd-fin',    name: 'Направление финансового учета',                    parentId: 'd-cproj', responsibleId: 'u-konstantinov' },
    { id: 'd-report', name: 'Отдел отчетности, НСИ и бизнес-процессов',          parentId: 'd-cas',  responsibleId: 'u-konopatkina' },
    { id: 'd-rmeth',  name: 'Направление методологии стандартизации учетных процессов и аналитической отчетности', parentId: 'd-report' },
    { id: 'd-rdev',   name: 'Направление разработки',                           parentId: 'd-report' },
    { id: 'd-gov',    name: 'Отдел по работе с государственным сектором',        parentId: 'd-cas',  responsibleId: 'u-vorfolomeeva' },
    { id: 'd-gadm',   name: 'Направление администрирования проектов',            parentId: 'd-gov',  responsibleId: 'u-kustavinova' },
    { id: 'd-gadm-east', name: 'Группа администраторов проектов Восток',         parentId: 'd-gadm' },
    { id: 'd-gadm-west', name: 'Группа администраторов проектов Запад',          parentId: 'd-gadm' },
    { id: 'd-gacc',   name: 'Направление бухгалтерского учета Гос. учреждений',  parentId: 'd-gov',  responsibleId: 'u-mazurova' },
    { id: 'd-gpay',   name: 'Направление зарплаты и кадров Гос. учреждений',     parentId: 'd-gov',  responsibleId: 'u-gorbunova' },
    { id: 'd-gdev',   name: 'Направление разработки в Гос. секторе',             parentId: 'd-gov' },
    { id: 'd-gpm',    name: 'Направление управления Гос. проектами',             parentId: 'd-gov' },
    { id: 'd-gpm-east', name: 'Группа Руководителей проектов Восток',            parentId: 'd-gpm',  responsibleId: 'u-kononenko' },
    { id: 'd-gpm-west', name: 'Группа Руководителей проектов Запад',             parentId: 'd-gpm' },
    { id: 'd-fed',    name: 'Отдел по работе с федеральными проектами',          parentId: 'd-cas' },
    { id: 'd-farch',  name: 'Направление архитектуры и интеграций',              parentId: 'd-fed' },
    { id: 'd-facc',   name: 'Направление бухгалтерского учета федеральных проектов', parentId: 'd-fed' },
    { id: 'd-fpay',   name: 'Направление зарплаты и кадров федеральных проектов', parentId: 'd-fed' },
    { id: 'd-fdev',   name: 'Направление разработки и прикладного ПО',           parentId: 'd-fed' },
    { id: 'd-ffhd',   name: 'Направление разработки ФХД',                        parentId: 'd-fed' },
    { id: 'd-fpm',    name: 'Направление управления проектами',                  parentId: 'd-fed' },
    { id: 'd-exp',    name: 'Отдел экспертизы и внутренних проектов',            parentId: 'd-cas' },
    { id: 'd-pmo',    name: 'Отдел Проектный офис',                              parentId: 'd-cas' },
    // Нет в структуре заказчика (FT_17) — оставлен для заявки ЗП-000043 (FT_15); вопрос заказчику
    { id: 'd-sub',    name: 'Отдел по работе с субподрядчиками',                 parentId: 'd-cas',  responsibleId: 'u-dryamin' }
  ];

  /* ---------- Справочник.Пользователи / ФизическиеЛица ---------- */
  var users = [
    { id: 'u-strygin',      fullName: 'Стрыгин Константин Михайлович',   role: 'Заместитель руководителя ЦАС', departmentId: 'd-cas' },
    { id: 'u-kladova',      fullName: 'Кладова Яна Сергеевна',           role: 'Руководитель отдела', departmentId: 'd-corp' },     // FT_9: руководитель Отдела корпоративного сопровождения
    { id: 'u-podyniglazov', fullName: 'Подыниглазов Артем Алексеевич',   role: 'Руководитель направления', departmentId: 'd-doc' },
    { id: 'u-sizova',       fullName: 'Сизова Анна Владиславовна',       role: 'Руководитель направления', departmentId: 'd-uss' },
    { id: 'u-gavrilkina',   fullName: 'Гаврилкина Татьяна Александровна', role: 'Сотрудник', departmentId: 'd-cproj' },
    { id: 'u-maznichenko',  fullName: 'Мазниченко Екатерина Александровна', role: 'Руководитель направления', departmentId: 'd-oper' },
    { id: 'u-tsumankov',    fullName: 'Цуманков Николай Александрович',  role: 'Руководитель направления', departmentId: 'd-prod' },
    { id: 'u-glebov',       fullName: 'Глебов Дмитрий Сергеевич',        role: 'Сотрудник', departmentId: 'd-report' },
    { id: 'u-vorfolomeeva', fullName: 'Ворфоломеева Наталья Юрьевна',    role: 'Руководитель отдела', departmentId: 'd-gov' },
    { id: 'u-kustavinova',  fullName: 'Куставинова Ксения Дмитриевна',   role: 'Руководитель направления', departmentId: 'd-gadm' },
    { id: 'u-mazurova',     fullName: 'Мазурова Ольга Васильевна',       role: 'Руководитель направления', departmentId: 'd-gacc' },
    { id: 'u-gorbunova',    fullName: 'Горбунова Анна Юрьевна',          role: 'Руководитель направления', departmentId: 'd-gpay' },
    { id: 'u-dryamin',      fullName: 'Дрямин Фёдор Викторович',         role: 'Руководитель отдела', departmentId: 'd-sub' },
    { id: 'u-sudomoykina',  fullName: 'Судомойкина Анна Николаевна',     role: 'HR-менеджер', departmentId: null },
    { id: 'u-kondurova',    fullName: 'Кондурова Алла Ивановна',         role: 'HR-менеджер', departmentId: null },
    { id: 'u-andreeva',     fullName: 'Андреева Елизавета Ивановна',     role: 'HR-менеджер', departmentId: null },
    { id: 'u-samsonova',    fullName: 'Самсонова Дарья Николаевна',      role: 'HR-менеджер', departmentId: null },
    { id: 'u-baeva',        fullName: 'Баева Диана Владиславовна',       role: 'КШ', departmentId: null },
    // FT_17: сотрудники по списку заказчика (должность — в role)
    { id: 'u-veselov-ae', fullName: 'Веселов Андрей Евгеньевич', role: 'Системный аналитик', departmentId: 'd-doc-mid' },
    { id: 'u-veselov-sv', fullName: 'Веселов Сергей Владимирович', role: 'Руководитель проектов', departmentId: 'd-fpm' },
    { id: 'u-grigoriev-ay', fullName: 'Григорьев Антон Юрьевич', role: 'Системный аналитик', departmentId: 'd-fin' },
    { id: 'u-gromova', fullName: 'Громова Анастасия Юрьевна', role: 'Системный аналитик', departmentId: 'd-gpay' },
    { id: 'u-dabaeva', fullName: 'Дабаева Баира Цыреннордобовна', role: 'Администратор проектов', departmentId: 'd-gadm-east' },
    { id: 'u-darvin', fullName: 'Дарвин Денис Владиславович', role: 'Системный аналитик', departmentId: 'd-reg' },
    { id: 'u-ibragimova', fullName: 'Ибрагимова Диана Борисовна', role: 'Системный аналитик', departmentId: 'd-prod' },
    { id: 'u-ivanov-vy', fullName: 'Иванов Владислав Юрьевич', role: 'Системный аналитик', departmentId: 'd-rmeth' },
    { id: 'u-ivanova-ln', fullName: 'Иванова Лариса Николаевна', role: 'Системный аналитик', departmentId: 'd-gpay' },
    { id: 'u-konkalevskaya', fullName: 'Конкалевская Екатерина Игоревна', role: 'Системный аналитик', departmentId: 'd-doc-mid' },
    { id: 'u-kononenko', fullName: 'Кононенко Екатерина Игоревна', role: 'Руководитель группы', departmentId: 'd-gpm-east' },
    { id: 'u-konopatkina', fullName: 'Конопаткина Анастасия Сергеевна', role: 'Руководитель отдела', departmentId: 'd-report' },
    { id: 'u-konstantinov', fullName: 'Константинов Александр Сергеевич', role: 'Руководитель направления', departmentId: 'd-fin' },
    { id: 'u-litvinova', fullName: 'Литвинова Надежда Николаевна', role: 'Системный аналитик', departmentId: 'd-uss-erp' },
    { id: 'u-likhacheva', fullName: 'Лихачёва Виктория Николаевна', role: 'Технический писатель', departmentId: 'd-fpm' },
    { id: 'u-lobanov', fullName: 'Лобанов Станислав Иванович', role: 'Инженер-программист', departmentId: 'd-doc-mid' },
    { id: 'u-moskvicheva-na', fullName: 'Москвичева Нина Артуровна', role: 'Руководитель отдела корпоративных проектов', departmentId: 'd-cproj' },
    { id: 'u-moskvicheva-ts', fullName: 'Москвичева Татьяна Сергеевна', role: 'Системный аналитик', departmentId: 'd-exp' },
    { id: 'u-mokhnachev', fullName: 'Мохначев Артем Александрович', role: 'Инженер-программист', departmentId: 'd-uss-erp' },
    { id: 'u-naledina', fullName: 'Наледина Ирина Анатольевна', role: 'Системный аналитик', departmentId: 'd-gacc' },
    { id: 'u-nam', fullName: 'Нам Артём Игоревич', role: 'Инженер-программист', departmentId: 'd-ffhd' }
  ];
  var HR_IDS = ['u-sudomoykina', 'u-kondurova', 'u-andreeva', 'u-samsonova'];   // HR-менеджеры (FT_8: у стажёра — свой, hrId)
  var CAS_HEAD_ID = 'u-strygin';  // заместитель руководителя ЦАС — шаг «Утверждение» маршрута согласования АП (FT_8, FT_9)
  var KSH_ID = 'u-baeva';         // сотрудник КШ — ответственный за пункт «Подготовить документы для оформления ДМС» (фаза 10, 5.2)

  /* ---------- Стажёры (Справочник.Сотрудники + РегистрСведений.СтатусыСтажеров) ----------
   * stageDates — даты начала этапов (для степпера), closedAt / closeKind ('passed'|'failed'|'cancelled') — для этапа closed.
   * FT_8: headId — руководитель стажировки (руководитель направления стажёра), mentorId — наставник (руководитель соседнего
   * направления того же отдела), hrId — HR-менеджер стажёра.
   */
  // Фаза 11, 4.2: positionFamily — 'analyst' | 'programmer' | 'erp_analyst' | null; qualificationLevel — строка или null
  // Допустимые уровни: analyst — А1–А7 (кириллица), programmer — П1–П7, erp_analyst — AERP1–AERP5 (латиница)
  var QUALIFICATION_LEVELS = {
    analyst: ['А1', 'А2', 'А3', 'А4', 'А5', 'А6', 'А7'],
    programmer: ['П1', 'П2', 'П3', 'П4', 'П5', 'П6', 'П7'],
    erp_analyst: ['AERP1', 'AERP2', 'AERP3', 'AERP4', 'AERP5']
  };
  var trainees = [
    {
      id: 't-ivanov', fullName: 'Иванов Петр Сергеевич', position: 'Аналитик', positionFamily: 'analyst', qualificationLevel: 'А2',
      departmentId: 'd-doc',
      mentorId: 'u-sizova', headId: 'u-podyniglazov', hrId: 'u-sudomoykina', startDate: '2026-07-29', endDate: '2026-10-28',
      stage: 'found', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-10' }, closedAt: null, closeKind: null
    },
    {
      id: 't-belova', fullName: 'Белова Анна Дмитриевна', position: 'Программист', positionFamily: 'programmer', qualificationLevel: 'П2',
      departmentId: 'd-uss',
      mentorId: 'u-podyniglazov', headId: 'u-sizova', hrId: 'u-sudomoykina', startDate: '2026-08-03', endDate: '2026-11-02',
      stage: 'found', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-17' }, closedAt: null, closeKind: null
    },
    {
      id: 't-sidorov', fullName: 'Сидоров Алексей Игоревич', position: 'Аналитик ERP', positionFamily: 'erp_analyst', qualificationLevel: 'AERP3',
      departmentId: 'd-oper',
      mentorId: 'u-tsumankov', headId: 'u-maznichenko', hrId: 'u-kondurova', startDate: '2026-08-05', endDate: '2026-11-04',
      stage: 'draft', rejectionComment: null, draftSince: '2026-07-23',
      stageDates: { found: '2026-07-08', draft: '2026-07-23' }, closedAt: null, closeKind: null
    },
    {
      id: 't-kuznetsova', fullName: 'Кузнецова Мария Олеговна', position: 'Аналитик', positionFamily: 'analyst', qualificationLevel: 'А4',
      departmentId: 'd-prod',
      mentorId: 'u-maznichenko', headId: 'u-tsumankov', hrId: 'u-kondurova', startDate: '2026-08-01', endDate: '2026-10-31',
      stage: 'approval', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-01', draft: '2026-07-15', approval: '2026-07-22' }, closedAt: null, closeKind: null
    },
    {
      id: 't-smirnov', fullName: 'Смирнов Кирилл Викторович', position: 'Специалист по отчетности', positionFamily: null, qualificationLevel: null,
      departmentId: 'd-oper',
      mentorId: 'u-tsumankov', headId: 'u-maznichenko', hrId: 'u-andreeva', startDate: '2026-07-01', endDate: '2026-09-30',
      stage: 'active', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-06-10', draft: '2026-06-15', approval: '2026-06-18', active: '2026-07-01' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-popova', fullName: 'Попова Елизавета Андреевна', position: 'Аналитик', positionFamily: 'analyst', qualificationLevel: 'А5',
      departmentId: 'd-gacc',
      mentorId: 'u-gorbunova', headId: 'u-mazurova', hrId: 'u-andreeva', startDate: '2026-04-30', endDate: '2026-07-30',
      stage: 'closing', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-04-10', draft: '2026-04-15', approval: '2026-04-20', active: '2026-04-30', closing: '2026-07-16' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-orlova', fullName: 'Орлова Дарья Павловна', position: 'Руководитель проектов', positionFamily: null, qualificationLevel: null,
      departmentId: 'd-gpay',
      mentorId: 'u-kustavinova', headId: 'u-gorbunova', hrId: 'u-samsonova', startDate: '2026-06-15', endDate: '2026-09-15',
      stage: 'active', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-05-25', draft: '2026-06-01', approval: '2026-06-05', active: '2026-06-15' },
      closedAt: null, closeKind: null
    },
    {
      id: 't-lebedev', fullName: 'Лебедев Сергей Николаевич', position: 'Руководитель проектов', positionFamily: null, qualificationLevel: null,
      departmentId: 'd-gadm',
      mentorId: 'u-mazurova', headId: 'u-kustavinova', hrId: 'u-samsonova', startDate: '2026-05-20', endDate: '2026-08-20',
      stage: 'active', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-05-04', draft: '2026-05-12', approval: '2026-05-14', active: '2026-05-20' },
      closedAt: null, closeKind: null
    },
    // FT_13: стажёр, которому ещё не назначена дата выхода (startDate и endDate — null): сроки чек-листа не определены, АП создать нельзя
    {
      id: 't-grigoriev', fullName: 'Григорьев Максим Олегович', position: 'Программист', positionFamily: 'programmer', qualificationLevel: 'П1',
      departmentId: 'd-doc',
      mentorId: 'u-sizova', headId: 'u-podyniglazov', hrId: 'u-kondurova', startDate: null, endDate: null,
      stage: 'found', rejectionComment: null, draftSince: null,
      stageDates: { found: '2026-07-22' }, closedAt: null, closeKind: null
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
    { name: 'Пройти инструктаж по охране труда и пожарной безопасности', offsetDays: 1, reviewerId: 'u-sudomoykina',
      description: 'Вводный инструктаж проводит HR-менеджер, результат фиксируется в журнале инструктажей' },
    { name: 'Пройти курс по информационной безопасности', offsetDays: 7, reviewerId: 'u-sudomoykina',
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
    { name: 'Пройти промежуточную аттестацию по корпоративным стандартам', offsetDays: 45, reviewerId: 'u-sudomoykina',
      description: 'Тестирование по регламентам, корпоративному кодексу и информационной безопасности' }
  ];
  function corp(indexes) {
    return indexes.map(function (i) {
      var t = CORP[i];
      return { block: 'corp', name: t.name, description: t.description, offsetDays: t.offsetDays, reviewerId: t.reviewerId || null };
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
    history: [
      { at: '2026-05-12T10:05', userId: 'u-mazurova', action: 'АП создана по шаблону «Руководитель проектов»' },
      { at: '2026-05-13T16:40', userId: 'u-mazurova', action: 'Добавлена задача «Принять участие в планёрках проектной команды»' },
      { at: '2026-05-14T09:30', userId: 'u-kustavinova', action: 'АП отправлена на согласование' },
      { at: '2026-05-15T11:12', userId: 'u-samsonova', action: 'АП согласована' }
    ]
  });
  [
    // [блок, наименование, статус, срок, проверяющий, наблюдатели, результат, описание]
    ['corp', 'Ознакомиться с регламентами отдела', 'done', '2026-05-22', null, [], 'Регламенты изучены, вопросы разобраны с наставником', CORP[0].description],
    ['corp', 'Пройти вводный курс по продукту', 'done', '2026-05-27', null, [], 'Курс пройден, итоговый тест — 92%', CORP[1].description],
    ['corp', 'Настроить рабочее место и доступы', 'in_progress', '2026-07-31', null, [], null, 'Получить доступ к тестовому контуру заказчика и репозиторию проектной документации'],
    ['corp', 'Изучить корпоративный кодекс и правила внутреннего распорядка', 'done', '2026-05-23', null, [], null, CORP[3].description],
    ['corp', 'Пройти инструктаж по охране труда и пожарной безопасности', 'done', '2026-05-21', 'u-samsonova', ['u-samsonova'], 'Инструктаж пройден, запись в журнале № 214', CORP[4].description],
    ['corp', 'Пройти курс по информационной безопасности', 'done', '2026-05-29', 'u-samsonova', [], 'Сертификат о прохождении курса загружен', CORP[5].description],
    ['corp', 'Познакомиться с командой отдела', 'done', '2026-05-25', null, [], null, CORP[6].description],
    ['corp', 'Встреча с руководителем стажировки: цели на испытательный срок', 'done', '2026-05-26', 'u-kustavinova', [], 'Цели согласованы, протокол встречи в карточке задачи', CORP[7].description],
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
    ['spec', 'Подготовить анализ конкурентов', 'in_progress', '2026-07-22', null, ['u-kustavinova', 'u-mazurova', 'u-vorfolomeeva'], null, 'Сравнить 3–5 компаний по предложениям для федеральных заказчиков, выводы для пилотного проекта'],
    ['spec', 'Разработать устав пилотного проекта', 'not_started', '2026-07-17', 'u-mazurova', [], null, 'Цели, границы, участники, бюджет и критерии успеха пилотного проекта'],
    ['spec', 'Составить план-график пилотного проекта', 'in_progress', '2026-08-05', null, [], null, 'Декомпозиция работ, ресурсы, контрольные точки, согласование с наставником'],
    ['spec', 'Подготовить реестр рисков проекта', 'in_progress', '2026-08-10', null, [], null, 'Выявить риски, оценить вероятность и влияние, предложить меры реагирования'],
    ['spec', 'Провести встречу с заказчиком по пилотному проекту', 'in_progress', '2026-08-12', null, ['u-mazurova'], null, 'Подготовить повестку, провести встречу вместе с наставником, разослать протокол'],
    ['spec', 'Подготовить итоговую презентацию по результатам стажировки', 'in_progress', '2026-08-18', 'u-kustavinova', [], null, 'Результаты, выводы и план развития на следующий период']
  ].forEach(function (r) {
    tasks.push({
      id: 'task-' + (taskSeq++), programId: 'pr-lebedev', block: r[0], name: r[1], description: r[7],
      status: r[2], deadline: r[3], reviewerId: r[4], observerIds: r[5], result: r[6],
      externalUrl: 'forus-team:task/' + taskSeq
    });
  });

  // --- Орлова Д. П. — active, 1 просрочка
  programs.push({
    id: 'pr-orlova', traineeId: 't-orlova', templateId: 'tpl-pm',
    history: [
      { at: '2026-06-01T12:00', userId: 'u-kustavinova',  action: 'АП создана по шаблону «Руководитель проектов»' },
      { at: '2026-06-05T10:20', userId: 'u-gorbunova', action: 'АП отправлена на согласование' },
      { at: '2026-06-08T15:45', userId: 'u-samsonova', action: 'АП согласована' },
      { at: '2026-07-21T14:20', userId: 'u-gorbunova', action: 'Изменён срок задачи «Подготовить анализ конкурентов»: 25.07.26 → 28.07.26' }
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
    history: [
      { at: '2026-04-15T11:00', userId: 'u-gorbunova', action: 'АП создана по шаблону «Аналитик»' },
      { at: '2026-04-16T09:10', userId: 'u-gorbunova', action: 'Добавлено задач: 7' },
      { at: '2026-04-20T10:00', userId: 'u-mazurova',  action: 'АП отправлена на согласование' },
      { at: '2026-04-22T17:30', userId: 'u-andreeva',  action: 'АП согласована' }
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
    history: [
      { at: '2026-06-15T14:00', userId: 'u-tsumankov', action: 'АП создана по шаблону «Базовый — для всех должностей»' },
      { at: '2026-06-18T10:30', userId: 'u-maznichenko',  action: 'АП отправлена на согласование' },
      { at: '2026-06-19T12:05', userId: 'u-andreeva',  action: 'АП согласована' }
    ]
  });
  // FT_10: задача, отмеченная стажёром «Выполнено», ждёт проверки у проверяющего (Стрыгин)
  buildFromTemplate('pr-smirnov', 'tpl-base', '2026-07-01',
    repeat('done', 10).concat(['review', 'not_started']), null, { 10: { reviewerId: 'u-strygin', result: 'Задание выполнено, результат приложен в карточке задачи', doneBy: 't-smirnov', doneAt: '2026-07-24T15:40', reviewRequestedAt: '2026-07-24T15:40' } });

  // --- Кузнецова М. О. — approval
  programs.push({
    id: 'pr-kuznetsova', traineeId: 't-kuznetsova', templateId: 'tpl-analyst',
    history: [
      { at: '2026-07-15T13:25', userId: 'u-maznichenko', action: 'АП создана по шаблону «Аналитик»' },
      { at: '2026-07-22T09:50', userId: 'u-tsumankov',  action: 'АП отправлена на согласование' }
    ]
  });
  buildFromTemplate('pr-kuznetsova', 'tpl-analyst', '2026-08-01', []);

  // --- Сидоров А. И. — draft с 23.07.26
  programs.push({
    id: 'pr-sidorov', traineeId: 't-sidorov', templateId: 'tpl-base',
    history: [
      { at: '2026-07-23T11:40', userId: 'u-tsumankov', action: 'АП создана по шаблону «Базовый — для всех должностей»' }
    ]
  });
  buildFromTemplate('pr-sidorov', 'tpl-base', '2026-08-05', []);

  /* ---------- ТЧ ЧекЛистПодготовки ---------- */
  /* ---------- FT_20: справочник «Библиотека ссылок» ----------
   * linkGroups: id, name — группы справочника. linkLibrary: id, name (Название), groupId (Группа), url (Ссылка).
   * Адреса хранятся без схемы — в прототипе нет внешних адресов. В задачах АП, задачах шаблонов и пунктах чек-листов
   * ссылки для ознакомления — [{linkId, comment}]. Регламенты, кодекс и курсы перенесены из ссылок задач (FT_2).
   */
  var linkGroups = [
    { id: 'lg-portal', name: 'Корпоративный портал' },
    { id: 'lg-docs',   name: 'Регламенты и документы' },
    { id: 'lg-learn',  name: 'Обучение' },
    { id: 'lg-ext',    name: 'Внешние системы' }
  ];
  var linkLibrary = [
    { id: 'lnk-1',  name: 'Корпоративный портал ЦАС',               groupId: 'lg-portal', url: 'portal.cas.local' },
    { id: 'lnk-2',  name: 'Структура предприятия',                  groupId: 'lg-portal', url: 'portal.cas.local/structure' },
    { id: 'lnk-3',  name: 'Телефонный справочник',                  groupId: 'lg-portal', url: 'portal.cas.local/phones' },
    { id: 'lnk-4',  name: 'Регламенты на портале',                  groupId: 'lg-docs',   url: 'portal.cas.local/docs/reglamenty' },
    { id: 'lnk-5',  name: 'Корпоративный кодекс',                   groupId: 'lg-docs',   url: 'portal.cas.local/docs/kodeks' },
    { id: 'lnk-6',  name: 'Инструкция по охране труда',             groupId: 'lg-docs',   url: 'portal.cas.local/docs/ohrana-truda' },
    { id: 'lnk-7',  name: 'Политика информационной безопасности',   groupId: 'lg-docs',   url: 'portal.cas.local/docs/ib-policy' },
    { id: 'lnk-8',  name: 'Памятка стажёра',                        groupId: 'lg-docs',   url: 'portal.cas.local/docs/pamyatka-stazhera' },
    { id: 'lnk-9',  name: 'База знаний ЦАС',                        groupId: 'lg-learn',  url: 'wiki.cas.local' },
    { id: 'lnk-10', name: 'Forus Team',                             groupId: 'lg-ext',    url: 'forus.e-queo.online' },
    { id: 'lnk-11', name: 'Bitrix24: заявки на трудоустройство',    groupId: 'lg-ext',    url: 'bitrix.cas.local/hr/requests' },
    { id: 'lnk-12', name: 'Сервис заявок 0911',                     groupId: 'lg-ext',    url: '0911.cas.local' },
    { id: 'lnk-13', name: 'СИТ: заявки',                            groupId: 'lg-ext',    url: 'sit.cas.local' }
  ];
  function libLinks(ids) { return (ids || []).map(function (id) { return { linkId: id, comment: '' }; }); }

  /* ---------- ТЧ ЧекЛистПодготовки ----------
   * FT_20: пункт чек-листа — задача: status (как у задачи АП), description, links, reviewerId, observerIds, log.
   * Проверяющий и наблюдатели по умолчанию пустые. done / inWork — производные от status.
   */
  var checklistTemplate = [
    { name: 'Создать заявку на трудоустройство в Bitrix',       responsibleRole: 'head',   offsetDays: -7, linkedDocType: 'bitrix',
      description: 'Заявка на трудоустройство стажёра создаётся в Bitrix24 по форме отдела кадров.', links: ['lnk-11'] },
    { name: 'Создать заявку на выпуск пропуска (0911)',         responsibleRole: 'hr',     offsetDays: -5, linkedDocType: 'request0911',
      description: 'Заявка на выпуск пропуска создаётся в сервисе заявок 0911.', links: ['lnk-12'] },
    { name: 'Создать заявку на создание учётной записи (0911)', responsibleRole: 'hr',     offsetDays: -5, linkedDocType: 'request0911',
      description: 'Заявка на создание учётной записи создаётся в сервисе заявок 0911.', links: ['lnk-12'] },
    { name: 'Подготовить рабочее место',                        responsibleRole: 'head',   offsetDays: -3, linkedDocType: null,
      description: 'Стол и кресло рядом с наставником, доступ в помещение.', links: [] },
    { name: 'Подготовить технику',                              responsibleRole: 'head',   offsetDays: -3, linkedDocType: null,
      description: 'Ноутбук, монитор, гарнитура.', links: ['lnk-12'] },
    { name: 'Создать АП',                                       responsibleRole: 'mentor', offsetDays: -3, linkedDocType: 'program',
      description: 'Отмечается автоматически, когда для стажёра создана адаптационная программа.', links: [] },
    { name: 'Подготовить ПО и доступ к ресурсам, порталам',     responsibleRole: 'head',   offsetDays: -1, linkedDocType: null,
      description: 'Учётные записи в 1С, Forus Team и на корпоративном портале.', links: ['lnk-1', 'lnk-10'] }
  ];
  var ROLE_TITLES = { head: 'Руководитель стажировки', hr: 'HR-менеджер', mentor: 'Наставник стажировки', trainee: 'Стажёр', ksh: 'КШ' };

  /* ---------- ТЧ ЧекЛистЗакрытия (фаза 10, 5.2) ----------
   * closureChecklist: id, traineeId, name, responsibleRole, responsibleId, offsetDays (от endDate: отрицательное — до окончания,
   * положительное — после), optional, done, doneBy, doneAt, linkedDocType (null | 'forus' | 'sit').
   * Роль «Стажёр» — сам стажёр: responsibleId = id стажёра. Создаётся при переходе в «Закрытие» (buildClosureChecklist).
   */
  var closureChecklistTemplate = [
    { name: 'Заполнить отчёт и матрицы в Forus Team',                                    responsibleRole: 'head',    offsetDays: -7, optional: false, linkedDocType: 'forus', links: ['lnk-10'] },
    { name: 'Заполнить отчёт и матрицы в Forus Team',                                    responsibleRole: 'trainee', offsetDays: -7, optional: false, linkedDocType: 'forus', links: ['lnk-10'] },
    { name: 'Провести мероприятие по закрытию стажировки',                              responsibleRole: 'hr',      offsetDays: -3, optional: false, linkedDocType: null },
    { name: 'Оставить заявку о закрытии стажировки в СИТ',                              responsibleRole: 'hr',      offsetDays: 0,  optional: false, linkedDocType: 'sit', links: ['lnk-13'] },
    { name: 'Оставить заявки на открытие доступа к дополнительным материалам',          responsibleRole: 'head',    offsetDays: 0,  optional: true,  linkedDocType: null, links: ['lnk-12'] },
    { name: 'Подготовить список сотрудников, закрывших стажировку, и отправить его в КШ', responsibleRole: 'hr',     offsetDays: 3,  optional: false, linkedDocType: null },
    { name: 'Подготовить документы для оформления ДМС',                                 responsibleRole: 'ksh',     offsetDays: 5,  optional: false, linkedDocType: null }
  ];
  var closureSeq = 1;
  function buildClosureChecklist(tr) {
    return closureChecklistTemplate.map(function (c) {
      var responsibleId = c.responsibleRole === 'head' ? tr.headId : c.responsibleRole === 'hr' ? tr.hrId :
        c.responsibleRole === 'ksh' ? KSH_ID : c.responsibleRole === 'trainee' ? tr.id : tr.mentorId;
      return { id: 'cc-' + (closureSeq++), traineeId: tr.id, name: c.name, responsibleRole: c.responsibleRole, responsibleId: responsibleId,
        offsetDays: c.offsetDays, optional: c.optional, done: false, doneBy: null, doneAt: null, linkedDocType: c.linkedDocType,
        status: 'not_started', description: c.description || '', links: libLinks(c.links), reviewerId: null, observerIds: [], log: [] };
    });
  }
  var closureChecklist = [];

  // Выполненные пункты: индекс пункта → [кто, когда, номер документа]
  var checklistDone = {
    't-ivanov':     { 0: ['u-podyniglazov', '2026-07-21'], 2: ['u-sudomoykina', '2026-07-23', '0911-00118'] },
    't-belova':     {},
    't-sidorov':    { 0: ['u-maznichenko', '2026-07-20'], 5: ['u-tsumankov', '2026-07-23'] },
    't-kuznetsova': { 0: ['u-tsumankov', '2026-07-14'], 1: ['u-kondurova', '2026-07-24', '0911-00121'],
                      2: ['u-kondurova', '2026-07-24', '0911-00122'], 5: ['u-maznichenko', '2026-07-15'] }
  };
  var checklistFull = ['t-smirnov', 't-popova', 't-orlova', 't-lebedev'];

  var checklist = [];
  var clSeq = 1;
  var docSeq = 90;
  trainees.forEach(function (tr) {
    checklistTemplate.forEach(function (c, i) {
      var responsibleId = c.responsibleRole === 'head' ? tr.headId : c.responsibleRole === 'hr' ? tr.hrId : tr.mentorId;
      var item = {
        id: 'cl-' + (clSeq++), traineeId: tr.id, name: c.name, responsibleRole: c.responsibleRole,
        responsibleId: responsibleId, offsetDays: c.offsetDays, done: false, doneBy: null, doneAt: null,
        linkedDocType: c.linkedDocType, linkedDocNumber: null,
        status: 'not_started', description: c.description || '', links: libLinks(c.links), reviewerId: null, observerIds: [], log: []
      };
      var d = checklistDone[tr.id] && checklistDone[tr.id][i];
      if (d) {
        item.done = true; item.doneBy = d[0]; item.doneAt = d[1]; item.linkedDocNumber = d[2] || null;
      } else if (checklistFull.indexOf(tr.id) >= 0) {
        item.done = true; item.doneBy = responsibleId;
        item.doneAt = addDays(tr.startDate, c.offsetDays - 1);
        if (c.linkedDocType === 'request0911') item.linkedDocNumber = '0911-000' + (docSeq++);
      }
      if (item.done) item.status = 'done';
      checklist.push(item);
    });
  });

  /* ---------- Маршрут согласования АП (FT_8, п. 5) ----------
   * program.approval = { startedAt, steps: [{ role, userId, status, doneAt }] } — нет у АП, которую ни разу не отправляли.
   * role: 'head' — руководитель стажировки, 'dept' — руководитель подразделения (отдела), 'cas' — руководитель ЦАС,
   * 'hr' — HR-менеджер стажёра, 'extra' — добавленный согласующий.
   * status: 'pending' — ещё не дошло, 'current' — задача сейчас у согласующего, 'approved' / 'rejected' — выполнено
   * с положительным / отрицательным результатом, 'skipped' — шаг пропущен.
   */
  function topDepartment(id) {
    var d = departments.filter(function (x) { return x.id === id; })[0];
    while (d && d.parentId && d.parentId !== 'd-cas') { var pid = d.parentId; d = departments.filter(function (x) { return x.id === pid; })[0]; }
    return d;
  }
  function defaultRoute(tr) {
    return [
      { role: 'head', userId: tr.headId },
      { role: 'dept', userId: (topDepartment(tr.departmentId) || {}).responsibleId || CAS_HEAD_ID },
      { role: 'cas',  userId: CAS_HEAD_ID },
      { role: 'hr',   userId: tr.hrId }
    ].map(function (x) { x.status = 'pending'; x.doneAt = null; return x; });
  }
  // [статус, дата выполнения] по шагам маршрута по умолчанию
  var approvalSeed = {
    't-lebedev':    ['2026-05-14T09:30', [['approved', '2026-05-14'], ['approved', '2026-05-14'], ['approved', '2026-05-15'], ['approved', '2026-05-15']]],
    't-orlova':     ['2026-06-05T10:20', [['approved', '2026-06-05'], ['skipped', '2026-06-06'], ['approved', '2026-06-07'], ['approved', '2026-06-08']]],
    't-popova':     ['2026-04-20T10:00', [['approved', '2026-04-20'], ['approved', '2026-04-21'], ['approved', '2026-04-21'], ['approved', '2026-04-22']]],
    't-smirnov':    ['2026-06-18T10:30', [['approved', '2026-06-18'], ['approved', '2026-06-18'], ['approved', '2026-06-19'], ['approved', '2026-06-19']]],
    't-kuznetsova': ['2026-07-22T09:50', [['approved', '2026-07-22'], ['approved', '2026-07-24'], ['current', null], ['pending', null]]]
  };
  programs.forEach(function (pr) {
    var seed = approvalSeed[pr.traineeId];
    if (!seed) return;
    var tr = trainees.filter(function (x) { return x.id === pr.traineeId; })[0];
    var steps = defaultRoute(tr);
    seed[1].forEach(function (st, i) { steps[i].status = st[0]; steps[i].doneAt = st[1]; });
    pr.approval = { startedAt: seed[0], steps: steps };
  });

  /* ---------- Тип задачи, обязательность и ссылки для ознакомления (FT_2) ----------
   * type: 'task' | 'course' | 'meeting' | 'test'; required: Булево; links: [{linkId, comment}] (FT_20: ссылка — элемент библиотеки ссылок).
   * Для тестовых данных подставляются по наименованию задачи. Ссылки хранятся без схемы — в прототипе нет внешних адресов.
   */
  var courseSeq = 400;
  // FT_20: курс — элемент библиотеки ссылок (группа «Обучение»), один на название курса
  function courseLink(name) {
    var title = name.replace(/^Пройти /, '');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    var found = linkLibrary.filter(function (l) { return l.name === title; })[0];
    if (found) return found.id;
    var id = 'lnk-c' + courseSeq;
    linkLibrary.push({ id: id, name: title, groupId: 'lg-learn', url: 'forus.e-queo.online/' + (courseSeq++) + '/course' });
    return id;
  }
  function taskExtras(name, block) {
    var n = name.toLowerCase();
    var type = /курс|обучение/.test(n) ? 'course'
      : /встреча|познакомиться с командой|планёрк|интервью/.test(n) ? 'meeting'
      : /аттестаци/.test(n) ? 'test' : 'task';
    var required = (block === 'corp' && /охране труда|информационной безопасности|аттестаци|регламент|кодекс/.test(n)) ||
      /итогов/.test(n);
    var links = [];
    if (type === 'course') links.push({ linkId: courseLink(name), comment: 'Ссылка на курс' });
    if (/регламент/.test(n)) links.push({ linkId: 'lnk-4', comment: '' });
    if (/кодекс/.test(n)) links.push({ linkId: 'lnk-5', comment: '' });
    return { type: type, required: required, links: links };
  }
  trainees.filter(function (tr) { return tr.id === 't-popova'; }).forEach(function (tr) {
    var items = buildClosureChecklist(tr);
    items[0].done = true; items[0].doneBy = tr.headId; items[0].doneAt = '2026-07-22';
    items[1].done = true; items[1].doneBy = tr.id;     items[1].doneAt = '2026-07-23';
    items[2].done = true; items[2].doneBy = tr.hrId;     items[2].doneAt = '2026-07-24';
    items.forEach(function (c) { if (c.done) c.status = 'done'; });
    Array.prototype.push.apply(closureChecklist, items);
  });

  function withExtras(x) {
    var e = taskExtras(x.name, x.block);
    x.type = e.type; x.required = e.required; x.links = e.links;
  }
  templates.forEach(function (tp) { tp.tasks.forEach(withExtras); });
  tasks.forEach(withExtras);

  /* ---------- FT_14: история выполнения задач АП ----------
   * task.log = [{ at, by, ev, comment, text }] — ev: 'work' (взята в работу), 'done' (выполнена), 'review' (выполнена, отправлена на проверку),
   * 'checked' (проверена), 'return' (возвращена на доработку), 'status' (статус изменён в карточке). task.result — комментарий стажёра к выполнению,
   * task.doneAt — когда стажёр нажал «Выполнено». Для тестовых данных история строится от срока задачи.
   */
  var traineeOfProgram = {};
  programs.forEach(function (pr) { traineeOfProgram[pr.id] = pr.traineeId; });
  tasks.forEach(function (x) {
    if (x.log) return;
    var tr = traineeOfProgram[x.programId];
    var cap = function (d) { return d > TODAY ? TODAY : d; };
    if (x.status === 'done') {
      var at = cap(addDays(x.deadline, -1));
      x.doneBy = x.doneBy || tr; x.doneAt = x.doneAt || at + 'T17:00';
      x.log = [{ at: cap(addDays(x.deadline, -4)) + 'T10:00', by: tr, ev: 'work', comment: null, text: null },
        { at: x.doneAt, by: tr, ev: x.reviewerId ? 'review' : 'done', comment: x.result || null, text: null }];
      if (x.reviewerId) {
        x.log.push({ at: cap(x.deadline) + 'T11:00', by: x.reviewerId, ev: 'checked', comment: null, text: null });
        x.reviews = [{ by: x.reviewerId, at: cap(x.deadline) + 'T11:00', result: 'checked', comment: null }];
      }
    } else if (x.status === 'in_progress') {
      x.log = [{ at: cap(addDays(x.deadline, -5)) + 'T10:00', by: tr, ev: 'work', comment: null, text: null }];
    } else x.log = [];
  });
  // Задача Смирнова «На проверке»: проверяющий уже возвращал её на доработку
  tasks.filter(function (x) { return x.programId === 'pr-smirnov' && x.status === 'review'; }).forEach(function (x) {
    x.log = [
      { at: '2026-07-20T10:05', by: 't-smirnov', ev: 'work', comment: null, text: null },
      { at: '2026-07-22T12:10', by: 't-smirnov', ev: 'review', comment: 'Задание выполнено', text: null },
      { at: '2026-07-23T09:30', by: 'u-strygin', ev: 'return', comment: 'Приложите файл с результатом задания', text: null },
      { at: '2026-07-24T15:40', by: 't-smirnov', ev: 'review', comment: x.result, text: null }
    ];
    x.reviews = [{ by: 'u-strygin', at: '2026-07-23T09:30', result: 'return', comment: 'Приложите файл с результатом задания' }];
  });

  /* ---------- FT_10: задачи и уведомления подбора персонала (тестовые — модуля подбора в прототипе нет) ----------
   * recruitTasks: id, assigneeId, type ('approve' | 'execute' | 'acquaint'), subject, deadline, authorId, status ('open' | 'in_progress' | 'done'),
   * FT_11: createdAt, doc (документ-предмет), description; у выполненной — result, doneBy, doneAt, comment.
   * recruitNotes: id, userId, severity, text, at. Авторы — из справочника пользователей.
   */
  var recruitTasks = [
    { id: 'rt-1',  assigneeId: 'u-strygin',     type: 'approve',  subject: 'Заявка на подбор системного аналитика',                      deadline: '2026-07-23', authorId: 'u-glebov',
      createdAt: '2026-07-20T10:15', doc: 'Заявка на подбор персонала № ЗП-000041 от 20.07.26',
      description: 'Согласуйте заявку на подбор системного аналитика в Отдел отчетности, НСИ и бизнес-процессов: 1 ставка, выход — сентябрь 2026 г.' },
    { id: 'rt-2',  assigneeId: 'u-strygin',     type: 'acquaint', subject: 'Ресурсный план на 2027 год',                                 deadline: '2026-07-24', authorId: 'u-gavrilkina',
      createdAt: '2026-07-21T09:40', doc: 'Ресурсный план подразделений ЦАС на 2027 год',
      description: 'Ознакомьтесь с ресурсным планом Отдела корпоративных проектов на 2027 год: потребность в персонале по кварталам.' },
    { id: 'rt-3',  assigneeId: 'u-strygin',     type: 'approve',  subject: 'Резюме кандидата на должность аналитика ERP',                deadline: '2026-07-26', authorId: 'u-maznichenko',
      createdAt: '2026-07-23T14:05', doc: 'Резюме кандидата по заявке № ЗП-000038 от 10.07.26',
      description: 'Согласуйте кандидата на должность аналитика ERP для приглашения на финальное собеседование.' },
    { id: 'rt-4',  assigneeId: 'u-strygin',     type: 'acquaint', subject: 'Заявка на подбор тестировщика',                              deadline: '2026-07-28', authorId: 'u-dryamin',
      createdAt: '2026-07-24T11:30', doc: 'Заявка на подбор персонала № ЗП-000043 от 24.07.26',
      description: 'Ознакомьтесь с заявкой на подбор тестировщика в Отдел по работе с субподрядчиками.' },
    { id: 'rt-5',  assigneeId: 'u-strygin',     type: 'execute',  subject: 'Провести собеседование с кандидатом на должность руководителя проектов', deadline: '2026-08-05', authorId: 'u-vorfolomeeva',
      createdAt: '2026-07-22T16:20', doc: 'Заявка на подбор персонала № ЗП-000039 от 14.07.26',
      description: 'Проведите финальное собеседование с кандидатом на должность руководителя проектов в Отдел по работе с государственным сектором и внесите результат в заявку.' },
    { id: 'rt-6',  assigneeId: 'u-kladova',     type: 'approve',  subject: 'Заявка на подбор специалиста по документообороту',          deadline: '2026-07-27', authorId: 'u-podyniglazov',
      createdAt: '2026-07-22T10:00', doc: 'Заявка на подбор персонала № ЗП-000042 от 22.07.26',
      description: 'Согласуйте заявку на подбор специалиста по документообороту в Направление по автоматизации Документооборота.' },
    { id: 'rt-7',  assigneeId: 'u-kladova',     type: 'execute',  subject: 'Подготовить описание вакансии программиста',                 deadline: '2026-08-01', authorId: 'u-sizova',
      createdAt: '2026-07-23T12:45', doc: 'Заявка на подбор персонала № ЗП-000040 от 17.07.26',
      description: 'Подготовьте описание вакансии программиста: обязанности, требования, условия работы.' },
    { id: 'rt-8',  assigneeId: 'u-kladova',     type: 'acquaint', subject: 'Резюме кандидата на должность программиста',                 deadline: '2026-07-22', authorId: 'u-sizova',
      createdAt: '2026-07-20T15:10', doc: 'Резюме кандидата по заявке № ЗП-000040 от 17.07.26',
      description: 'Ознакомьтесь с резюме кандидата на должность программиста перед собеседованием.' },
    { id: 'rt-9',  assigneeId: 'u-sizova',      type: 'acquaint', subject: 'Резюме кандидата на должность программиста',                 deadline: '2026-07-26', authorId: 'u-kladova',
      createdAt: '2026-07-23T09:25', doc: 'Резюме кандидата по заявке № ЗП-000040 от 17.07.26',
      description: 'Ознакомьтесь с резюме кандидата на должность программиста — собеседование 30.07.26.' },
    { id: 'rt-10', assigneeId: 'u-sudomoykina', type: 'execute',  subject: 'Назначить дату выхода кандидата на должность аналитика',     deadline: '2026-07-24', authorId: 'u-kladova',
      createdAt: '2026-07-21T13:00', doc: 'Заявка на подбор персонала № ЗП-000036 от 01.07.26',
      description: 'Согласуйте с кандидатом дату выхода и внесите её в заявку.' },
    { id: 'rt-11', assigneeId: 'u-sudomoykina', type: 'approve',  subject: 'Заявка на подбор аналитика ERP',                             deadline: '2026-07-29', authorId: 'u-gavrilkina',
      createdAt: '2026-07-24T10:50', doc: 'Заявка на подбор персонала № ЗП-000044 от 24.07.26',
      description: 'Согласуйте заявку на подбор аналитика ERP в Направление оперативного учета.' },
    // FT_11: выполненные задачи — для фильтра «Выполненные»
    { id: 'rt-12', assigneeId: 'u-strygin',     type: 'approve',  subject: 'Заявка на подбор бизнес-аналитика',                           deadline: '2026-07-21', authorId: 'u-glebov',
      createdAt: '2026-07-17T11:20', doc: 'Заявка на подбор персонала № ЗП-000037 от 07.07.26',
      description: 'Согласуйте заявку на подбор бизнес-аналитика в Отдел отчетности, НСИ и бизнес-процессов.',
      status: 'done', result: 'approve', doneBy: 'u-strygin', doneAt: '2026-07-20T17:05', comment: null },
    { id: 'rt-13', assigneeId: 'u-strygin',     type: 'acquaint', subject: 'Отчёт о закрытии вакансий за II квартал',                   deadline: '2026-07-18', authorId: 'u-gavrilkina',
      createdAt: '2026-07-14T09:00', doc: 'Отчёт о закрытии вакансий ЦАС за II квартал 2026 г.',
      description: 'Ознакомьтесь с отчётом о закрытии вакансий подразделений ЦАС за II квартал.',
      status: 'done', result: 'acquaint', doneBy: 'u-strygin', doneAt: '2026-07-16T10:32', comment: null }
  ].map(function (x) { x.status = x.status || 'open'; return x; });
  var recruitNotes = [
    { id: 'rn-1', userId: 'u-strygin',     severity: 'warning', text: 'Заявка на подбор аналитика по отчетности — осталось 2 дня на согласование', at: '2026-07-25T09:10' },
    // FT_17: уведомление получает автор заявки ЗП-000040 (Сизова); candidateId — найденный кандидат, «Перейти» открывает его карточку
    { id: 'rn-2', userId: 'u-sizova',      severity: 'info',    text: 'Кандидат на должность программиста принял предложение о работе',       at: '2026-07-24T16:40', candidateId: 't-found-1' },
    { id: 'rn-3', userId: 'u-kladova',     severity: 'warning', text: 'Заявка на подбор специалиста по документообороту — осталось 2 дня на согласование', at: '2026-07-25T08:30' },
    { id: 'rn-4', userId: 'u-sizova',      severity: 'info',    text: 'Кандидат на должность программиста приглашён на собеседование 30.07.26', at: '2026-07-24T11:05' },
    { id: 'rn-5', userId: 'u-sudomoykina', severity: 'danger',  text: 'Заявка на подбор аналитика ERP — срок закрытия вакансии прошёл',        at: '2026-07-23T10:00' }
  ];

  /* ---------- FT_15: заявки на подбор персонала (вкладка «Подбор персонала», тестовые — модуля подбора в прототипе нет) ----------
   * vacancyRequests: id, num, date, state ('new' | 'approval' | 'approved' | 'progress' | 'closed'), position (вакансия), deptId, authorId,
   *   qty (требуемое количество), candidates (кандидатов в проработке), found (найдено), unplanned (внеплановая), replacement (замена сотрудника),
   *   deadline (срок закрытия вакансии), closedAt (у закрытой).
   * Номера совпадают с документами задач подбора (recruitTasks.doc): ЗП-000036…ЗП-000044.
   * resourcePlan: ресурсный план текущего года — согласованная потребность в сотрудниках.
   */
  var vacancyRequests = [
    // На согласовании
    { id: 'vr-41', num: 'ЗП-000041', date: '2026-07-20', state: 'approval', position: 'Системный аналитик',            deptId: 'd-report', authorId: 'u-glebov',       qty: 1, candidates: 0, found: 0, deadline: '2026-09-30' },
    { id: 'vr-42', num: 'ЗП-000042', date: '2026-07-22', state: 'approval', position: 'Специалист по документообороту', deptId: 'd-doc',    authorId: 'u-podyniglazov', qty: 1, candidates: 0, found: 0, deadline: '2026-09-15', unplanned: true },
    { id: 'vr-44', num: 'ЗП-000044', date: '2026-07-24', state: 'approval', position: 'Аналитик ERP',                  deptId: 'd-oper',   authorId: 'u-maznichenko',  qty: 1, candidates: 0, found: 0, deadline: '2026-10-01', replacement: true },
    // Согласована
    { id: 'vr-30', num: 'ЗП-000030', date: '2026-06-01', state: 'approved', position: 'Функциональный архитектор',     deptId: 'd-cproj',  authorId: 'u-gavrilkina',   qty: 1, candidates: 0, found: 0, deadline: '2026-08-31', replacement: true },
    { id: 'vr-31', num: 'ЗП-000031', date: '2026-06-05', state: 'approved', position: 'Системный аналитик',            deptId: 'd-report', authorId: 'u-glebov',       qty: 5, candidates: 1, found: 0, deadline: '2026-07-31', unplanned: true },
    { id: 'vr-32', num: 'ЗП-000032', date: '2026-06-10', state: 'approved', position: 'Администратор проектов',        deptId: 'd-gadm',   authorId: 'u-kustavinova',  qty: 1, candidates: 1, found: 1, deadline: '2026-08-15' },
    { id: 'vr-33', num: 'ЗП-000033', date: '2026-06-15', state: 'approved', position: 'Веб-дизайнер',                  deptId: 'd-fed',    authorId: 'u-strygin',      qty: 1, candidates: 1, found: 1, deadline: '2026-08-20' },
    { id: 'vr-34', num: 'ЗП-000034', date: '2026-06-22', state: 'approved', position: 'Системный аналитик',            deptId: 'd-uss',    authorId: 'u-sizova',       qty: 1, candidates: 0, found: 0, deadline: '2026-09-01' },
    { id: 'vr-35', num: 'ЗП-000035', date: '2026-06-29', state: 'approved', position: 'Системный аналитик',            deptId: 'd-prod',   authorId: 'u-tsumankov',    qty: 2, candidates: 0, found: 0, deadline: '2026-09-15' },
    { id: 'vr-43', num: 'ЗП-000043', date: '2026-07-24', state: 'approved', position: 'Тестировщик',                   deptId: 'd-sub',    authorId: 'u-dryamin',      qty: 1, candidates: 0, found: 0, deadline: '2026-10-15' },
    // Выполняется
    { id: 'vr-39', num: 'ЗП-000039', date: '2026-07-14', state: 'progress', position: 'Руководитель проектов',         deptId: 'd-gov',    authorId: 'u-vorfolomeeva', qty: 2, candidates: 9, found: 1, deadline: '2026-09-01', unplanned: true },
    { id: 'vr-36', num: 'ЗП-000036', date: '2026-07-01', state: 'progress', position: 'Системный аналитик',            deptId: 'd-oper',   authorId: 'u-kladova',      qty: 1, candidates: 1, found: 1, deadline: '2026-08-10', unplanned: true },
    { id: 'vr-37', num: 'ЗП-000037', date: '2026-07-07', state: 'progress', position: 'Бизнес-аналитик',               deptId: 'd-report', authorId: 'u-glebov',       qty: 1, candidates: 2, found: 0, deadline: '2026-08-31', unplanned: true },
    { id: 'vr-38', num: 'ЗП-000038', date: '2026-07-10', state: 'progress', position: 'Аналитик ERP',                  deptId: 'd-oper',   authorId: 'u-maznichenko',  qty: 1, candidates: 3, found: 0, deadline: '2026-07-20' },
    // FT_17: подбор по заявке завершён (HR нажал «Исполнено») — найденный кандидат ждёт решения руководителя на вкладке «Адаптация персонала»
    { id: 'vr-40', num: 'ЗП-000040', date: '2026-07-17', state: 'closed',   position: 'Программист',                   deptId: 'd-uss',    authorId: 'u-sizova',       qty: 1, candidates: 0, found: 1, deadline: '2026-09-15', closedAt: '2026-07-24' },
    // Новая
    { id: 'vr-45', num: 'ЗП-000045', date: '2026-07-24', state: 'new',      position: 'Специалист по кадрам',          deptId: 'd-gpay',   authorId: 'u-gorbunova',    qty: 1, candidates: 0, found: 0, deadline: '2026-10-01', unplanned: true },
    { id: 'vr-46', num: 'ЗП-000046', date: '2026-07-24', state: 'new',      position: 'Администратор проектов',        deptId: 'd-gadm',   authorId: 'u-kustavinova',  qty: 1, candidates: 0, found: 0, deadline: '2026-10-15' },
    { id: 'vr-47', num: 'ЗП-000047', date: '2026-07-25', state: 'new',      position: 'Администратор проектов',        deptId: 'd-gadm',   authorId: 'u-kustavinova',  qty: 2, candidates: 0, found: 0, deadline: '2026-10-15', unplanned: true },
    // Закрыта — видны при «Показывать закрытые»
    { id: 'vr-26', num: 'ЗП-000026', date: '2026-05-12', state: 'closed',   position: 'Программист',                   deptId: 'd-doc',    authorId: 'u-podyniglazov', qty: 1, candidates: 0, found: 1, deadline: '2026-07-15', closedAt: '2026-07-10' },
    { id: 'vr-27', num: 'ЗП-000027', date: '2026-05-18', state: 'closed',   position: 'Бухгалтер-консультант',         deptId: 'd-gacc',   authorId: 'u-mazurova',     qty: 2, candidates: 0, found: 2, deadline: '2026-07-01', closedAt: '2026-07-01', unplanned: true },
    { id: 'vr-28', num: 'ЗП-000028', date: '2026-05-20', state: 'closed',   position: 'Аналитик',                      deptId: 'd-oper',   authorId: 'u-maznichenko',  qty: 1, candidates: 0, found: 1, deadline: '2026-07-01', closedAt: '2026-06-30' },
    { id: 'vr-29', num: 'ЗП-000029', date: '2026-05-25', state: 'closed',   position: 'Специалист по кадрам',          deptId: 'd-gpay',   authorId: 'u-gorbunova',    qty: 1, candidates: 0, found: 1, deadline: '2026-07-20', closedAt: '2026-07-15', replacement: true }
  ].map(function (r) { r.unplanned = !!r.unplanned; r.replacement = !!r.replacement; r.closedAt = r.closedAt || null; return r; });
  var resourcePlan = { year: 2026, approved: 20 };


  /* ---------- FT_10: важность задач — настройки пользователя ----------
   * importance[userId] = { levels: [{ id, name }], marks: { ключЗадачи: idУровня } }. Цвет флажка — по месту уровня в списке.
   * У пользователя без настроек — три уровня по умолчанию (создаются при первом обращении, app.js).
   * Ключ задачи: id задачи подбора ('rt-1'), 'ap:' + id АП, 'cl:' / 'cc:' + id пункта чек-листа, 'rv:' / 'tr:' + id задачи АП.
   */
  var IMPORTANCE_DEFAULT = ['Важно', 'Средняя важность', 'Прочие'];
  function defaultLevels() { return IMPORTANCE_DEFAULT.map(function (n, i) { return { id: 'lv-' + (i + 1), name: n }; }); }
  var importance = {
    'u-strygin':     { levels: defaultLevels(), marks: { 'ap:pr-kuznetsova': 'lv-1', 'rt-1': 'lv-1', 'rt-3': 'lv-2', 'rt-4': 'lv-3' } },
    'u-kladova':     { levels: defaultLevels(), marks: { 'rt-6': 'lv-1', 'rt-8': 'lv-3' } },
    'u-sizova':      { levels: defaultLevels(), marks: { 'cl:cl-8': 'lv-1', 'rt-9': 'lv-3' } },
    'u-sudomoykina': { levels: defaultLevels(), marks: { 'rt-11': 'lv-1', 'rt-10': 'lv-2' } }
  };
  /* ---------- FT_19: наблюдатели — тестовые случаи фильтра «Являюсь наблюдателем» ----------
   * Кладова — только наблюдатель задач Лебедева и Смирнова (чужие отделы: просмотр без изменений);
   * Стрыгин — наблюдатель задач Орловой (заместитель руководителя ЦАС — может и изменять).
   * Выполненные задачи в фильтр не попадают — по одной выполненной у каждого для проверки.
   */
  function addObserver(programId, pick, userId) {
    var list = tasks.filter(function (x) { return x.programId === programId; });
    pick(list).forEach(function (x) { if (x.observerIds.indexOf(userId) < 0) x.observerIds.push(userId); });
  }
  function byName(names) { return function (list) { return list.filter(function (x) { return names.indexOf(x.name) >= 0; }); }; }
  function byStatus(statuses) {   // первая задача каждого статуса по порядку
    return function (list) { return statuses.map(function (st) { return list.filter(function (x) { return x.status === st; })[0]; }).filter(Boolean); };
  }
  addObserver('pr-lebedev', byName(['Подготовить анализ конкурентов', 'Составить план-график пилотного проекта', 'Изучить методологию управления проектами компании']), 'u-kladova');
  addObserver('pr-smirnov', byStatus(['review', 'not_started']), 'u-kladova');
  addObserver('pr-orlova', byStatus(['in_progress', 'not_started', 'done']), 'u-strygin');

  /* ---------- FT_16: «Результат выполнения» задачи — критерии, по которым проверяющий принимает задачу ----------
   * Реквизит criteria у задач шаблонов и задач АП (из шаблона копируется в АП). Тестовые значения — по наименованию задачи;
   * у задач, добавленных в АП вручную, не заполнен.
   */
  var CRITERIA = {
    'Ознакомиться с регламентами отдела': 'Лист ознакомления подписан; стажёр отвечает наставнику на вопросы по порядку постановки задач',
    'Пройти вводный курс по продукту': 'Курс в СДО пройден полностью, итоговый тест — не ниже 80%',
    'Настроить рабочее место и доступы': 'Работают почта, портал, 1С:Документооборот и сетевые папки отдела; заявок в ИТ-поддержку по доступам нет',
    'Изучить корпоративный кодекс и правила внутреннего распорядка': 'Подписан лист ознакомления с кодексом этики и правилами внутреннего распорядка',
    'Пройти инструктаж по охране труда и пожарной безопасности': 'Запись в журнале инструктажей с подписью стажёра',
    'Пройти курс по информационной безопасности': 'Сертификат о прохождении курса загружен в карточку задачи',
    'Познакомиться с командой отдела': 'Стажёр знает роли коллег и к кому обращаться по текущим задачам команды',
    'Встреча с руководителем стажировки: цели на испытательный срок': 'Протокол встречи с целями на испытательный срок согласован с руководителем стажировки',
    'Изучить оргструктуру ЦАС и зоны ответственности подразделений': 'Стажёр называет ответственных по закупкам, ИТ-поддержке, юридическим вопросам и бухгалтерии',
    'Пройти обучение по работе в 1С:Документооборот': 'Создан и согласован тестовый документ, выполнена тестовая задача',
    'Составить отчёт по результатам недели': 'Отчёт передан наставнику: что сделано, что мешает, вопросы',
    'Пройти промежуточную аттестацию по корпоративным стандартам': 'Тест сдан не ниже 75%; результат загружен в карточку задачи',
    'Изучить методологию управления проектами компании': 'Конспект методологии согласован с наставником',
    'Разработать устав пилотного проекта': 'Устав содержит цели, границы, участников, бюджет и критерии успеха; согласован с руководителем стажировки',
    'Составить план-график пилотного проекта': 'План-график с контрольными точками и ресурсами согласован с наставником',
    'Подготовить реестр рисков проекта': 'В реестре не меньше 10 рисков с оценкой вероятности, влияния и мерами реагирования',
    'Подготовить анализ конкурентов': 'Сравнение 3–5 компаний в таблице и выводы для позиционирования; обсуждено с наставником',
    'Описать текущий процесс подразделения (AS-IS)': 'Схема процесса в BPMN по корпоративному шаблону согласована с владельцем процесса',
    'Подготовить требования к доработке учётной системы': 'Требования оформлены по шаблону ЦАС и согласованы с наставником',
    'Провести интервью с ключевыми пользователями': 'Протоколы 3–5 интервью загружены в карточку задачи',
    'Подготовить итоговую презентацию по результатам стажировки': 'Презентация представлена руководителю стажировки: результаты, выводы, план развития',
    'Подготовить итоговый отчёт о стажировке': 'Отчёт согласован с наставником и руководителем стажировки'
  };
  templates.forEach(function (tp) { tp.tasks.forEach(function (x) { x.criteria = CRITERIA[x.name] || ''; }); });
  tasks.forEach(function (x) { x.criteria = CRITERIA[x.name] || ''; });

  /* ---------- FT_17: найденные кандидаты — стажёры до решения руководителя ----------
   * Та же сущность, что стажёр; этапы до старта стажировки: 'pending_decision' (ожидает решения) и 'cancelled' (отменено, не отображается).
   * requisitionId — заявка на подбор (vacancyRequests), foundAt — когда HR нажал «Исполнено», expectedStartDate — ожидаемая дата выхода (необязательно),
   * hrId — HR-менеджер, завершивший подбор. Руководитель стажировки, наставник и даты задаются при старте; чек-листа и АП до старта нет.
   * При отмене: cancelReason, cancelledAt, cancelledBy. ФИО кандидатов — тестовые.
   */
  function foundPerson(o) {
    return { id: o.id, fullName: o.fullName, position: o.position, positionFamily: o.positionFamily || null, qualificationLevel: null,
      departmentId: o.departmentId, requisitionId: o.requisitionId, foundAt: o.foundAt, expectedStartDate: o.expectedStartDate || null,
      hrId: o.hrId, mentorId: null, headId: null, startDate: null, endDate: null, durationMode: null, checklistCreated: false,
      stage: 'pending_decision', rejectionComment: null, draftSince: null, stageDates: {}, closedAt: null, closeKind: null,
      cancelReason: null, cancelledAt: null, cancelledBy: null };
  }
  trainees.push(foundPerson({ id: 't-found-1', fullName: 'Ковалёв Даниил Сергеевич', position: 'Программист',
    departmentId: 'd-uss', requisitionId: 'vr-40', foundAt: '2026-07-24T16:40', expectedStartDate: '2026-08-10', hrId: 'u-sudomoykina' }));

  // Уведомления о событиях, адресованные пользователю (например, стажёру — результат проверки задачи). Пополняются в app.js
  var userNotes = [];
  // FT_12: настройки таблиц вкладки «Задачи и уведомления» по пользователю — сортировка, видимость и заголовки колонок (заполняется в app.js)
  var formSettings = {};

  window.DATA = {
    recruitTasks: recruitTasks,
    recruitNotes: recruitNotes,
    vacancyRequests: vacancyRequests,
    resourcePlan: resourcePlan,
    importance: importance,
    IMPORTANCE_DEFAULT: IMPORTANCE_DEFAULT,
    userNotes: userNotes,
    formSettings: formSettings,
    TODAY: TODAY,
    CURRENT_USER_ID: CURRENT_USER_ID,
    LAG_THRESHOLD: LAG_THRESHOLD,
    CLOSE_AVAILABLE_DAYS: CLOSE_AVAILABLE_DAYS,
    QUALIFICATION_LEVELS: QUALIFICATION_LEVELS,
    HR_IDS: HR_IDS,
    CAS_HEAD_ID: CAS_HEAD_ID,
    defaultRoute: defaultRoute,
    topDepartment: topDepartment,
    ROLE_TITLES: ROLE_TITLES,
    departments: departments,
    users: users,
    trainees: trainees,
    programs: programs,
    tasks: tasks,
    checklist: checklist,
    linkGroups: linkGroups,
    linkLibrary: linkLibrary,
    checklistTemplate: checklistTemplate,
    KSH_ID: KSH_ID,
    closureChecklist: closureChecklist,
    closureChecklistTemplate: closureChecklistTemplate,
    buildClosureChecklist: buildClosureChecklist,
    templates: templates,
    taskTypes: [
      { value: 'task', text: 'Задача' }, { value: 'course', text: 'Курс' },
      { value: 'meeting', text: 'Встреча' }, { value: 'test', text: 'Тест' }
    ]
    // notifications не хранятся — вычисляются getNotifications(trainee) в app.js
  };
})();
