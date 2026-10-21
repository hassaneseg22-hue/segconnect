@echo off
setlocal
set MYSQL_EXE=C:\xampp\mysql\bin\mysql.exe
if not exist "%MYSQL_EXE%" (
  echo MySQL XAMPP introuvable: %MYSQL_EXE%
  echo Modifiez MYSQL_EXE dans ce fichier si XAMPP est installe ailleurs.
  pause
  exit /b 1
)
echo Creation de la base SEG Dashboard...
"%MYSQL_EXE%" -u root < mysql-schema.sql
if errorlevel 1 goto :error
echo Import des donnees 2025-2026...
"%MYSQL_EXE%" -u root < mysql-seed.sql
if errorlevel 1 goto :error
echo.
echo Base SEG Dashboard installee avec succes.
echo Si votre MySQL root a un mot de passe, utilisez phpMyAdmin ou adaptez ce script.
pause
exit /b 0
:error
echo Echec de l'installation MySQL.
pause
exit /b 1
