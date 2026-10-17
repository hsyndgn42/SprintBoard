@echo off
setlocal
cd /d "%~dp0"
where curl >nul 2>nul
if not errorlevel 1 (
  curl --silent --fail --max-time 2 "http://127.0.0.1:4181/api/health" >nul 2>nul
  if not errorlevel 1 (
    echo SprintBoard zaten calisiyor. Tarayicida aciliyor.
    start "" "http://127.0.0.1:4181/"
    exit /b 0
  )
)
if not exist "target\sprintboard-service-0.1.0.jar" (
  echo SprintBoard paketi bulunamadi. Once README.md icindeki derleme adimlarini calistirin.
  pause
  exit /b 1
)
set "SPRINTBOARD_JAVA=java"
if exist "%~dp0runtime\bin\java.exe" set "SPRINTBOARD_JAVA=%~dp0runtime\bin\java.exe"
"%SPRINTBOARD_JAVA%" -version >nul 2>nul
if errorlevel 1 (
  echo Java 21 bulunamadi. Java 21 kurup yeniden deneyin.
  pause
  exit /b 1
)
if not defined SPRINTBOARD_DB_PATH set "SPRINTBOARD_DB_PATH=%~dp0service\data\sprintboard"
set "SPRINTBOARD_DB_OPTIONS=;IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE"
if "%SPRINTBOARD_FIRST_INSTALL%"=="1" if not exist "PRIVATE-DISTRIBUTION.txt" set "SPRINTBOARD_DB_OPTIONS=;DB_CLOSE_ON_EXIT=FALSE"
if not exist "%SPRINTBOARD_DB_PATH%.mv.db" if not "%SPRINTBOARD_DB_OPTIONS%"==";DB_CLOSE_ON_EXIT=FALSE" (
  echo Veritabani bulunamadi. Bos/eski veriyle baslamamak icin uygulama durduruldu.
  echo DB yolunu ve yedeklerinizi kontrol edin. Ilk kurulum icin README.md adimlarini kullanin.
  pause
  exit /b 1
)
set "SPRINTBOARD_DB_PATH=%SPRINTBOARD_DB_PATH:\=/%"
echo SprintBoard: http://127.0.0.1:4181/
echo Veritabani: service\data\sprintboard.mv.db
echo Kapatmak icin bu pencerede Ctrl+C kullanin.
echo Ilk acilista sayfa hemen yuklenmezse birkac saniye sonra yenileyin.
start "" "http://127.0.0.1:4181/"
"%SPRINTBOARD_JAVA%" -jar "target\sprintboard-service-0.1.0.jar" "--spring.datasource.url=jdbc:h2:file:%SPRINTBOARD_DB_PATH%%SPRINTBOARD_DB_OPTIONS%"
pause
