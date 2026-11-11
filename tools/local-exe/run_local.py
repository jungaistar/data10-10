# -*- coding: utf-8 -*-
"""회의록 요약 도우미 — 내 PC 에서 띄우기 (표준 라이브러리만 씀, 설치할 패키지 없음)

이 도구의 웹 파일(index.html · css · js · vendor)을 내 PC 안(127.0.0.1)에서만 열리는 주소로 띄우고
기본 브라우저를 엽니다. 다른 PC 에서는 이 주소에 들어올 수 없습니다. 회의록은 그 브라우저 안에만 저장됩니다.

  python run_local.py              → 기본 포트 18610 으로 띄우고 브라우저를 엶(쓰는 중이면 빈 포트를 골라 알림)
  python run_local.py --port 8765  → 포트를 정함
  python run_local.py --port 0     → 매번 빈 포트(임의)

포트를 고정하는 까닭: 브라우저 저장소는 주소(포트 포함)마다 따로라, 포트가 바뀌면 지난번 회의록이 안 보입니다.
사내 AI 서버에 CORS 허용을 요청할 때도 주소가 바뀌지 않아야 합니다.
  python run_local.py --no-browser → 브라우저를 열지 않음(점검용)

build_exe.bat 로 PyInstaller --onedir --noarchive 실행 파일을 만들면 웹 파일이 실행 파일 옆 _internal\\web 에 들어갑니다.
"""
import argparse
import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser

# 이 도구가 쓰는 파일만 내보냅니다(리포의 docs · supabase · scripts 같은 것은 내보내지 않음)
ALLOWED_TOP = {"index.html", "css", "js", "vendor", "dist"}   # dist = HTML 한 파일(설정의 「받기」 단추)
DEFAULT_PORT = 18610


def web_root():
    """웹 파일 폴더 — 실행 파일(PyInstaller)이면 묶인 web 폴더, 아니면 리포 맨 위 폴더"""
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        return os.path.join(base, "web")
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def _allowed(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path in ("", "/"):
            return True
        top = path.lstrip("/").split("/", 1)[0]
        return top in ALLOWED_TOP and ".." not in path

    def end_headers(self):
        # 판을 올린 뒤 옛 파일이 섞이지 않게 — 내 PC 라 캐시가 필요 없습니다
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # 창에 요청 기록을 늘어놓지 않음
        pass


class Server(http.server.ThreadingHTTPServer):
    # Windows 의 SO_REUSEADDR 는 이미 쓰는 포트에도 겹쳐 붙어 버리므로 끕니다(겹치면 어느 쪽이 답할지 모름)
    allow_reuse_address = os.name != "nt"
    daemon_threads = True


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main(argv=None):
    ap = argparse.ArgumentParser(description="회의록 요약 도우미를 내 PC(127.0.0.1)에서 띄웁니다.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help="포트(기본 %d, 0 이면 빈 포트를 고름)" % DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true", help="브라우저를 열지 않음")
    a = ap.parse_args(argv)

    root = web_root()
    if not os.path.isfile(os.path.join(root, "index.html")):
        print("웹 파일(index.html)을 찾지 못했습니다: " + root)
        return 1
    handler = functools.partial(Handler, directory=root)
    port = a.port or free_port()
    try:
        httpd = Server(("127.0.0.1", port), handler)
    except OSError:
        if not a.port:
            raise
        old, port = port, free_port()
        httpd = Server(("127.0.0.1", port), handler)
        print("포트 %d: 다른 프로그램이 쓰는 중 → 포트 %d 에서 띄웁니다. 이 주소에서는 지난번 회의록이 보이지 않을 수 있습니다(백업 JSON 으로 옮기세요)." % (old, port))
    url = "http://127.0.0.1:%d/" % port

    print("회의록 요약 도우미를 띄웠습니다: " + url)
    print("이 주소는 이 PC 안에서만 열립니다. 회의록은 브라우저 안에만 저장됩니다.")
    print("다 쓰면 이 창을 닫거나 Ctrl+C 를 누르세요. 창을 닫으면 도구가 멈춥니다.")
    sys.stdout.flush()
    if not a.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    print("멈췄습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
