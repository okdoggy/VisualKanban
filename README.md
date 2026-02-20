# VisualKanban

사내 협업(할 일 · 칸반 · 간트 · 화이트보드 · 사용자/프로젝트 관리)을 하나의 워크스페이스에서 운영하기 위한 웹앱입니다.

---

## 1) 현재 제공 기능

### 핵심 페이지
- **Dashboard**: 프로젝트/진행상태/개인 할 일 요약
- **To do**: 개인 실행 항목 관리 (반복/우선순위)
- **Kanban**: Backlog/To do/In Progress/Done 흐름 기반 협업 보드
- **Gantt**: 트리 + 타임라인 기반 일정/계층 관리
- **Whiteboard**: 프로젝트 단위 스케치/메모 협업
- **Search**: To do/칸반/간트 텍스트 통합 검색
- **사용자 관리**: 사용자 디렉터리 + 프로젝트 멤버십 관리

### 인증/권한
- 로그인 (`username + password`)
- 초기 비밀번호 `0000` 로그인 시 변경 강제
- 프로젝트 멤버십 기반 권한:
  - `owner`, `write`, `read`
- 서비스 기본 역할:
  - `admin`, `editor`, `viewer`

---

## 2) UI/UX 운영 원칙 (프로젝트 반영 사항)

- 불필요한 박스/중복 정보 제거
- 상세 팝업은 **핵심 편집 항목 중심**으로 단순화
- 드래그 인터랙션은 텍스트/행/그래프 등 사용자가 직관적으로 잡는 영역 중심
- 강조는 테두리만이 아니라 **내부 하이라이트**로 시인성 강화
- 사용자 수가 많아도 빠르게 선택할 수 있도록 **자동완성 입력 UX** 적용
- 화면 구조(좌측 워크스페이스/상단 현재화면/중앙 콘텐츠)는 전 페이지에서 일관 유지

---

## 3) 데이터 저장 구조

### 저장 방식
- 클라이언트 상태: Zustand (persist)
- 서버 공유 상태: PostgreSQL (`/api/state`)
- 동기화 방식: optimistic concurrency (`expectedVersion`) + 충돌 시 재동기화

### 공유 상태 API
- `GET /api/state?workspaceId=main`
- `PUT /api/state`
  - body: `{ workspaceId, expectedVersion, state }`
  - 인증 쿠키(`vk_user`) 필요
  - 버전 충돌 시 `409` + 현재 스냅샷 반환

### DB 부트스트랩
최초 접근 시 자동으로:
1. `visualkanban_workspace_state` 테이블 생성
2. `workspaceId` row 생성
3. seed 상태 저장 (`version=1`)

---

## 4) 초기 데이터 (서비스 준비 상태)

- 기본 계정: `admin / 0000`
- 기본 프로젝트: `VG_Cloud` 1개
- 그 외 프로젝트/태스크/Todo/화이트보드 데이터: 비어 있음

> `0000` 로그인 후 새 비밀번호 변경이 필요합니다.

---

## 5) 로컬 실행 (개발)

```bash
npm install
cp .env.example .env
npm run dev
```

- App: http://localhost:3000

---

## 6) Docker 실행 (권장 운영 방식)

### 6-1. 빠른 시작 (Compose)
```bash
cp .env.example .env
docker compose up -d --build
```

- App: http://localhost:3000
- Postgres: `localhost:${POSTGRES_PORT:-5432}`
- 상태 확인:
  ```bash
  docker compose ps
  docker compose logs -f visualkanban
  ```
- 종료:
  ```bash
  docker compose down
  ```

### 6-2. 이미지 생성/실행 (단독 명령)
```bash
# 1) 이미지 빌드
docker build -t visualkanban:latest .

# 2) 네트워크 생성
docker network create visualkanban-net

# 3) PostgreSQL 컨테이너 실행
docker run -d \
  --name visualkanban-postgres \
  --network visualkanban-net \
  -e POSTGRES_USER=visualkanban \
  -e POSTGRES_PASSWORD=visualkanban \
  -e POSTGRES_DB=visualkanban \
  -p 5432:5432 \
  -v visualkanban-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

# 4) 앱 컨테이너 실행
docker run -d \
  --name visualkanban \
  --network visualkanban-net \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://visualkanban:visualkanban@visualkanban-postgres:5432/visualkanban \
  -e VK_STATE_SYNC_ENABLED=true \
  -e VK_STATE_SYNC_POLL_INTERVAL_MS=5000 \
  -e NEXT_PUBLIC_VK_STATE_SYNC_ENABLED=true \
  -e NEXT_PUBLIC_VK_STATE_SYNC_POLL_INTERVAL_MS=5000 \
  -e NEXT_PUBLIC_VK_STATE_WORKSPACE_ID=main \
  visualkanban:latest
```

### 6-3. npm 스크립트로 Docker 제어
```bash
npm run docker:build
npm run docker:up
npm run docker:logs
npm run docker:down
```

---

## 7) 환경 변수

`.env.example` 참고:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` (Docker DB 기본값)
- `DATABASE_URL` (필수)
- `PGSSLMODE`, `PGSSL_REJECT_UNAUTHORIZED` (선택)
- `VK_STATE_SYNC_ENABLED`, `VK_STATE_SYNC_POLL_INTERVAL_MS`
- `NEXT_PUBLIC_VK_STATE_SYNC_ENABLED`
- `NEXT_PUBLIC_VK_STATE_SYNC_POLL_INTERVAL_MS`
- `NEXT_PUBLIC_VK_STATE_WORKSPACE_ID`

---

## 8) 품질 확인 명령어

```bash
npm run typecheck
npm run lint
npm run build
```

프로덕션 실행(로컬 빌드 후):
```bash
npm run build
npm run start
```

---

## 9) 발표 자료(PPT) 자동 생성

### 결과물
- `docs/presentations/VisualKanban_소개_페이지상세.pptx`
- `docs/presentations/VisualKanban_기술_워크플로우_개발자용.pptx`

### 생성 스크립트
- 스크린샷 캡처: `scripts/capture_visualkanban_screenshots.py`
- PPT 생성: `scripts/generate_visualkanban_presentations.py`

예시:
```bash
# 1) 앱 실행 (포트 3100 기준)
npm run dev -- -p 3100

# 2) 화면 캡처
python3 scripts/capture_visualkanban_screenshots.py

# 3) PPT 생성
python3 scripts/generate_visualkanban_presentations.py
```

---

## 10) Oh-my-codex 전용 Agent (VisualKanban Developer)

VisualKanban 노하우를 재사용하기 위한 커스텀 프롬프트를 추가했습니다.

- 경로: `~/.codex/prompts/visualkanban-developer.md`
- 호출:  
  `/prompts:visualkanban-developer "요청 내용"`

해당 Agent는 아래를 중점 가이드합니다:
- 이 프로젝트에서 자주 받은 피드백 패턴
- UI/UX 단순화/직관화 체크리스트
- 권한/동기화/상세팝업 관련 회귀 방지 포인트
- 다음 프로젝트에서 반복 실수를 줄이는 구현 조언

---

## 11) 주요 라우트

- `/login`
- `/auth/change-password`
- `/app/dashboard`
- `/app/todo`
- `/app/search`
- `/app/projects/[projectId]/kanban`
- `/app/projects/[projectId]/gantt`
- `/app/projects/[projectId]/whiteboard`
- `/app/admin/users`
- `/app/admin/audit`
- `/api/auth/me`
- `/api/state`
