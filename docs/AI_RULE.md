# AI_RULE.md

# 공무팀 ERP AI 개발 규칙 (Project Constitution)

## 1. 프로젝트 목적

이 프로젝트는 공무팀이 실제 사용하는 ERP를 구축하는 것을 목표로 한다.
최우선 기준은 '실무에서 매일 사용하기 편한 ERP'이다.

## 2. 기술 스택

-   Next.js 16 (App Router)
-   TypeScript (strict)
-   TailwindCSS
-   Supabase
-   Vercel
-   GitHub

## 3. 개발 원칙

-   기존 기능을 삭제하지 않는다.
-   기능 추가는 기존 동작을 유지하는 방향으로 한다.
-   작은 단위로 수정하고 바로 테스트한다.
-   공통 로직은 lib/ 로 분리한다.
-   TypeScript 오류 없이 작성한다.

## 4. 폴더 규칙

app/ 화면 components/ 재사용 UI lib/ 공통 비즈니스 로직 docs/ 프로젝트
문서

## 5. lib 규칙

공통 기능은 반드시 lib에 둔다. 예시 - auth.ts - activity.ts -
dashboard.ts - projects.ts - tasks.ts - shipments.ts

## 6. UI 규칙

-   Apple + Notion + ERP 스타일
-   Rounded-2xl
-   shadow-sm
-   Slate 계열 + Blue 포인트
-   여백을 넉넉하게 사용
-   일관된 버튼 스타일 유지

## 7. 권한

admin manager member sales viewer

새 기능은 항상 권한을 고려한다.

## 8. 데이터베이스

주요 테이블 - projects - tasks - shipments - employees -
task_templates - activity_logs

DB 변경 시 마이그레이션 및 기존 데이터 영향 여부를 고려한다.

## 9. Activity Log

다음 작업은 모두 activity_logs에 기록하는 것을 원칙으로 한다. - 프로젝트
생성 - 프로젝트 수정 - 업무 완료 - 출고 등록 - 직원 관리 - 중요 설정
변경

## 10. Codex 작업 규칙

Codex는 다음을 반드시 지킨다. 1. 기존 기능 삭제 금지 2. TypeScript 오류
금지 3. 기존 UI 유지 4. 필요한 파일만 수정 5. 변경 이유를 설명

## 11. Git 규칙

기능 단위 Commit 예시 feat: activity log 추가 fix: 로그인 오류 수정
refactor: auth 공통화

## 12. 문서

README.md ROADMAP.md CHANGELOG.md DATABASE.md AI_RULE.md CODEX_GUIDE.md
CODING_RULE.md UI_GUIDE.md

문서를 최신 상태로 유지한다.

## 13. 장기 목표

v1.0 : 공무팀 정식 사용 v1.5 : 영업팀 확장 v2.0 : 회사 전체 ERP v3.0 :
모바일 앱

## 14. AI에게 항상 전달할 지침

-   기존 기능을 우선 보호한다.
-   새 기능은 기존 구조를 활용한다.
-   중복 코드를 만들지 않는다.
-   lib 공통 함수를 우선 사용한다.
-   실무 사용성을 최우선으로 고려한다.
