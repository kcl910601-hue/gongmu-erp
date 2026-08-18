# Gongmu ERP - Project Context

## Sprint 9-9B Calendar Task Note Quick Entry

Calendar의 기존 회사 Task 상세 Modal은 `task_notes` 원본을 상세 열기 시 Task 단위로 조회하고 최신 3건을 compact하게 표시합니다. 기존 Task 편집 권한이 있는 사용자는 같은 Modal에서 일반·중요 메모와 선택 확인일을 바로 저장하며, Viewer와 Calendar-only Staff는 조회만 가능합니다. 저장은 Project 상세와 동일한 `task_notes` INSERT, `task_note_create` Activity, 공통 Task Note 변경 이벤트를 사용하므로 Calendar Bar 최신 메모 아이콘, 확인일 가상 일정, Notification 평가와 Realtime 재조회가 별도 복사본 없이 갱신됩니다. 수정·삭제는 기존 Project 상세에서 수행하며 DB migration은 없습니다.

## Sprint 9-9B-1 Calendar Task Note Edit & Delete

Calendar Task 메모 Row는 Project 상세와 동일하게 작성자 또는 Admin에게만 본문·중요 여부·확인일 인라인 수정과 확인 후 삭제를 제공합니다. Viewer와 Calendar-only Staff는 기존 Calendar 편집 권한 경계로 읽기 전용이며 Note 전용 Lock은 추가하지 않습니다. UPDATE/DELETE 성공 시 로컬 목록을 즉시 반영하고 기존 Task Note 변경 이벤트로 Calendar Bar, 확인일 가상 일정과 다른 화면을 재조회합니다. Calendar Bar는 최신 메모 본문을 유지하면서 Task에 중요 메모가 하나라도 남아 있으면 ⚠를 유지합니다. 별도 API, Realtime channel, DB migration은 없습니다.

## Sprint 9-8B Process Master Consistency

운영 전수 감사에서 `project_sections` 88건과 `task_templates` 38건은 모두 canonical master code(`MH`, `SH`, `본납-문틀`, `본납-도어`, `AS`)를 사용했습니다. `FRAME`, `DOOR`는 section·template 참조가 모두 0건인 legacy alias 후보이므로 삭제하지 않고 비활성화 migration만 준비했습니다. 실제 Project Process row는 변경하지 않으며 Required Process Alert의 canonical `본납-도어`도 유지합니다.

## Sprint 9-8A Required Process Alert

프로젝트 종료일의 4 calendar months 전부터 진행 대상 프로젝트에 `project_sections.process_type = '본납-도어'`인 공정이 없으면 Notification에 persistent warning을 표시합니다. 하위 Task 수와 `tasks.task_type`은 판정에 사용하지 않습니다. 룰은 `RequiredProcessRule` config로 관리하고 `required_process_missing:{projectId}:{ruleId}` stable key를 사용하며, 별도 Notification row를 매일 생성하지 않습니다. Project Process·Project Realtime 변경은 기존 Notification 갱신 이벤트로 재평가합니다. Admin은 전체, 일반 사용자와 Viewer는 기존 업무 담당 프로젝트 범위만 대상이며 Calendar-only Staff에는 추가 접근을 열지 않습니다.

## Sprint 9-7A Usage Request Lifecycle

원자재 사용요청은 생성·계약 배정·부분 미배정 이후 요청량/발주번호/사용일/메모 수정, 추가 배정, 취소, 통합 History까지 관리합니다. 요청량은 현재 활성 배정량보다 작게 줄일 수 없고 대상 프로젝트/공장 유형은 변경하지 않습니다. 요청 취소는 hard delete 없이 연결된 예정·확정 allocation을 함께 취소하여 계약 가용량과 프로젝트 원가를 기존 집계 규칙으로 복원합니다. Viewer는 목록과 History만 조회하고 Admin만 mutation을 수행합니다.

## Sprint 9-6C-2 Workspace Bulk Share Accept

My Workspace의 받은 공유 요청 Compact Strip은 pending 요청이 2건 이상일 때만 `전체 수락`을 제공합니다. 확인 Dialog를 거쳐 서버의 단일 `accept_all_share_invitations()` RPC가 현재 로그인 직원의 실행 시점 pending 요청만 set-based로 처리하며, 기존 단건 수락과 동일하게 member 중복 방지·invitation 상태·Activity·Realtime 흐름을 유지합니다. 완료 후 공유, 알림, 개인 일정 갱신 이벤트를 재사용하고 서버 상태를 다시 조회합니다.

## Sprint 9-7B Material Usage Request Text Payload

신규 원자재 사용요청의 발주번호와 메모는 `material_usage_requests`를 원본으로 저장하며, 계약 배정 목록·프로젝트 목록·CSV·수정 초기값은 사용요청 값을 우선하고 기존 allocation 값은 레거시 fallback으로만 사용합니다. 사용요청 연결 행의 수정도 원본 요청을 갱신하고 allocation에는 값을 복제하지 않습니다. 선택 입력값은 바깥 공백을 제거하고 빈 문자열은 `null`로 정규화하며 메모 내부 줄바꿈과 발주번호 특수문자는 보존합니다.

## Sprint 9-6B Dashboard Visual Hierarchy

Dashboard Large 기본 흐름은 Morning Brief → 통합 핵심 KPI → My Workspace → 진행 현황 → 최근 프로젝트/최근 활동 병렬 배치입니다. Morning Brief의 회사 업무·지연 업무·Task Note 확인사항은 그룹당 대표 3건만 표시하고 초과 항목은 원본 화면 링크로 이동합니다.

프로젝트 KPI와 기존 업무·출고 숫자 카드는 핵심 6개(전체·진행·지연 프로젝트, 오늘 마감·지연 업무, 출고대기)로 통합했습니다. 완료 프로젝트, 전체 진행률, 진행중 업무, 출고완료와 LME 비교는 Compact Secondary Row에서 데이터 손실 없이 유지합니다. 기존 `shipments` Preference ID는 legacy 설정 정규화를 위해 보존하지만 독립 시각 카드는 렌더링하지 않습니다.

My Workspace는 미완료 Reference Task가 있으면 Todo 8 / Reference 4 비율로 배치하고, 없으면 Todo가 전체 폭을 사용하며 완료 Reference Task는 Todo 아래 Compact 접힘 영역에서 접근합니다. Grid는 `items-start`를 사용해 최근 활동 확장 시 인접 카드 높이가 강제로 늘어나지 않습니다. Small/Medium/Large 카드 크기, 사용자 저장 순서·숨김·접힘과 기존 Realtime·권한 정책은 유지하며 DB 변경은 없습니다.

## Sprint 9-6A Dashboard Information Architecture

Dashboard는 Morning Brief(오늘 상황 인지), KPI(회사·프로젝트 전체 현황), My Workspace(개인 Todo 실행), Project Status(프로젝트 진행 확인), Recent Activity(변경 이력)의 역할로 구분합니다. Notification은 공유 요청, Mention, 시스템·Task Note·원자재 알림의 실제 관리 화면이며 Dashboard에 동일한 상세 처리 목록을 복제하지 않습니다.

Morning Brief는 회사 Task와 Task Note 확인사항의 대표 목록 및 개인 Todo의 오늘·지연 숫자만 제공합니다. 개인 Todo 상세·완료·수정·공유 관리는 My Workspace에만 있고 Reference Task도 Workspace 보조 영역에만 표시합니다. Workspace의 공유 요청 수락·거절 목록은 제거해 Notification Inbox로 일원화했습니다. 신규 사용자의 기본 순서는 Morning Brief → KPI → My Workspace → 업무·프로젝트 현황 → Recent Activity이며, 저장된 사용자별 순서·크기·숨김·접힘 설정은 정규화 과정에서 그대로 유지합니다. 신규 DB와 Realtime channel은 없습니다.

## Sprint 9-6A Project Task Name Editing

프로젝트 상세 공정표에서 기존 `tasks.task_name`을 인라인으로 수정할 수 있습니다. 편집은 기존 Task 권한과 short editing lock을 사용하며, trim 후 빈 값은 거부하고 동일 값은 UPDATE와 Activity Log 없이 종료합니다. 저장 중에는 화면에 새 이름을 먼저 반영하고 실패하면 이전 이름으로 복원한 뒤 프로젝트 데이터를 다시 조회합니다.

업무명 저장은 기존 Task update 경로에서 `task_name` 한 필드만 변경하고 `task_name_change` Activity Log에 이전·변경 값을 기록합니다. Task ID와 업무 유형, 담당자, 일정, 상태, 순서, 메모 관계는 유지됩니다. 기존 tasks Realtime 재조회에 따라 프로젝트 상세, Calendar와 메모 Reminder, Timeline, Gantt 및 이후 Excel Export가 원본 이름을 사용합니다. DB migration은 없습니다.

## Sprint 9-5G-1 Gantt Excel Export Task Type

Gantt Excel Export 공통 업무 데이터는 화면에서 사용하는 `tasks.task_type` 표시명을 `taskTypeName`으로 전달합니다. 현재 화면형과 현장별 공정표는 업무명 바로 다음에 `업무 유형` 열을 표시하며, 값이 없으면 `미지정`으로 출력합니다. 고정 창과 날짜 Timeline 시작 열은 상세 정보 열 수에서 계산되고 보고용 요약은 기존 프로젝트 단위 구조를 유지합니다.

## Sprint 9-4B-2 Calendar Filter Toolbar Responsive Layout

Calendar 필터 Toolbar는 `w-full min-w-0 flex-wrap` 구조로 필터 그룹 단위 줄바꿈을 지원한다. AppShell의 메인 콘텐츠에도 `min-w-0`를 적용해 Sidebar를 제외한 실제 가용 폭 안에서 수축하며, 일정 소스와 보기 방식의 내부 컨트롤도 필요할 때 줄바꿈한다.

완료 일정 토글은 모바일·태블릿·데스크톱 최소 폭과 36px 스위치 영역을 유지한다. Track과 문구는 독립된 flex 형제이며, Thumb는 absolute 배치 없이 Track 내부에서만 16px 이동해 상태 변경 시 문구 위치가 변하지 않는다. Select와 완료 버튼은 축소하지 않고 그룹 전체가 다음 줄로 이동해 문구 및 컨트롤 clipping과 페이지 가로 스크롤을 방지한다.

## Sprint 9-4E My Workspace Small Card Responsive Layout

My Workspace는 Dashboard customization context의 실제 `workspace` 카드 크기를 직접 사용한다. Small은 viewport와 무관하게 2×2 요약, 줄바꿈 Tab, 전체 폭 검색과 2열 필터·정렬, 10건 단위 Todo 목록, 접힌 Reference Task, 접힌 완료 목록, 세로 공유 요청 요약 순서의 단일 열 레이아웃을 렌더링한다. Medium과 Large는 기존 Todo 2/3·보조 영역 1/3 구조와 15건 기본 목록을 유지한다.

Small Todo와 일정·메모 카드의 제목·내용은 최대 2줄과 한글 강제 줄바꿈을 사용하고 Badge는 flex wrap을 유지한다. 완료 체크만 카드에 항상 노출하며 나머지 수정·공유·고정·삭제·댓글·Timeline 액션은 `⋯` 메뉴에 배치한다. 고정 높이 또는 전체 overflow 차단은 추가하지 않으며 기존 Realtime, 권한, short editing lock, 사용자 설정과 Dashboard 편집 동작은 변경하지 않는다.

## Sprint 9-4D Dashboard Today Data & Workspace Layout Refinement

Morning Brief와 My Workspace는 `getPersonalTodoDateBucket`, `isTodayPersonalTodo`, `isOverduePersonalTodo`를 공통 사용해 로컬 `YYYY-MM-DD` 기준으로 개인 Todo를 완료·지연·오늘·예정·날짜 없음으로 구분한다. Morning Brief 개인 업무에는 오늘 날짜의 미완료 Todo와 오늘 마감 미완료 Reference Task만 포함하고, 지연 개인 Todo와 Reference Task는 별도 지연 목록으로 표시한다. 회사 업무도 현재 권한·관리자 범위를 유지하면서 미완료 `due_date === today`만 오늘 목록에, 과거 마감은 별도 지연 목록에 표시한다.

Dashboard 기본값에서 My Workspace와 최근 활동은 모두 Large 전체 폭 카드다. 기존 저장 설정은 `normalizeDashboardPreferences`가 사용자의 명시적 크기·순서·숨김·접힘을 그대로 유지하며, 설정이 없는 사용자와 기본값 초기화에만 새 크기가 적용된다. My Workspace 내부의 중복 최근 작업 영역은 제거해 Todo 공간을 전체 폭으로 사용하고, 최근 활동은 별도 전체 행에서 비압축 레이아웃과 줄바꿈을 사용한다.

## Sprint 9-4C Todo-Focused My Workspace

My Workspace는 Todo를 기본 Tab과 전체 폭의 핵심 영역으로 표시한다. 상단 미완료·오늘·지연·완료 요약은 Todo 필터 및 완료 영역과 연결되며, 검색, 상태·소유권 필터, 추천·마감·수정·생성 정렬을 지원한다. 기본 목록은 미완료 Todo 15건, 접힌 완료 영역은 최신 완료 20건을 먼저 렌더링하고 각각 단계적 더보기를 제공한다. 선택 Tab, Todo 필터·정렬, 완료 접힘 상태는 인증 직원 ID가 포함된 localStorage 키로 사용자별 유지한다.

날짜가 있는 비 Todo 항목은 일정 Tab, 날짜가 없는 항목은 메모 Tab으로 분리한다. 공유 요청은 받은 pending 건수와 Notification 개인 필터 링크만 제공하며 실제 처리는 알림함에서 유지한다. Reference Task는 Todo 우측 보조 영역에 배치하고 미완료를 우선 표시하며 완료 항목은 접힌 별도 목록으로 분리한다. 기존 personal_notes 원본, 권한, 공통 Realtime, 댓글, Timeline, short editing lock 및 Reference Task 참조 구조는 변경하지 않는다.

## Sprint 9-4B Calendar Completed Schedule UX

Calendar의 `personal_notes.is_completed` 완료 상태를 월간 개인 일정 카드, 선택일 개인 일정 목록, 상세 모달에 일관되게 표시한다. 완료 일정은 원래 배경과 공유·댓글 정보를 유지하면서 채도와 강조도를 낮추고 제목 취소선 및 `완료` Badge를 추가한다. 기존 편집 권한이 있는 사용자는 상세에서 완료·미완료를 전환할 수 있으며 기존 short editing lock과 collaboration event를 그대로 사용한다.

상단 기존 필터 영역의 `완료 일정 표시` 토글은 기본값이 켜짐이고, 끄면 소스·소유/공유 필터 적용 후 완료된 개인 일정만 렌더링 대상에서 제외한다. 설정은 기존 localStorage 방식을 재사용하되 `showCompletedPersonalSchedules:{auth user id}` 키로 사용자별 저장한다. 회사 업무 일정과 Gantt의 기존 완료 UI 및 DB 구조는 변경하지 않는다.

## Sprint 9-4A Dashboard Card Responsive Layout Fix

Dashboard 카드 wrapper는 저장된 크기를 `data-dashboard-size="small|medium|large"`로 본문에 전달한다. Small은 viewport breakpoint와 별개로 카드별 내부 Grid를 1~2열로 재배치하고 padding, gap, KPI 숫자 크기, 긴 텍스트 줄바꿈을 조정한다. 모바일에서는 저장 크기와 관계없이 내부 요약 Grid도 한 열을 우선한다.

최근 프로젝트는 Small에서 `min-w-[1000px]` 표를 사용하지 않고 프로젝트명, 상태·담당자, 종료일, 진행률을 담은 세로 목록을 렌더링한다. 최근 활동은 기존 Activity List를 유지하되 제목은 최대 두 줄, 설명은 자연 줄바꿈으로 표시한다. Medium/Large의 기존 표와 상세 UI는 유지한다.

## Sprint 9-4 Dashboard Customization

Dashboard 본문의 실제 7개 영역은 `today_tasks`, `workspace`, `kpi`, `shipments`, `progress`, `recent_projects`, `recent_activity`의 안정적인 카드 ID를 사용한다. 현재 본문에 독립 알림 카드는 없으므로 Header Notification Center를 복제하거나 신규 카드를 만들지 않는다.

사용자 설정은 `dashboard_preferences`에 직원별 JSONB 한 행으로만 저장한다. 공통 Dashboard 데이터나 프로젝트·업무·일정 원본에는 영향을 주지 않으며 RLS와 API 모두 현재 인증 사용자에 연결된 활성 승인 직원의 행만 허용한다. 네이티브 HTML5 Drag & Drop과 키보드 위·아래 이동, Small/Medium/Large grid span, 숨김 복원, 일반 보기 접기, 확인 Dialog 기반 초기화를 지원한다. Realtime은 사용하지 않는다.

## Sprint 9-3B-1 Gantt Presentation Header Layout Fix

Gantt 프레젠테이션 루트는 `100dvh` 세로 flex 구조로 Toolbar, 상단 가로 스크롤 제어 행, Gantt viewport를 문서 흐름 안에서 분리한다. Toolbar는 고정 높이 대신 최소 높이와 줄바꿈을 사용하고, Gantt viewport는 `flex: 1; min-height: 0`으로 남은 높이만 사용하므로 화면 너비와 브라우저 확대율에 따라 Toolbar 높이가 바뀌어도 겹치지 않는다.

필터 Popover Portal은 기존 fullscreen Gantt 루트 연결을 유지한다. 필터가 열리는 동안 상단 스크롤 제어 행이 Popover 높이를 예약하고, 닫히면 scrollbar 높이로 축소된다. 월·일 헤더는 별도 Gantt viewport 내부의 `top: 0` sticky 묶음으로 유지하며 Toolbar 높이를 sticky offset에 중복 반영하지 않는다.

## Sprint 9-3B Gantt Presentation Filter Overflow Fix

Gantt 프레젠테이션 필터는 헤더 내부 absolute 메뉴 대신 공통 Radix Popover를 사용한다. 일반 화면에서는 기존처럼 body Portal을 사용하고, browser fullscreen 중에는 fullscreen 대상인 Gantt 프레젠테이션 루트를 Portal 컨테이너로 지정하여 `overflow-hidden` clipping과 fullscreen 외부 Portal 미표시 문제를 함께 방지한다.

Popover는 트리거 우측 정렬, viewport collision padding, 자동 방향 전환, 화면 기준 최대 크기와 프레젠테이션 오버레이보다 높은 z-index를 사용한다. Gantt 데이터, 필터 상태, 가로·세로 스크롤 컨테이너는 변경하지 않는다.

## Sprint 9-3A Notification Popup & Reference Task Options

Notification Bell 항목은 바로 이동하지 않고 작성자, 원본, 내용, 발생 시간과 원본 열기 액션을 제공하는 상세 Dialog를 연다. 댓글 기반 알림은 같은 Dialog에서 Reference Task 설정 Dialog를 열 수 있으며 알림의 Inbox/Archive 상태와 작업 추가 상태는 서로 영향을 주지 않는다.

Reference Task에는 개인 관리용 `title`, `due_date`, `priority`만 추가한다. 원본 댓글과 일정은 기존 참조를 매번 조회하며 개인 제목 변경은 원본에 반영되지 않는다. My Workspace는 개인 제목, 원본 요약, 마감 상태, 우선순위와 완료 상태를 표시하고 같은 설정 Dialog로 개인 관리 필드만 수정한다.

## Sprint 9-3 Add to My Tasks

`reference_tasks`는 사용자별 작업 상태와 `comment_id`, `shared_item_id` 참조만 저장하며 댓글 내용이나 일정 제목을 복사하지 않는다. 조회 API가 현재 댓글·작성자·일정 원본을 매번 조인하므로 원본 수정이 그대로 표시된다. 원본 삭제 시 FK는 `SET NULL`로 변경되어 작업은 유지되고 “삭제된 원본”으로 표시된다.

같은 사용자의 같은 댓글은 partial unique index와 생성 RPC의 upsert로 한 번만 추가된다. 생성 시 현재 소유자 또는 공유 참여자인지 서버에서 재검증한다. `reference_tasks` Realtime은 해당 사용자의 My Workspace만 갱신하고, 댓글 Realtime은 참조 목록의 최신 원본 내용을 다시 조회한다.

## Sprint 9-2A Notification Auto Archive

Notification Bell은 Inbox와 Archive로 구분한다. 일반 알림은 읽는 즉시 기존 `notification_reads`의 `read_at`과 새 `archived_at`을 함께 기록해 Inbox에서 제거하며, 다시 미읽음 처리하면 두 값을 비워 Inbox로 복귀한다. Badge는 미읽음 Inbox와 처리 전 공유 요청만 계산한다.

공유 요청은 별도 알림 복사본을 만들지 않고 기존 `share_invitations.status`를 기준으로 분류한다. pending 요청은 읽기와 관계없이 Inbox에 유지하고 accepted, rejected, cancelled 요청은 Archive에 표시한다. `notification_reads`와 공유 테이블의 기존 Realtime 이벤트를 그대로 사용한다.

## Sprint 9-2 Mentions & Smart Notification

댓글 멘션은 `shared_comment_mentions`에 댓글 ID와 직원 ID만 저장한다. 댓글 작성 API는 선택된 직원 ID 배열을 RPC로 전달하며, RPC가 활성 직원인지와 해당 일정의 현재 소유자 또는 공유 참여자인지를 다시 검증한다. 같은 댓글의 같은 직원은 복합 기본키로 한 번만 기록된다.

댓글 입력창은 `@` 이후 이름·직책으로 참여자를 검색하고 키보드와 마우스 선택을 지원한다. 기존 Notification Center는 멘션 관계를 조회해 실시간 Bell 알림을 계산하며, 알림 링크는 Calendar의 기존 상세 모달과 해당 댓글 위치를 연다. 멘션 생성은 기존 `activity_logs` Timeline에 `shared_comment_mention` 활동으로 기록된다.

## Sprint 9-1B Hierarchical Delete Lock Check

Project and task deletion now run through security-definer RPCs that preserve the existing delete permissions and inspect the current `editing_locks` rows inside the delete transaction. The transaction briefly takes a share-row-exclusive lock on `editing_locks`, removes expired entries, checks the hierarchy, and then either returns current lock details or performs the existing delete sequence. This closes the gap where a child lock could be created between a separate client-side check and deletion.

Project hierarchy checks cover the project record, tasks with the project ID, and shipments with the project ID. Task hierarchy checks cover the task and shipments whose `task_id` references it. `personal_notes` is not included because the current schema does not contain a project, task, or shipment relationship.

## Sprint 9-1A Live Editing Completion

Short edits reuse the existing acquire and release endpoints without heartbeat. `withShortEditingLock` holds one record lock only for the mutation, while `withShortEditingLocks` sorts keys before acquiring multiple affected task records to avoid inconsistent acquisition order. Both always release acquired tokens in `finally`.

Calendar personal-note moves and Gantt task schedule changes optimistically update the UI and restore the previous state when acquisition or persistence fails. Task completion, status, assignee, personal-note completion/pin, partner active state, and maintenance-mode changes use the same short-lock path. Partner inline editing and Gantt task detail editing use the existing heartbeat hook.

## Sprint 9-1 Universal Live Editing Lock

Live editing uses one temporary `editing_locks` table. Its unique key is `(resource_type, resource_id)`, so unrelated projects, tasks, shipments, notes, employees, comments, and settings remain independently editable. The table never stores editable copies of source records.

The shared API acquires a 60-second lock, refreshes it every 20 seconds while a long edit UI remains open, and releases it on save, cancel, or unmount. Expired locks are reclaimed during acquisition and status checks. Database functions re-check the existing authorization rule for each resource type; Presence is not used to decide lock ownership.

## Sprint 9-0C-1 Presence Subscription Runtime Error Fix

The online Presence subscription creates a fresh channel only after the previous active channel has completed cleanup. It registers sync, join, and leave callbacks before subscribe, then tracks the authenticated employee only after SUBSCRIBED.

Module-level transition serialization, subscription ownership, and idempotent cleanup prevent Strict Mode and authentication changes from overlapping same-topic channels. Cleanup runs untrack before removeChannel, while Presence failures update only the online-status UI and do not interrupt the AppShell or other ERP features. No DB changes are required.

## Sprint 9-0C Online User Presence

인증된 AppShell은 기존 `shared-workspace-realtime` 데이터 변경 채널과 별도로 `erp-online-users` Presence 채널 하나를 생성합니다. 각 브라우저 연결은 고유 Presence key를 사용하고 `employeeId`, 이름, 직책, 접속 시각만 track합니다. DB에는 온라인 상태를 저장하지 않습니다.

Presence sync 결과는 employeeId 기준으로 합쳐 여러 탭과 여러 기기를 한 명으로 표시합니다. 마지막 연결이 untrack되거나 Realtime 연결이 끊기면 Supabase Presence에서 자동 제거됩니다. Sidebar 로그인 사용자 영역 위의 Popover에서 온라인 인원과 목록을 확인하며, 연결 오류는 Presence UI에만 표시하고 ERP 기능에는 영향을 주지 않습니다.

## Sprint 9-0B Unread Comments & Calendar Shared Tag

댓글 읽음 정보는 `shared_comment_reads`에 `shared_item_id`, `employee_id`, `last_read_comment_id` 한 행만 저장합니다. 댓글이나 일정 복사본은 만들지 않습니다. `get_shared_comment_count_stats(uuid[])`는 전체 댓글 수와 현재 사용자가 작성하지 않았으며 마지막 읽음 ID보다 큰 댓글 수를 일괄 반환합니다.

`CommentSection`이 댓글 API 응답을 화면에 표시한 뒤 응답에 포함된 마지막 댓글 ID까지만 `mark_shared_comments_read`로 기록합니다. 읽음 성공 시 현재 화면의 unread를 즉시 0으로 만들고, `shared_comment_reads` Realtime 변경으로 같은 사용자의 다른 화면도 count만 다시 조회합니다. Calendar 카드는 기존 날짜·작성자·댓글 정보를 유지하면서 소유자가 공유한 일정에는 `공유중`, 참여 일정에는 `공유받음` 태그를 표시합니다.

## Sprint 9-7 원자재 사용요청과 계약배정 분리

Usage Request는 실제 필요 물량 원본이고 Allocation은 특정 계약이 충당한 물량입니다. 요청은 계약별로 복제하지 않으며 `material_usage_requests 1 → material_contract_allocations N`으로 연결합니다. Unallocated는 저장 문자열이 아니라 `Usage Request quantity - cancelled 제외 Allocation 합계`로 계산합니다.

신규 사용등록은 계약 가용량 안에서는 현재 계약에 빠르게 전량 배정하고, 초과 시 자동 순차분할·관리자 계약증액·초과분 미배정 중 하나를 Preview 후 선택합니다. 미배정 물량은 원가에 포함하지 않고 계약 잔여량 알림에도 영향을 주지 않습니다. 기존 allocation은 `usage_request_id = null`로 호환하며 운영 데이터 Backfill은 하지 않습니다.

## Sprint 9-6C Workspace Share Invitation Recovery

Notification은 공유 요청 알림 및 처리 진입점이고, My Workspace는 공유 작업 맥락에서 받은 요청을 확인하고 수락·거절하는 진입점입니다. 두 화면은 별도 복사본 없이 동일한 `share_invitations` 행을 사용하며 기존 `shared-workspace-realtime` 채널의 `share_invitations` 이벤트 후 `/api/sharing`을 재조회해 상태를 동기화합니다.

My Workspace는 현재 직원의 `invitee_id`와 `status = 'pending'`을 함께 확인합니다. 수락 전에는 `personal_notes` 전체 SELECT 정책을 확장하지 않으며 `get_share_invitation_titles(uuid[])`가 관련 inviter/invitee에게 제목만 일괄 반환합니다. Migration `20260813100000_add_share_invitation_title_lookup.sql`과 Verification `20260813101000_verify_share_invitation_title_lookup.sql`은 운영 DB에 자동 적용하지 않습니다.

## Sprint 9-6C-1 Workspace Final Information Roles

My Workspace에서 Todo는 주 실행 영역, 받은 공유 요청은 Summary 아래의 접을 수 있는 Compact 처리 영역, Reference Task는 별도 보조 실행 영역, 완료한 Todo는 접힌 History 영역입니다. 공유 요청 유무는 Todo 폭에 영향을 주지 않으며 미완료 Reference Task가 있을 때만 Large 화면에서 8:4 열을 사용합니다.

Reference Task API는 RLS에 더해 `assigned_to = 현재 employees.id`를 명시하고 완료 여부는 `status = 'completed'`만을 기준으로 판단합니다. `completed_at`은 완료 시각 기록이며 표시 필터의 판정 기준이 아닙니다. Reference Task 컴포넌트는 count 변화로 재마운트하지 않고 동일 인스턴스를 유지해 Realtime 생성·완료·복원·수정·삭제 시 목록과 레이아웃 count를 함께 갱신합니다.

## Sprint 9-0A Realtime Comment Performance Optimization

댓글 작성·수정·삭제 성공 응답은 `CommentSection` 상태에 즉시 반영합니다. 생성·삭제 시에는 해당 원본 ID의 댓글 수 delta 이벤트를 debounce 없이 발생시켜 Calendar와 My Workspace의 Badge만 갱신하며 일정 목록 전체를 다시 조회하지 않습니다.

로컬 댓글 mutation ID는 5초 동안 등록되고 같은 ID의 `shared_comments` Realtime echo가 도착하면 소비됩니다. 다른 사용자의 변경만 150ms 후 댓글 API를 재조회하며, 댓글 수는 `/api/comments/counts`에서 현재 화면의 원본 ID를 한 번에 집계합니다. Realtime payload는 ID와 작업 종류를 중복 판정에만 사용하고 댓글 화면 데이터는 계속 기존 API에서 조회합니다. Timeline과 Notification은 `activity_logs` Realtime debounce를 유지합니다.

## Sprint 9-0 Realtime Collaboration Phase 1

인증된 화면은 AppShell에서 `shared-workspace-realtime` 채널 하나만 생성합니다. `personal_notes`, `shared_item_members`, `share_invitations`, `shared_comments`, `activity_logs`, `notification_reads` 변경을 수신하고 기존 API를 통해 필요한 데이터만 다시 조회합니다. Realtime payload를 화면 데이터로 직접 사용하지 않으므로 기존 API와 RLS가 조회 권한을 다시 검증합니다.

테이블 변경은 개인 일정·댓글·Timeline·공유·Notification 도메인 이벤트로 변환됩니다. 공통 스케줄러가 같은 도메인 이벤트를 150ms 동안 합쳐 DB trigger와 사용자 mutation에서 발생하는 연속 변경의 중복 재조회를 줄입니다. 별도 `notifications` 테이블은 존재하지 않아 구독하지 않으며, Notification Bell은 관련 원본과 `notification_reads` 변경에서 갱신합니다.

`20260804180000_enable_shared_workspace_realtime.sql`은 Realtime publication만 확장하며 테이블이나 원본 복사본을 만들지 않습니다. 운영 DB 적용과 다중 사용자 UAT는 별도 수행해야 합니다.

## Sprint 8-9D Calendar UX Improvements

월간 Calendar의 주 Row 높이는 각 주에서 개인 일정이 가장 많은 날짜의 카드 수와 회사 일정 lane 수를 함께 계산해 주별로 독립 확장합니다. 개인 일정 카드는 더 이상 일부만 자르지 않으며, 제목·날짜·작성자·공유 상태·댓글 수만 표시합니다.

월간 카드와 선택 날짜 카드 모두 `PersonalNoteDetailModal`을 열고, 상세 모달은 기존 `PersonalNoteActions`, `CommentSection`, `TimelineSection`을 재사용합니다. 회사 일정은 기존 `GanttTaskDetailModal` 경로를 유지하므로 개인 일정 API와 연결되지 않습니다.

Calendar 우측 선택 날짜 카드에서는 `PersonalNoteActions`를 직접 제공하며 소유자·edit·view 권한에 따라 Dashboard와 동일하게 액션을 제한합니다. 월간 날짜 칸 내부 카드는 액션 없이 요약 정보만 표시합니다. Dashboard 카드는 모든 개인 일정에 소유자와 현재 공유 인원을 표시합니다.

## Sprint 8-9C Comment Badge & Calendar Action Parity

`/api/personal-notes`는 조회된 shared item 전체의 댓글을 한 번에 집계해 `comment_count`를 반환합니다. My Workspace와 Calendar는 `PersonalNoteActions`와 공통 권한 판정을 사용하며, 소유자는 수정·공유·고정·삭제, edit 참여자는 수정, view 참여자는 원본 조회만 허용합니다. 댓글과 Timeline은 세 권한 모두 사용할 수 있습니다.

댓글 변경은 기존 `PERSONAL_NOTES_CHANGED_EVENT`를 발생시켜 목록과 Badge를 재조회합니다. 댓글 수 저장 컬럼, 사용자별 집계 복사본, Calendar 전용 일정 원본은 만들지 않습니다.

## Sprint 8-9B Activity Timeline

Shared Workspace Timeline은 별도 로그 시스템을 만들지 않고 기존 `activity_logs`를 사용합니다. UUID인 `personal_notes.id`는 `source_item_id`로 연결하며 일정·공유·댓글 mutation을 DB trigger에서 기록합니다. My Workspace와 Calendar는 동일한 Timeline API와 컴포넌트를 사용합니다.

기존 프로젝트 Activity 조회 정책은 유지되고, `source_item_id`가 있는 활동만 원본 소유자와 현재 공유 참여자로 제한됩니다. 공유 해제 사용자는 과거 협업 Activity를 더 이상 조회할 수 없습니다. 운영 migration과 실제 다중 사용자 UAT는 별도 적용이 필요합니다.

## Sprint 8-9A Shared Comments

Shared Workspace의 일정·TODO·메모는 계속 `personal_notes` 원본 1개를 사용하며, 댓글은 `shared_comments → shared_items → personal_notes`로 연결됩니다. 소유자와 수락된 view/edit 참여자는 댓글을 조회·작성할 수 있고 작성자는 본인 댓글만 수정하며 작성자 또는 소유자만 삭제할 수 있습니다. 공유되지 않은 원본은 첫 댓글 작성 시 공유 연결 메타데이터만 생성합니다.

My Workspace와 Calendar는 같은 `CommentSection`과 댓글 API를 사용합니다. 신규 댓글 알림은 별도 알림 복제 없이 기존 Notification Center가 접근 가능한 댓글에서 계산합니다. Realtime과 댓글 Activity Timeline은 Sprint 8-9B 범위이며, `20260804120000_create_shared_comments.sql`은 운영 DB에 자동 적용하지 않았습니다.

## Sprint 7C LME Auto Sync

한국비철금속협회 공개 HTML에서 Al 현물 USD/ton을 서버가 저빈도로 수집하는 구조를 추가했습니다. 최초 동기화는 2024-01-01까지 순차 탐색하고, 증분 동기화는 DB 최신일에서 중단합니다. 기존 가격은 덮어쓰지 않으며 가격 차이는 conflict로 기록합니다. 협회가 환율을 제공하지 않으므로 자동수집 행에는 환율·국내환산가를 만들지 않습니다. 자세한 운영 조건은 `docs/LME_SYNC.md`를 기준으로 합니다.

내부 LME Sync는 Market Data Provider, 공통 Sync Orchestrator, LME Repository로 분리했습니다. 현재 활성 Provider는 LME만이며 환율은 타입과 계산 결과 체계만 준비되어 있습니다. 기존 API·UI·DB 경로는 유지됩니다.

## Sprint 6-2 UAT 상태

테스트 계정 Seed의 평문 비밀번호를 제거하고 `scripts/seed-uat-accounts.mjs`에서 필수 환경변수로만 주입하도록 변경했습니다. 2026-07-29 연결된 Supabase project ref `cropibqvvzpxlnqpkyto`는 Production으로 확인되어 최초 Seed와 실제 UAT는 실행하지 않았습니다.

Sprint 6-3에서 해당 Production 프로젝트에 대한 제한적 UAT가 명시적으로 승인되었습니다. Seed는 이중 승인 플래그와 정확한 project ref, Supabase URL, service role key, 로컬 비밀번호가 모두 있을 때만 허용됩니다.

Sprint 6-4에서 Seed/Cleanup을 Supabase JavaScript Admin API 방식으로 전환했습니다. DB URL과 `auth.users` 직접 SQL 의존성은 제거했습니다. service role 기반 `auth.admin.createUser()` / `deleteUser()`와 PostgREST employees/UAT 데이터 처리만 사용하며, 기존 권한 함수·RLS·Migration은 변경하지 않았습니다.

## 운영 보안 상태

Sprint 5-11D부터 Core 테이블의 authenticated 권한은 RLS 기반 CRUD에 필요한
권한만 유지합니다. `TRUNCATE`, `REFERENCES`, `TRIGGER`는 ERP 사용자에게 부여하지
않으며, 특히 RLS를 거치지 않는 `TRUNCATE`는 금지합니다.

## 공식 권한 체계

권한 정책은 다음 순서를 단일 기준으로 사용합니다.

```text
lib/permissions.ts
        ↓
API / Proxy / AppShell
        ↓
RPC 권한 함수
        ↓
RLS
```

UI의 버튼 노출만으로 권한을 보장하지 않으며 API, RPC, RLS에서 동일한 역할과
활성·승인 조건을 다시 검사합니다.

| 역할 | 공식 권한 |
| --- | --- |
| Admin | 전체 조회·생성·수정·삭제, 직원 관리, 설정 관리 |
| Manager | 조회, 프로젝트 생성·수정, 업무·출고 편집, 설정 등록·수정. 삭제 불가 |
| Staff | 조회, 업무·출고 생성·수정. 프로젝트 생성 및 삭제 불가 |
| Viewer | 조회 전용 |

모든 역할은 `employees.active = true`와 `approval_status = 'approved'`를 동시에
충족해야 합니다. 알 수 없는 role은 클라이언트에서 Viewer로 축소하며 DB에서는
허용하지 않습니다. Login, Authorization API, Proxy, AppShell 세션 변경 및 RLS가
동일한 기준을 사용합니다.

Core RLS 대상은 `projects`, `tasks`, `shipments`, `activity_logs`이며 상세 정책은
`docs/DATABASE.md`를 기준으로 합니다.

## 프로젝트 개요

공무팀 ERP는 공무팀의 실제 업무에서 사용하는 프로젝트, 업무, 출고, 파일 관리 시스템입니다. 현재는 공무팀 운영 안정성을 우선하며, 향후 다른 부서로 확장 가능한 구조를 목표로 합니다.

## 기술 스택

- Next.js 16 App Router
- TypeScript strict
- TailwindCSS
- Supabase
- Vercel
- GitHub

## 현재 주요 기능

- 로그인/로그아웃 및 Supabase session 기반 접근
- 직원 정보와 role 기반 권한 판단
- 프로젝트 등록, 목록, 상세, 수정, 삭제
- 프로젝트 생성 시 `task_templates` 기반 업무 자동 생성
- 프로젝트별 업무 목록, 담당자, 마감일, status 수정
- Dashboard KPI, TO DO LIST, TEAM WORKSPACE, 최근 활동
- Calendar 및 통합 Gantt
- 출고 관리
- 프로젝트 파일 메타데이터와 private Storage signed URL 기반 열기/다운로드
- Global Search
- Notification Center
- Activity Log 기록

## 실제 DB 기준

프로젝트 루트의 `db_schema_columns.csv`, `db_foreign_keys.csv` 기준 실제 테이블은 다음과 같습니다.

- `projects`
- `tasks`
- `employees`
- `project_files`
- `shipments`
- `task_templates`
- `activity_logs`

실제 FK로 확인된 관계는 `project_files.project_id -> projects.id`입니다. 코드에서는 `tasks.project_id`, `shipments.project_id`, `shipments.task_id`, `activity_logs.project_id`를 관계처럼 사용하지만 CSV FK 목록에는 없습니다.

`notices` 테이블은 현재 실제 DB 구조에서 확인되지 않았습니다. `/notices` 화면은 정적 placeholder입니다.

## 핵심 테이블 역할

### projects

프로젝트 기준 정보입니다. 주요 컬럼은 `id`, `project_code`, `project_name`, `client_name`, `assembly_vendor`, `process_type`, `salesperson`, `task_manager`, `status`, `start_date`, `end_date`, `completion_due_date`, `site_address`, `memo`, `created_at`, `updated_at`입니다.

### tasks

프로젝트별 업무입니다. 주요 컬럼은 `id`, `project_id`, `task_order`, `task_type`, `task_name`, `assignee`, `status`, `start_date`, `due_date`, `completed_date`, `created_at`입니다.

DB-2 판단:

- `tasks.project_id`는 코드 전반에서 프로젝트 연결의 핵심 값입니다.
- FK를 추가한다면 `projects.id` 참조와 `ON DELETE RESTRICT`가 적합합니다.
- 기존 데이터의 orphan task 여부를 먼저 확인해야 합니다.

### shipments

출고 정보입니다. 주요 컬럼은 `id`, `project_id`, `task_id`, `site_name`, `item_name`, `quantity`, `shipment_date`, `vehicle_number`, `driver_name`, `driver_phone`, `destination`, `receiver`, `status`, `memo`, `created_at`입니다.

DB-2 판단:

- `shipments.project_id`는 프로젝트 삭제 전 수동 정리 대상이며 `ON DELETE RESTRICT`가 적합합니다.
- `shipments.task_id`는 업무 완료로 자동 생성된 출고의 원천 업무 추적용입니다. nullable이므로 업무 삭제 시 `ON DELETE SET NULL`이 적합합니다.
- 수동 출고 등록 코드는 `project_id: null`을 저장하려 하지만 CSV는 `shipments.project_id`를 NOT NULL로 표시합니다. FK 적용 전 수동 출고 정책을 정리해야 합니다.

### activity_logs

사용자 활동 이력입니다. 주요 컬럼은 `id`, `created_at`, `employee_name`, `employee_email`, `action_type`, `target_type`, `target_id`, `project_id`, `title`, `description`입니다.

DB-2 판단:

- `activity_logs.project_id`는 최근 활동 표시용 nullable 연결입니다.
- 로그는 감사 이력 성격이 있으므로 프로젝트 삭제 시 `ON DELETE SET NULL`이 적합합니다.

### employees

직원 및 권한 정보입니다. CSV 기준 원격 DB 컬럼은 `id`, `name`, `position`, `active`, `created_at`, `email`, `auth_user_id`, `role`입니다.

Sprint DB-1 판단:

- `department`는 직원관리 화면에서 입력, 저장, 목록 표시, 검색에 사용되고 Global Search에서도 검색/표시에 사용되므로 유지합니다.
- `department`는 `supabase/migrations/20260716130000_add_department_to_employees.sql`로 추가 준비했습니다.
- `updated_at`은 직원 수정 이력 표시, 정렬, 검색에 사용되지 않고 저장 payload에만 남아 있었으므로 코드에서 제거했습니다.
- 원격 Supabase DB에는 아직 `department`가 없으므로 migration 적용 전에는 관련 select/save가 실패할 수 있습니다.

추가로 CSV 기준 `phone`, `memo`, `is_active` 컬럼도 없습니다. 현재 직원관리 화면은 해당 필드를 사용 중이며, `active` 컬럼과의 정합성은 별도 Sprint에서 판단해야 합니다.

### project_files

프로젝트 파일 메타데이터입니다. `project_id`는 실제 FK로 `projects.id`를 참조합니다. 파일 본문은 Supabase Storage `project-files` bucket을 사용합니다.

DB-2 판단:

- 이미 실제 FK가 존재하므로 이번 Sprint에서 변경하지 않습니다.
- 프로젝트 삭제 시 파일 메타데이터와 Storage object 정리 흐름이 현재 프로젝트 삭제 코드에 없으므로 삭제 정책은 별도 검토가 필요합니다.

## 개발 원칙

- 기존 기능을 삭제하지 않습니다.
- 실제 DB 구조를 추측하지 않습니다.
- DB 변경은 직접 실행하지 않고 migration 파일로만 준비합니다.
- 기존 데이터 삭제, `DROP TABLE`, 파괴적 변경은 금지합니다.
- 공통 로직은 필요할 때만 `lib`로 분리합니다.
- TypeScript strict를 유지하고 `any`를 사용하지 않습니다.
- 문서와 실제 코드/DB가 충돌하면 실제 코드/DB 기준으로 보고합니다.

## 최근 구조 메모

- Sprint 6-5부터 내부 직원 가입 정책은 `가입 요청 → 관리자 승인 → 로그인`이며 이메일 인증을 사용하지 않습니다. Supabase Confirm email은 관리자가 수동으로 OFF 상태를 유지합니다.
- 가입 상태 API는 `linked`, `auth_only_incomplete`, `employee_only_missing_auth`, `not_found`를 구분하며, 승인·활성 상태와 AppShell 가드가 실제 ERP 접근을 결정합니다.
- 직원 완전 삭제는 서버 전용 Admin API에서만 수행하며 비활성화, 가입 거절과 별도 동작입니다.
- `project_files` 테이블과 `project-files` private Storage bucket 기반 파일 기능이 추가되었습니다.
- `assembly_vendor`는 실제 `projects` 컬럼으로 확인되며 프로젝트 등록/수정/목록/상세/Gantt/Search에서 사용합니다.
- Notification Center는 별도 notifications 테이블 없이 기존 `tasks`, `projects`, `project_files` 기반으로 계산합니다.
- Sprint DB-1에서 `employees.department` migration을 준비하고, 불필요한 `employees.updated_at` 저장 payload를 제거했습니다.
- Sprint DB-2에서 프로젝트-업무-출고-활동로그 관계의 FK 정책을 감사하고 주석 처리된 FK 초안을 작성했습니다. 원격 DB 변경은 하지 않았습니다.

## 다음 작업 시 주의사항

- FK 적용 전 `tasks`, `shipments`, `activity_logs` orphan 데이터를 확인해야 합니다.
- 수동 출고 등록이 프로젝트 없이 허용되는지 먼저 결정해야 합니다.
- 프로젝트 삭제 시 `project_files`와 Storage object 정리 정책을 별도 검토해야 합니다.
- 직원 부서 기능을 유지하려면 `employees.department` migration을 원격 Supabase에 적용해야 합니다.
- 직원관리 화면의 `active`/`is_active`, `phone`, `memo` 불일치를 별도 작업으로 정리해야 합니다.
- 공지 기능을 DB 기반으로 확장하려면 `notices` 테이블 설계와 migration이 먼저 필요합니다.

## Sprint 9-4E Calendar 월간 Row 높이와 일정 overflow

월간 Calendar의 각 주 Row 높이는 해당 주에 실제 렌더링되는 회사 일정 lane 수와 개인 일정 카드 수를 함께 합산해 독립 계산합니다. 전체 일정은 회사 lane 아래에 접근 가능한 소유·공유 개인 일정을 모두 표시하고, All Task·My Task·Share Task는 각 필터 결과에서 날짜별 카드 수가 가장 많은 Cell을 기준으로 개인 영역 높이를 계산합니다. 개인 일정은 64px 카드 본체와 4px 카드 간격을 동일한 공통 상수로 렌더링·높이 계산에 사용하며, 제목·메타·완료·댓글·공유 표시는 카드 경계 안의 compact 단일 행으로 제한합니다. 일정이 적은 주는 최소 높이를 유지하고 많은 주만 필요한 만큼 확장되며, 필터와 완료 일정 설정 변경 및 기존 Realtime 갱신 시 즉시 재계산됩니다. Drag & Drop, Live Editing Lock, 공유 구조는 유지하며 DB 변경은 없습니다.

## Sprint 9-5 공장 재고 원자재 사용 대상

원자재 사용등록은 기존 `material_contract_allocations.allocation_type = 'factory'`를 `공장 재고`로 표시합니다. 공장 재고 대상은 프로젝트와 사용처명을 요구하지 않고 `project_id = null`로 저장하며, 프로젝트 대상은 기존처럼 실제 프로젝트가 필수입니다. 이 모듈의 예정·확정은 공급계약 물량을 선점·확정하는 배정 흐름이며 별도 물리 재고 입고·출고 원장은 현재 존재하지 않습니다.

사용내역 목록의 예정·확정 변경은 기존 allocation PATCH API와 `save_material_contract_allocation` RPC를 재사용합니다. 관리자만 인라인 Select를 사용할 수 있고, 행 단위 저장 중 잠금과 실패 시 화면 상태 복원을 적용합니다. 테이블은 주요 식별값을 한 줄로 유지하고 발주번호만 최대 두 줄로 표시합니다.

원자재 배정 변경 이력은 별도 Audit 테이블 없이 기존 `activity_logs`에 저장합니다. 저장 RPC 안에서 변경 필드별 before/after와 사용자용 표시값을 기록하며, 사용내역 행의 변경 이력 버튼을 열 때 해당 allocation 로그만 지연 조회합니다. Shared Workspace 전용 `source_item_id`는 사용하지 않습니다.

프로젝트 상세의 원자재 사용 영역은 프로젝트 배정 원본과 현재 계약단가를 한 번에 조회해 예정·확정 원가를 분리 계산합니다. 공장 재고와 취소 행은 집계에서 제외하며, 기존 `project_material_usages` 기반 통계 원가에는 자동 복제하지 않습니다. 계약 단가는 불변 핵심 조건이므로 별도 배정 단가 snapshot을 만들지 않습니다.

원자재 계약 알림은 관리자에게만 기존 Notification Inbox/Archive/Badge의 `raw_material` 카테고리로 표시합니다. 활성 계약의 배정 가능 가용량 20%·10%·5% 단계와 종료 30일·7일·당일·만료 이벤트를 DB에서 중복 없이 생성하며, 가용량이 20%를 초과해 회복한 뒤 임계값에 다시 진입하면 새 이벤트로 취급합니다. 평가는 별도 스케줄러 없이 관리자 알림 조회 시 수행하고 기존 공통 Realtime 채널을 재사용합니다.

## Sprint 9-5E Gantt Excel Export

Calendar Gantt의 Excel 다운로드는 화면에서 이미 계산된 최종 표시 목록을 사용하므로 현재 범위, 완료 현장 표시, 검색, 담당자·업무유형·조립처·상태·태그 필터, 보기 그룹·접힘 상태와 정렬을 그대로 유지하며 추가 조회를 하지 않습니다. 기간은 현재 Gantt 범위, 현재 월, 사용자 지정 중 선택하고 선택 기간과 겹치는 업무만 실제 `.xlsx`로 생성합니다.

`간트차트` 시트는 프로젝트·업무 기본 열과 일자별 타임라인을 함께 제공하며 월 병합 헤더, 주말·오늘 강조, 완료·진행·대기·지연 막대 색상, 프로젝트 구분선, 틀 고정, 가로 인쇄 설정을 포함합니다. 숨은 ID나 내부 메타데이터는 내보내지 않으며 DB 변경은 없습니다.

## Sprint 9-5F Staff Calendar-only 권한

Calendar 전용 스태프는 기존 Staff role 전체가 아니라 `employees.role = 'staff'`, 연결된 `organizations.name = '기타'`, `employees.position = '스태프'`를 모두 만족하는 활성·승인 사용자입니다. 공백과 대소문자를 정규화하며, 다른 조직 또는 직급의 Staff는 기존 업무·출고 권한을 유지합니다.

Calendar-only 사용자는 로그인 후 `/calendar`로 이동하고 Sidebar에서도 Calendar만 표시됩니다. 페이지 경로는 `/calendar`만 허용하며 Calendar 조회에 필요한 GET API와 인증 확인만 허용합니다. Month·Timeline·Gantt 조회, 필터, 프레젠테이션, Excel 다운로드, Realtime, Presence는 유지하고 일정·Gantt·공유·댓글 mutation과 Editing Lock 획득은 차단합니다.

API 공통 경계는 mutation 요청에 403을 반환하고, `20260811140000_calendar_only_staff_rls.sql`은 기존 RLS 활성 public 테이블마다 restrictive INSERT/UPDATE/DELETE 정책을 추가해 Supabase 직접 호출도 차단합니다. Migration은 운영 DB에 자동 적용하지 않습니다.

## Sprint 9-5F-1 Calendar-only 판정 보정

2026-08-12 운영 데이터 읽기 점검에서 인증 계정이 연결된 후보 직원은 `role = 'staff'`, 조직 `id = 19 / name = '기타'`였지만 `position = 'dd'`였습니다. 조직 관계 누락이 아니라 직급 데이터가 정의된 판정 조건(`스태프`)과 다른 것이 실제 미판정 원인입니다. 인증 조회는 조직 `id`, `name`을 명시적으로 선택하며 role·직급·조직명은 앞뒤 공백과 대소문자를 정규화합니다. 판정 조건 자체는 완화하지 않았고 운영 직원 데이터도 자동 변경하지 않습니다.

## Sprint 9-5G Gantt Excel Export Templates

Gantt Excel Dialog은 `현재 화면형`, `현장별 공정표`, `보고용 요약`의 세 출력 양식을 제공합니다. 세 양식 모두 현재 Gantt에서 필터·정렬·그룹·접힘 상태까지 반영해 계산된 표시 업무를 공통 정규화 데이터로 사용하며 추가 DB 조회를 하지 않습니다. 기간은 기존 현재 Gantt 기간, 현재 월, 직접 선택 옵션을 공통 사용합니다.

현재 화면형은 Sprint 9-5E workbook 구조를 유지합니다. 현장별 공정표는 전체 선택 시 업무가 있는 프로젝트마다 안전한 고유 Sheet를 만들고, 단일 선택 시 해당 Sheet만 만듭니다. 보고용 요약은 필터 결과 기준 KPI와 프로젝트별 업무 상태·평균 진행률·프로젝트 기간 막대를 한 Sheet에 표시합니다. 프로젝트 기간은 프로젝트 시작/종료 필드를 우선하고 없을 때 표시 업무의 최소 시작일과 최대 종료일을 사용합니다. 모든 생성은 기존 `xlsx-js-style` 기반 client-side 방식이며 DB migration과 신규 dependency는 없습니다.

## Sprint 9-5H Project Task Memo Visibility

프로젝트 업무 메모 원본은 `tasks` 컬럼이 아니라 기존 `task_notes` 테이블이며 Task 하나에 여러 원본 메모를 유지합니다. Calendar, Gantt, 업무 목록과 Task 상세는 복사본을 만들지 않고 접근 가능한 `task_notes` 중 최신 원본 행의 내용과 `is_important`를 Preview로 표시합니다. 일반 메모는 📝, 중요 메모는 ⚠로 표시하고 전체 내용은 기존 Task 상세·프로젝트 메모 Drawer에서 확인합니다.

메모 생성·수정·삭제는 기존 `task_notes` RLS와 Activity Log를 그대로 사용합니다. `task_notes`는 기존 공통 Realtime channel에 추가되어 중요도 변경도 같은 갱신 이벤트로 전달됩니다. Morning Brief, 확인일, personal notes, Reference Task에는 연결하지 않습니다. 현장별 공정표 Excel만 메모 열을 추가하며 중요 메모는 `[중요]` 접두사로 출력합니다.

## Sprint 9-5I Task Memo Check Date

`task_notes.check_date`는 시간 없는 선택적 로컬 날짜(`date`)입니다. Calendar는 별도 row를 저장하지 않고 확인일이 있는 원본 메모를 가상 회사 일정으로 변환하며, 전체 일정과 회사 일정에만 기존 필터 정책대로 표시합니다. Morning Brief는 현재 사용자가 볼 수 있는 Task를 한 번에 조회해 오늘과 지연 확인사항을 note id 기준으로 표시합니다.

Notification Engine은 조회 시점에 오늘/지연 확인사항을 평가합니다. 알림 ID는 note id와 check date를 포함하므로 같은 날짜의 반복 평가는 하나의 알림으로 합쳐지고 날짜 변경은 새 이벤트가 됩니다. 알림 대상은 관리자에게는 접근 가능한 전체 Task, 일반 직원에게는 기존 담당 Task 범위입니다. personal notes나 별도 Calendar Event 복사본은 만들지 않습니다.

## Sprint 9-5J Active Important Note Reminder

Calendar의 공정 Bar `📝/⚠`는 최신 원본 메모의 존재와 중요도를 나타냅니다. multi-day 업무는 주 경계별 visible segment로 나뉘며 각 주에서 보이는 대표 segment 안에 제목과 아이콘을 함께 렌더링합니다. 매 날짜별 아이콘은 만들지 않습니다.

오늘이 미완료 Task 기간에 포함되고 최신 메모가 중요할 때 Calendar에 `⚠ 진행 메모` 가상 회사 일정을 한 건 표시합니다. 같은 원본 메모의 `check_date`가 오늘이면 기존 `⚠ 확인`만 유지해 중복을 제거합니다. 이 active reminder는 Calendar 시각 표시 전용이며 Morning Brief, Notification, Gantt, Timeline, Excel에는 추가하지 않습니다.
## Sprint 9-7B-1 자재 사용구분 UI

원자재 계약의 사용등록 Dialog에서 프로젝트를 선택하면 활성 자재 사용구분을 선택하거나 다음 차수를 즉시 생성할 수 있습니다. 중앙 원자재 사용요청 화면은 `차수별 보기`와 기존 `전체 요청`을 함께 제공하며, 프로젝트 상세에는 차수별 요청·미배정 요약을 표시합니다.

## Sprint 9-9A Project Completion Preflight Check

프로젝트 상세에서 Task 상태 변경 결과 모든 Task가 완료되면 프로젝트를 즉시 완료하지 않고 `GET /api/projects/{id}/completion-check`의 점검 결과를 Dialog로 확인합니다. 점검은 기존 원본 데이터에서 미완료·지연 Task, 지연 Task Note 확인일, 활성 원자재 사용요청의 미배정량, 유효 미완료 출고, `project_sections.process_type = '본납-도어'` 존재 여부를 프로젝트 단위 batch 조회로 계산합니다.

최종 완료는 같은 endpoint의 `PATCH`를 사용합니다. 경고가 있으면 명시적 acknowledgement가 필요하고, 최초 결과 fingerprint와 서버 최신 결과가 다르면 완료하지 않고 409와 최신 결과를 반환합니다. 완료 mutation은 기존 Project Editing Lock과 `project_update` 권한을 유지하며, 강제 완료 요약만 Activity Log metadata에 저장합니다. Viewer와 Calendar-only Staff는 완료할 수 없고 별도 DB table 또는 migration은 없습니다.
