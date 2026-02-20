from pathlib import Path
from playwright.sync_api import Page, sync_playwright

BASE_URL = "http://localhost:3100"
OUT_DIR = Path("docs/presentations/assets")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def save(page: Page, filename: str):
    path = OUT_DIR / filename
    page.screenshot(path=str(path), full_page=True)
    print(path)


def wait_for_store_ready(page: Page):
    page.wait_for_function(
        """
        () => {
          const raw = localStorage.getItem('visual-kanban-state');
          if (!raw) return false;
          try {
            const parsed = JSON.parse(raw);
            return Boolean(parsed?.state?.currentUserId);
          } catch {
            return false;
          }
        }
        """,
        timeout=15000,
    )


def do_login(page: Page, password: str):
    page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.fill('input[type="text"], input:not([type])', "admin")
    page.fill('input[type="password"]', password)
    page.get_by_role("button", name="로그인").click()
    page.wait_for_timeout(2000)


def ensure_logged_in(page: Page) -> str:
    """
    Returns the active admin password in this browser context.
    """
    current_password = "0000"
    do_login(page, current_password)

    # 0000 may be invalid if this browser context already changed it.
    if "/login" in page.url:
        current_password = "admin1111"
        do_login(page, current_password)

    if "/auth/change-password" in page.url:
        new_password = "admin1111"
        fields = page.locator('input[type="password"]')
        fields.nth(0).fill(new_password)
        fields.nth(1).fill(new_password)
        page.get_by_role("button", name="변경 후 계속").click()
        page.wait_for_url("**/app/dashboard", timeout=15000)
        current_password = new_password
    elif "/app/dashboard" not in page.url:
        page.goto(f"{BASE_URL}/app/dashboard", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

    wait_for_store_ready(page)
    return current_password


def open_nav(page: Page, label: str, url_part: str):
    page.get_by_role("link", name=label).first.click()
    page.wait_for_url(f"**{url_part}**", timeout=20000)
    page.wait_for_timeout(1400)


def open_search(page: Page, query: str):
    page.get_by_role("button", name="글로벌 검색 열기").click()
    page.wait_for_timeout(400)
    page.get_by_placeholder("검색어를 입력하세요 (⌘/Ctrl + K)").fill(query)
    page.locator("#global-search-dialog").get_by_role("button", name="검색", exact=True).click()
    page.wait_for_url("**/app/search**", timeout=20000)
    page.wait_for_timeout(1400)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        ensure_logged_in(page)

        # Dashboard
        page.wait_for_url("**/app/dashboard", timeout=20000)
        page.wait_for_timeout(1400)
        save(page, "dashboard.png")

        # To do
        open_nav(page, "할 일", "/app/todo")
        save(page, "todo.png")

        # Whiteboard / Kanban / Gantt
        open_nav(page, "화이트보드", "/whiteboard")
        save(page, "whiteboard.png")

        open_nav(page, "칸반 보드", "/kanban")
        save(page, "kanban.png")

        open_nav(page, "간트 차트", "/gantt")
        save(page, "gantt.png")

        # User management
        open_nav(page, "사용자 관리", "/app/admin/users")
        save(page, "admin-users.png")

        # Search
        open_search(page, "VG_Cloud")
        save(page, "search.png")

        browser.close()


if __name__ == "__main__":
    main()
