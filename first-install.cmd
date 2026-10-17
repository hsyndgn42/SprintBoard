@echo off
setlocal
cd /d "%~dp0"
if not defined SPRINTBOARD_DB_PATH set "SPRINTBOARD_DB_PATH=%~dp0service\data\sprintboard"
if exist "%SPRINTBOARD_DB_PATH%.mv.db" (
  echo Mevcut veritabani var. Normal baslaticiyi kullanin; veri sifirlanmayacak.
  call start-sprintboard.cmd
  exit /b
)
if exist "PRIVATE-DISTRIBUTION.txt" (
  echo Ozel veri paketinde bos kurulum yapilamaz. Eksik veritabani icin yedegi geri yukleyin.
  pause
  exit /b 1
)
echo Bu islem BOS SprintBoard veritabani olusturur. Eski verileri geri yuklemez.
set /p "confirm=Yeni kurulum icin EVET yazin: "
if /I not "%confirm%"=="EVET" exit /b 1
set "SPRINTBOARD_FIRST_INSTALL=1"
call start-sprintboard.cmd
