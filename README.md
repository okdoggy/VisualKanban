# VisualKanban (Big-Frame Implementation)

사내 SW 개발자용 협업 웹앱의 1차 큰 틀 구현입니다.

## 포함된 기능 (현재 단계)
- 로그인 (`계정 + 비밀번호`)
- 초기 비밀번호(0000) 강제 변경 플로우
- Dashboard (로그인 후 첫 화면)
- Todo
- Search
- Task Board (테이블형)
- Kanban (DnD + 퀵액션 + 멀티선택 + Undo)
- Gantt (타임라인 뷰)
- Whiteboard
- 권한 관리(Admin / Editor / Viewer / Private)
- 로그인 상태 확인 배지 + `/api/auth/me`
- Admin Users / Audit 화면
- PostgreSQL 기반 공유 상태 API (`/api/state`)

## 권한 정책
- **Admin**: 전체 조회/수정 가능
- **Editor**: Read + Write
- **Viewer**: Read only
- **Private**: 본인 외 접근 제한(기능/태스크 범위)
- 명시적 권한이 없으면 기본값은 **Viewer**

## 테스트 계정
초기 데이터 기준:
- `admin / 0000`

초기 배포 데이터는 `admin` 계정과 기본 프로젝트 `VG_Cloud` 1개만 포함되며, 태스크/Todo 등 업무 데이터는 비어 있습니다.

> `0000`으로 로그인하면 비밀번호 변경 페이지로 강제 이동됩니다.

## 로컬 실행
```bash
npm install
cp .env.example .env
npm run dev
```
- http://localhost:3000

## PostgreSQL 공유 상태 백엔드
`pg`(MIT 라이선스) 기반으로 `/api/state`에 optimistic concurrency(버전 충돌 감지)를 적용했습니다.

### 환경 변수
`.env.example` 참고:
- `DATABASE_URL` (필수)
- `PGSSLMODE`, `PGSSL_REJECT_UNAUTHORIZED` (선택)
- `VK_STATE_SYNC_ENABLED`, `VK_STATE_SYNC_POLL_INTERVAL_MS` (서버 동기화 옵션)
- `NEXT_PUBLIC_VK_STATE_SYNC_ENABLED`, `NEXT_PUBLIC_VK_STATE_SYNC_POLL_INTERVAL_MS`, `NEXT_PUBLIC_VK_STATE_WORKSPACE_ID` (클라이언트 동기화 옵션)

### DB 부트스트랩/마이그레이션
별도 마이그레이션 실행 없이 API 최초 접근 시 아래를 자동 수행합니다.
1. `visualkanban_workspace_state` 테이블 생성 (없을 때)
2. 요청한 `workspaceId`의 상태 row 생성 (없을 때)
3. seed 기반 기본 상태 저장 (`version=1`)

부트스트랩 확인 예시:
```bash
curl "http://localhost:3000/api/state?workspaceId=main"
```

### API 계약
- `GET /api/state?workspaceId=main`
  - 응답: `{ ok, workspaceId, version, state }`
- `PUT /api/state`
  - 요청 body: `{ workspaceId, expectedVersion, state }`
  - 인증: 로그인 쿠키(`vk_user`) 필요 (미인증 시 401)
  - 성공 응답: `{ ok, workspaceId, version, state }`
  - 버전 충돌 시: `409` + 현재 `{ workspaceId, version, state }`

## 품질 확인
```bash
npm run typecheck
npm run lint
npm run build
```

## Docker 실행 (App + PostgreSQL)
```bash
docker compose up --build
```
- App: http://localhost:3000
- Postgres: `localhost:${POSTGRES_PORT:-5432}`

Compose는 기본적으로 아래 연결을 사용합니다.
- `DATABASE_URL=postgresql://visualkanban:visualkanban@postgres:5432/visualkanban`

## 주요 라우트
- `/login`
- `/auth/change-password`
- `/app/dashboard`
- `/app/todo`
- `/app/search`
- `/app/admin/users`
- `/app/admin/audit`
- `/api/auth/me`
- `/api/state`
