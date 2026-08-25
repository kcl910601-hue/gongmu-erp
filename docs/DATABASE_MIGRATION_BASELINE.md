# Production Legacy Migration Baseline

## 기준 전환

- Production project: `gongmu-erp`
- Production project ref: `cropibqvvzpxlnqpkyto`
- Backup captured: `2026-08-25`
- Backup location: `C:\Users\user\Desktop\ERP_Backup\gongmu-erp\2026-08-25\`
- Legacy migrations: 94
- Legacy range: `20260714162000` through `20260821160000`
- Legacy archive: `supabase/archive/legacy-migrations/`
- Legacy verification archive: `supabase/archive/legacy-verification/`
- Baseline version: `20260825143018`
- Baseline migration: `supabase/migrations/20260825143018_production_legacy_baseline.sql`

Production에는 현재 schema와 data가 이미 존재한다. Baseline SQL은 새 환경에서 현재
Application-managed schema를 재현하기 위한 파일이며 Production에서는 실행하지 않는다.
Production에는 검증된 Baseline version만 migration history에 `applied`로 기록한다.

## Baseline 범위

Baseline은 2026-08-25 Production public schema-only logical backup을 원본으로 한다.
원본 Backup은 수정하지 않았다.

포함:

- public table, enum, sequence, function/RPC, trigger
- PK, FK, unique, check, index
- RLS, policy, grant
- `public.handle_new_signup_request()`와 `auth.users` custom trigger
- `storage.objects`의 `project-files` custom policy 3개
- `supabase_realtime`의 Application table membership 19개

제외:

- Production data와 `auth.users` data
- Storage object bytes
- Supabase platform schema, internal role, internal migration metadata
- `employees.department`
- 현재 Production에 없는 `user_favorite_projects`
- 현재 Production에 없는 process normalization function/trigger

Production에서 확인된 extension은 platform이 제공하는 상태를 사용한다. Baseline은
extension 내부 object나 platform-owned extension을 중복 생성하지 않는다.

## Storage bucket bootstrap

`project-files` bucket row는 schema DDL이 아닌 platform configuration data이므로 Baseline
Migration의 top-level INSERT에서 분리한다. 새 Supabase 환경에서 다음 idempotent bootstrap을
별도 승인 후 실행한다. Production baseline history 정렬 과정에서는 실행하지 않는다.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, null, null)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
```

Storage 실제 파일 2개는 Backup 폴더의 `storage/project-files/`에 별도 보존한다.

## Verification 분류

특정 Legacy Migration의 preflight/postflight 및 과거 Sprint test plan 36개는
`supabase/archive/legacy-verification/`으로 이동했다.

현재 운영 invariant로 유지한 16개:

- core RLS와 security grants
- employee/Auth consistency
- LME reference/partner type consistency
- shared workspace Realtime
- universal editing lock
- material allocation audit와 calendar-only RLS
- material usage request lifecycle/group integrity
- process master consistency
- Project Cost import, Glass, Coating, Accessory 최신 검증

## 이후 Migration 규칙

신규 migration은 Baseline보다 큰 14자리 timestamp를 사용한다. 예정 lineage:

1. `20260825143018_production_legacy_baseline.sql`
2. `<next>_create_user_favorite_projects.sql`
3. `<next>_enforce_current_process_type_integrity.sql`
4. 이후 신규 migration

모든 신규 DB 변경은 migration 생성, 격리 환경 검증, `migration list`,
`db push --dry-run`, 승인된 `db push`, verification 순서로 처리한다.

## 금지 명령

Production에서는 다음을 실행하지 않는다.

- Baseline SQL 실행
- `supabase db reset`
- 기존 94개 Legacy Migration 재실행
- 검토되지 않은 `supabase db push`
- SQL Editor를 통한 수동 schema 변경

## Backup 및 rollback

History 전환 전 Backup의 `checksums.sha256` 전체 검증이 통과해야 한다. Backup에는 public
schema/data, catalog manifest, Storage metadata와 실제 파일 bytes가 포함된다. Production
Auth 사용자 data는 별도 export하지 않았다.

Baseline history 기록 뒤 아직 신규 migration을 적용하지 않은 상태에서 문제가 발견되면:

```powershell
npx.cmd --yes supabase@2.115.0 migration repair `
  --linked `
  --status reverted `
  20260825143018
```

이 rollback은 migration history만 되돌린다. Production schema/data rollback은 수행하지 않는다.
Legacy archive는 Git 작업 트리에서 원래 위치로 되돌릴 수 있어야 한다.
