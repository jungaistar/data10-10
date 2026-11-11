@echo off
chcp 65001 >nul
REM 회의록 요약 도우미 - Non Archive 실행 파일 만들기 (Windows 에서 실행)
REM PyInstaller --onedir --noarchive : 한 파일로 압축하지 않은 폴더형, 파이썬 모듈은 .pyc 낱개로 남습니다.
REM 결과: exe-out\MeetingMinutes\MeetingMinutes.exe (폴더째 옮겨 씁니다)
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [오류] python 을 찾지 못했습니다. python.org 에서 Python 3.10 이상을 설치하고 "Add python.exe to PATH" 를 켜 주세요.
  exit /b 1
)

echo [1/3] PyInstaller 준비
python -m pip install --upgrade pyinstaller
if errorlevel 1 exit /b 1

echo [2/3] 실행 파일 만들기 (--onedir --noarchive)
python -m PyInstaller --noconfirm --clean ^
  --onedir --noarchive --console ^
  --name MeetingMinutes ^
  --distpath exe-out --workpath exe-build --specpath exe-build ^
  --add-data "%~dp0..\..\index.html;web" ^
  --add-data "%~dp0..\..\css;web\css" ^
  --add-data "%~dp0..\..\js;web\js" ^
  --add-data "%~dp0..\..\vendor;web\vendor" ^
  --add-data "%~dp0..\..\dist;web\dist" ^
  run_local.py
if errorlevel 1 exit /b 1

echo [3/3] 끝 - exe-out\MeetingMinutes 폴더를 통째로 옮겨 MeetingMinutes.exe 를 더블클릭합니다.
echo        검은 창이 열려 있는 동안 도구가 돕니다. 창을 닫으면 멈춥니다.
endlocal
