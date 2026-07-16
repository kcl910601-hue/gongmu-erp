# 공무팀 ERP / Workspace

공무팀의 프로젝트, 업무, 출고, 활동 이력을 한곳에서 관리하기 위한 ERP/Workspace입니다.

현재는 프로젝트 관리, 업무(Task) 관리, Dashboard, TO DO LIST, TEAM WORKSPACE를 중심으로 실제 업무 흐름에 맞춰 작은 Sprint 단위로 개선하고 있습니다.

## 기술 스택

- Next.js 16 App Router
- TypeScript Strict
- TailwindCSS
- Supabase
- Vercel
- GitHub

## 주요 기능

- 로그인 / 권한 관리
- Dashboard
- TO DO LIST
- TEAM WORKSPACE
- 프로젝트 관리
- 프로젝트 상세 / Project Overview
- 업무(Task) 관리
- D-Day / 지연 표시
- Activity Log
- 출고 관리

## 현재 Dashboard 구조

1. KPI
2. TO DO LIST
3. TEAM WORKSPACE
4. 최근 프로젝트
5. 최근 활동

## 개발 원칙

- 작은 Sprint 단위로 개발합니다.
- 기존 기능을 삭제하지 않습니다.
- TypeScript 오류가 없는 상태를 유지합니다.
- Supabase 데이터를 임의로 삭제하지 않습니다.
- 문서 기준으로 개발하고 변경 내용을 기록합니다.

## 문서 안내

- `docs/PROJECT_CONTEXT.md`: 프로젝트 현재 상태와 Sprint 진행 맥락
- `docs/DATABASE.md`: Supabase DB 구조와 컬럼 정책
- `docs/ARCHITECTURE.md`: ERP 아키텍처와 레이어/도메인 구조
- `docs/CHANGELOG.md`: 실제 완료된 변경 기록
- `docs/UI_GUIDE.md`: UI 방향과 디자인 기준

## 실행 방법

```bash
npm install
npm run dev
npx tsc --noEmit --pretty false
npm run lint
```
