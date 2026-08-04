# 개발 로드맵

## Sprint 9-0

- [x] Shared Workspace 공통 Supabase Realtime 구독
- [x] Calendar·My Workspace·댓글·Timeline·공유·Notification 부분 재조회 연동
- [x] Realtime 및 로컬 변경 이벤트 debounce 통합
- [x] Realtime publication migration 및 검증 SQL 준비
- [ ] 운영 Supabase migration 적용 및 다중 사용자 UAT

## Sprint 8-9D

- [x] 월간 캘린더 주차별 일정 수 기반 Row 높이 자동 확장
- [x] 개인 일정 카드 클릭 상세 보기 복원
- [x] Calendar 카드 정보를 Dashboard 수준으로 간소화
- [x] 기존 개인 일정 액션·댓글·Timeline 상세 기능 재사용
- [ ] 실제 다중 사용자 Calendar UAT

## Sprint 8-9C

- [x] My Workspace·Calendar 댓글 수 Badge 일괄 집계
- [x] 공통 개인 일정 액션 컴포넌트와 권한 판정
- [x] Calendar 소유자 공유·고정·삭제 기능 및 상세 정보 보강
- [x] 댓글 변경 후 공통 이벤트 기반 Badge 동기화
- [ ] 실제 다중 사용자 Calendar UAT

## Sprint 8-9B

- [x] 기존 activity_logs 기반 Shared Workspace Timeline 준비
- [x] 일정·날짜·공유·댓글 활동의 DB trigger 기록
- [x] My Workspace·Calendar 공통 Timeline UI
- [x] 소유자·현재 참여자 조회 권한과 RLS
- [ ] 운영 Supabase migration 적용 및 다중 사용자 UAT

## Sprint 8-9A

- [x] Shared Comments Phase 1 코드 및 migration 준비
- [x] 소유자·edit·view 참여자 댓글 조회/작성과 작성자 수정·삭제
- [x] 원본 소유자의 댓글 관리 삭제
- [x] My Workspace·Calendar 공통 댓글 UI와 Notification Center 연동
- [ ] 운영 Supabase migration 적용 및 다중 사용자 UAT
- [ ] Sprint 8-9B Activity Timeline

## Sprint 8-8A

- [x] Shared Workspace Phase 1 코드 및 migration 수정본 준비
- [x] 원본 1개 기반 TODO·Memo·개인 일정 공유
- [x] 공유 초대 수락·거절·취소와 view/edit 권한
- [x] Calendar 공유 필터와 권한 기반 날짜 드래그 이동
- [ ] 운영 Supabase migration 적용 및 다중 사용자 UAT

## Sprint 진행 현황

- [x] Sprint 5-11A: UI → API → RPC → RLS 권한 및 인증 기준 통합
- [x] Sprint 5-11B: Core RLS 통합 migration 및 권한 문서 동기화
- [ ] Sprint 5-12: 협력업체 Active 통합
  - Quick Create 비활성 업체 제외
  - PDF 업체 선택 비활성 업체 제외
  - Project Filter 정책 정리
  - 공통 Active 조회 함수 적용

## v0.9 (현재)

-   로그인
-   프로젝트
-   업무
-   출고
-   직원관리
-   업무 템플릿
-   Activity Log

## v1.0

-   최근 활동
-   알림
-   업무 템플릿 수정/삭제
-   프로젝트 생성 로그

## v1.5

-   영업팀 화면
-   파일첨부
-   Realtime

## v2.0

-   회사 전체 ERP
