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
- Mindmap (노드 기반, Task 링크)
- Task 상세 + 댓글
- 권한 관리(Admin / Editor / Viewer / Private)
- 로그인 상태 확인 배지 + `/api/auth/me`
- Admin Users / Audit 화면

## 권한 정책
- **Admin**: 전체 조회/수정 가능
- **Editor**: Read + Write
- **Viewer**: Read only
- **Private**: 본인 외 접근 제한(기능/태스크 범위)
- 명시적 권한이 없으면 기본값은 **Viewer**

## 테스트 계정
초기 데이터 기준:
- `admin / 0000`
- `editor / 0000`
- `viewer / 0000`
- `me / 0000`

> `0000`으로 로그인하면 비밀번호 변경 페이지로 강제 이동됩니다.

## 실행
```bash
npm install
npm run dev
```
- http://localhost:3000

## 품질 확인
```bash
npm run typecheck
npm run lint
npm run build
```

## Docker 실행
```bash
docker compose up --build
```
- http://localhost:3000

## 라우트
- `/login`
- `/auth/change-password`
- `/app/dashboard`
- `/app/todo`
- `/app/search`
- `/app/projects/proj-visual/board`
- `/app/projects/proj-visual/kanban`
- `/app/projects/proj-visual/gantt`
- `/app/projects/proj-visual/mindmap`
- `/app/projects/proj-visual/tasks/task-1`
- `/app/projects/proj-visual/permissions`
- `/app/admin/users`
- `/app/admin/audit`
- `/api/auth/me`

## 다음 단계 제안
1. 스프린트 티켓화 (Epic/Story/Task)
2. 페이지 컨셉 정의
3. 페이지 디테일 정교화
4. 실제 백엔드/DB 연동 및 E2E 강화
